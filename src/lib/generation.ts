import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { TEMPLATES, roomLabel, templateByKey, type RoomType } from '@/lib/templates';
import { downscaleFile, downscaleImage } from '@/lib/image';

/**
 * Everything the app needs for credits, generations and room photos.
 *
 * Credits live in the append-only credit_ledger: signup +2, each generation
 * -1, paid renewal +20. credit_balance() is the source of truth; spend_credit()
 * is the only way to spend, and it refuses at zero or past the hourly cap, so
 * both limits hold server-side.
 *
 * Room photos live in the PRIVATE `generations` bucket. The database stores the
 * bucket path (<user_id>/<file>), and images are shown through short-lived
 * signed URLs.
 */

export const FREE_SIGNUP_CREDITS = 2;
/** Mirrors app_settings.ai.referral_bonus's default (20260927020000_referral_credits.sql) — display only, the real grant is server-side. */
export const REFERRAL_BONUS_CREDITS = 1;
/** Mirrors the cap inside spend_credit() (20260914130000_generation_rate_limit.sql). */
export const HOURLY_GENERATION_LIMIT = 10;

// src/integrations/supabase/types.ts is generated and predates the Phase 2
// migrations, so it doesn't know the generations table or the credit RPCs yet.
// Use an untyped handle here instead of casting at every call site.
const db = supabase as unknown as SupabaseClient;

const BUCKET = 'generations';
const SIGNED_URL_TTL_S = 60 * 60;

export type GenerationStatus = 'pending' | 'completed' | 'failed';

export interface Generation {
  id: string;
  user_id: string;
  /** Bucket path of the uploaded photo (or, for old rows, a full URL). */
  input_image_url: string;
  /** Bucket path, or a site asset like /assets/samples/1.jpg (placeholder). */
  output_image_url: string | null;
  template_key: string | null;
  room_type: RoomType | null;
  prompt: string | null;
  status: GenerationStatus;
  created_at: string;
  /** What produced this row. Absent/undefined on rows from before repaint shipped — treat as 'redesign'. */
  kind?: 'redesign' | 'repaint_floor' | 'repaint_walls' | 'cleanup' | 'replace';
  /** Repaint session id, so trying a second texture/color reuses the same room photo. */
  session_id?: string | null;
  /** The Repaint microservice's X-Repaint-Meta payload (coverage, timing, etc). Redesign rows leave this null. */
  meta?: Record<string, unknown> | null;
  /** Set once this design has a public share link (thinkdecor.app/r/<slug>); null until shared. */
  share_slug?: string | null;
  shared_at?: string | null;
}

export class OutOfCreditsError extends Error {
  constructor() {
    super('No credits remaining');
    this.name = 'OutOfCreditsError';
  }
}

export class RateLimitError extends Error {
  constructor() {
    super(`You've reached ${HOURLY_GENERATION_LIMIT} designs this hour. Take a breather and try again shortly.`);
    this.name = 'RateLimitError';
  }
}

/** A failure with a message that's safe to show the user as-is. */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationError';
  }
}

/** True when a required migration hasn't been applied to this project yet. */
export function isSetupError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(e.code ?? '') ||
    /does not exist|could not find the .*(table|function|column)/i.test(e.message ?? '')
  );
}

const retryUnlessSetup = (count: number, err: unknown) => !isSetupError(err) && count < 2;

function spendError(message: string): Error | null {
  if (/no credits remaining/i.test(message)) return new OutOfCreditsError();
  if (/rate limited/i.test(message)) return new RateLimitError();
  if (/suspended/i.test(message)) return new GenerationError('This account has been suspended.');
  return null;
}

/* ------------------------------------------------------------------ */
/* Private photos                                                      */
/* ------------------------------------------------------------------ */

/**
 * A bucket path needs signing before it can be shown. Anything that already
 * starts with http, /, blob: or data: is displayable as-is: site sample
 * images, local upload previews, or URLs from before the bucket went private.
 */
export function isStoragePath(ref?: string | null): ref is string {
  return !!ref && !/^(https?:|\/|blob:|data:)/.test(ref);
}

async function signedUrlFor(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S);
  if (error) throw error;
  return data.signedUrl;
}

/** Displayable URL for a stored photo reference; undefined while it's being signed. */
export function useStoredImageUrl(ref?: string | null): string | undefined {
  const needsSigning = isStoragePath(ref);
  const { data } = useQuery({
    queryKey: ['signed-url', ref],
    enabled: needsSigning,
    // Refresh a few minutes before the signed URL itself expires.
    staleTime: (SIGNED_URL_TTL_S - 300) * 1000,
    gcTime: SIGNED_URL_TTL_S * 1000,
    queryFn: () => signedUrlFor(ref as string),
  });
  if (!ref) return undefined;
  return needsSigning ? data : ref;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function useCreditBalance() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['credits', user?.id],
    enabled: !!user,
    retry: retryUnlessSetup,
    // A purchase or refund is granted server-side by the Stripe webhook, not by
    // anything the browser does — poll so the balance catches up on its own
    // instead of only refreshing when the user happens to navigate.
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await db.rpc('credit_balance', { _user_id: user!.id });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useGenerations(limit?: number) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['generations', user?.id, limit ?? 'all'],
    enabled: !!user,
    retry: retryUnlessSetup,
    queryFn: async () => {
      let query = db
        .from('generations')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Generation[];
    },
  });
}

/**
 * Live updates for Overview/Projects — without this, a generation finishing
 * (in this tab or another) only shows up after something else triggers a
 * refetch. RLS applies to the realtime changefeed exactly as it does to a
 * normal read, so the `user_id=eq.` filter here is belt-and-braces, not the
 * only thing stopping a visitor seeing someone else's rows.
 *
 * Mounted once in AppShell so every /app page benefits, not once per page.
 */
export function useGenerationsRealtime() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`generations-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'generations', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['generations'] });
          queryClient.invalidateQueries({ queryKey: ['credits'] });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);
}

export function useDeleteGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (generation: Generation) => {
      const { error } = await db.from('generations').delete().eq('id', generation.id);
      if (error) throw error;

      // Tidy up the stored files. The output belongs to this design alone; the
      // input photo is shared by regenerations, so only remove it once no other
      // design uses it. Best effort: the row is already gone either way.
      const toRemove: string[] = [];
      if (isStoragePath(generation.output_image_url)) toRemove.push(generation.output_image_url);
      if (isStoragePath(generation.input_image_url)) {
        const { count } = await db
          .from('generations')
          .select('id', { count: 'exact', head: true })
          .eq('input_image_url', generation.input_image_url);
        if (!count) toRemove.push(generation.input_image_url);
      }
      if (toRemove.length) await supabase.storage.from(BUCKET).remove(toRemove);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['generations'] }),
  });
}

export function shareUrlFor(slug: string): string {
  return `${window.location.origin}/r/${slug}`;
}

export function referralUrlFor(code: string): string {
  return `${window.location.origin}/signup?ref=${code}`;
}

/** The signed-in user's own referral code (profiles.referral_code, assigned
 *  by handle_new_user — 20260927020000_referral_credits.sql). */
export function useReferralCode() {
  return useQuery({
    queryKey: ['referral-code'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await db.from('profiles').select('referral_code').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return (data?.referral_code as string | null | undefined) ?? null;
    },
  });
}

/** How many people have signed up using this user's referral code. */
export function useReferralCount() {
  return useQuery({
    queryKey: ['referral-count'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count, error } = await db
        .from('referrals')
        .select('referee_id', { count: 'exact', head: true })
        .eq('referrer_id', user.id);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Turns a design's public share link on (assigning a slug the first time)
 *  or off. RLS lets the owner update only their own row (20260927010000). */
export function useShareGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ generation, shared }: { generation: Generation; shared: boolean }) => {
      if (!shared) {
        const { error } = await db.from('generations').update({ share_slug: null }).eq('id', generation.id);
        if (error) throw error;
        return null;
      }
      if (generation.share_slug) return generation.share_slug;
      const slug = generation.share_slug ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const { error } = await db
        .from('generations')
        .update({ share_slug: slug, shared_at: new Date().toISOString() })
        .eq('id', generation.id);
      if (error) throw error;
      return slug;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['generations'] }),
  });
}

/* ------------------------------------------------------------------ */
/* Generating                                                          */
/* ------------------------------------------------------------------ */

export interface GenerateRequest {
  userId: string;
  /** A fresh File to upload, or the bucket path of a photo already stored (regenerate/refine). */
  image: File | string;
  templateKey: string;
  roomType: RoomType;
  prompt?: string;
  /** Increments on each regenerate of the same photo, so placeholder variations differ. */
  attempt?: number;
  /** Real catalog products (see `products` table) to bring into the room, up to 3. */
  productIds?: string[];
  /** 'refine': a small conversational follow-up on an existing result — `image`
   *  is that result's OUTPUT (not the original room), and `prompt` is the one
   *  change to make, e.g. "make the sofa darker". Omit for a normal redesign. */
  mode?: 'refine';
}

/**
 * Two generation paths:
 *  - Live: the `generate-redesign` edge function checks the photo, spends the
 *    credit, calls the image model, stores the result, and refunds the credit
 *    if the model fails. Switched on with VITE_LIVE_GENERATION=true once the
 *    function is deployed with its GEMINI_API_KEY secret.
 *  - Placeholder (default): returns a sample design after a short delay, so
 *    credits, history and the library all work before a model is connected.
 */
// Live is the default. This used to be opt-IN (=== 'true'), so a deploy that forgot
// the env var (Vercel didn't have it) silently shipped the placeholder generator:
// real credits spent, sample images returned. Set VITE_LIVE_GENERATION=false only
// to run the placeholder locally without the edge function.
export const IS_PLACEHOLDER_GENERATOR = import.meta.env.VITE_LIVE_GENERATION === 'false';

async function runPlaceholderGenerator(templateKey: string, attempt: number): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const pool = TEMPLATES.map((t) => t.image);
  const start = Math.max(0, TEMPLATES.findIndex((t) => t.key === templateKey));
  return pool[(start + attempt) % pool.length];
}

/** Any user-uploaded photo needs the same sanitising before it becomes a bucket path. */
export function safeFileName(name: string) {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  return `${Date.now()}-${cleaned || 'room.jpg'}`;
}

/** supabase.functions.invoke hides a non-2xx JSON body in error.context. */
export async function readFunctionError(error: unknown): Promise<{ error?: string; code?: string } | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      return await context.json();
    } catch {
      return null;
    }
  }
  return null;
}

export async function generateRedesign({
  userId,
  image,
  templateKey,
  roomType,
  prompt,
  attempt = 0,
  productIds,
  mode,
}: GenerateRequest): Promise<Generation> {
  // 1. The source photo — uploaded once to the private bucket, then reused by
  //    every refinement of the same room.
  let inputPath: string;
  if (typeof image === 'string') {
    inputPath = image;
  } else {
    // Full-size phone photos only make the upload and the model slower.
    const upload = await downscaleFile(image);
    inputPath = `${userId}/${safeFileName(upload.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(inputPath, upload, { contentType: upload.type || undefined });
    if (uploadError) throw uploadError;
  }

  // Live: the edge function does check → spend → generate → store → record.
  if (!IS_PLACEHOLDER_GENERATOR) {
    const template = templateByKey(templateKey);
    const { data, error } = await supabase.functions.invoke('generate-redesign', {
      body: {
        inputPath,
        templateKey,
        roomType,
        roomLabel: roomLabel(roomType),
        stylePrompt: mode === 'refine' ? undefined : template?.prompt,
        prompt: prompt?.trim() || undefined,
        productIds: productIds?.length ? productIds : undefined,
        mode,
      },
    });
    if (error) {
      const payload = await readFunctionError(error);
      if (payload?.code === 'out_of_credits') throw new OutOfCreditsError();
      if (payload?.code === 'rate_limited') throw new RateLimitError();
      throw new GenerationError(payload?.error ?? 'Generation failed. Please try again.');
    }
    return (data as { generation: Generation }).generation;
  }

  // 2. Spend a credit (placeholder path). The database refuses at zero and
  //    past the hourly cap.
  const { error: spendFailure } = await db.rpc('spend_credit');
  if (spendFailure) throw spendError(spendFailure.message) ?? spendFailure;

  // 3. Generate.
  const outputRef = await runPlaceholderGenerator(templateKey, attempt);

  // 4. Record it in the library.
  const { data, error } = await db
    .from('generations')
    .insert({
      user_id: userId,
      input_image_url: inputPath,
      output_image_url: outputRef,
      template_key: templateKey,
      room_type: roomType,
      prompt: prompt?.trim() || null,
      status: 'completed',
    })
    .select()
    .single();

  if (error) throw error;
  return data as Generation;
}

export function useGenerate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateRedesign,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
    },
  });
}

/** Blob -> base64 (no data: prefix), for sending a painted photo inline instead of via storage. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Auto-detection step ahead of Cleanup/Replace's actual generation: names
 * whatever's under the red mask so the user sees what Mantha found before
 * they commit a credit to editing it. No credit spent, no storage write —
 * see supabase/functions/label-mask-region.
 */
/** Detection is a nicety, never a gate — give up rather than keep the user waiting. */
const LABEL_TIMEOUT_MS = 15_000;

export async function labelMaskRegion(
  image: Blob,
  box?: { x0: number; y0: number; x1: number; y1: number },
): Promise<string> {
  const base64 = await blobToBase64(image);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new GenerationError('Detection timed out.')), LABEL_TIMEOUT_MS),
  );
  const { data, error } = await Promise.race([
    supabase.functions.invoke('label-mask-region', {
      body: { maskedImage: base64, mimeType: image.type || 'image/jpeg', box },
    }),
    timeout,
  ]);
  if (error) {
    const payload = await readFunctionError(error);
    throw new GenerationError(payload?.error ?? "Couldn't detect that.");
  }
  return (data as { label: string }).label;
}

interface MaskEditRequest {
  userId: string;
  /** The clean photo: a fresh upload, or the bucket path of one already stored. Recorded as the "before". */
  cleanImage: File | Blob | string;
  /** The photo with the red mask already baked in — see MaskCanvas.exportMasked(). Only the model sees it. */
  maskedImage: Blob;
  mode: 'cleanup' | 'replace';
  /** Replace only — what to put in the masked area. Empty lets the model pick something fitting. */
  prompt?: string;
  /** Replace only — Gemini's own label for what's under the mask, for a better-grounded server prompt. */
  detectedLabel?: string;
  /** Replace only — real catalog products to composite in, same as Create. */
  productIds?: string[];
}

/**
 * Cleanup and Replace, unlike Create, are always live — there's no sensible
 * placeholder for "erase what I just painted over," so (like Repaint) this
 * calls generate-redesign directly rather than branching on
 * IS_PLACEHOLDER_GENERATOR. Same edge function as a plain redesign, just
 * with `mode` set — see the comment at the top of that function for why.
 */
export async function generateMaskEdit({
  userId, cleanImage, maskedImage, mode, prompt, detectedLabel, productIds,
}: MaskEditRequest): Promise<Generation> {
  // The clean photo is what Projects shows as "before"; the red-marked copy is
  // only an instruction for the model and is deleted server-side afterwards.
  let inputPath: string;
  if (typeof cleanImage === 'string') {
    inputPath = cleanImage;
  } else {
    const clean = await downscaleImage(cleanImage);
    const name = cleanImage instanceof File ? cleanImage.name.replace(/\.[^.]+$/, '') : mode;
    inputPath = `${userId}/${safeFileName(`${name}.${clean.type === 'image/jpeg' ? 'jpg' : 'png'}`)}`;
    const { error: cleanUploadError } = await supabase.storage
      .from(BUCKET)
      .upload(inputPath, clean, { contentType: clean.type || undefined });
    if (cleanUploadError) throw cleanUploadError;
  }

  const maskedPath = `${userId}/mask-${safeFileName(`${mode}.png`)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(maskedPath, maskedImage, { contentType: 'image/png' });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.functions.invoke('generate-redesign', {
    body: {
      inputPath, maskedPath, mode, prompt: prompt?.trim() || undefined, detectedLabel: detectedLabel || undefined,
      productIds: productIds?.length ? productIds : undefined,
    },
  });
  if (error) {
    const payload = await readFunctionError(error);
    if (payload?.code === 'out_of_credits') throw new OutOfCreditsError();
    if (payload?.code === 'rate_limited') throw new RateLimitError();
    throw new GenerationError(payload?.error ?? 'Generation failed. Please try again.');
  }
  return (data as { generation: Generation }).generation;
}

export function useGenerateMaskEdit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateMaskEdit,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export async function downloadImage(url: string, fileName: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Cross-origin or offline — opening the image still lets them save it.
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** Download a stored photo reference, signing it first if it's in the private bucket. */
export async function downloadStoredImage(ref: string, fileName: string) {
  const url = isStoragePath(ref) ? await signedUrlFor(ref) : ref;
  await downloadImage(url, fileName);
}

/** Download file name with the stored image's real extension (Gemini returns PNG or JPEG). */
export function fileNameFor(ref: string, base: string) {
  const ext = /\.(png|jpe?g|webp)(?:$|\?)/i.exec(ref)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'jpg';
  return `${base}.${ext}`;
}

/** Card/dialog title for a saved design — tells redesigns, cleanups and replacements apart. */
export function titleFor(g: Pick<Generation, 'kind' | 'template_key' | 'room_type' | 'prompt'>) {
  if (g.kind === 'cleanup') return 'Cleanup';
  if (g.kind === 'replace') return g.prompt?.trim() ? `Replace · ${g.prompt.trim()}` : 'Replace';
  const style = templateByKey(g.template_key)?.label ?? 'Custom';
  const room = roomLabel(g.room_type);
  return room ? `${style} · ${room}` : style;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
