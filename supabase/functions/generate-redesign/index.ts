// Redesigns, cleans up or replaces something in a room photo with Google's
// Gemini image model — one shared endpoint, three `mode`s:
//   - "redesign" (default): a full-room restyle from a template/prompt.
//   - "cleanup": erase whatever's under a painted red mask.
//   - "replace": swap whatever's under a painted red mask for something else.
// Cleanup/Replace mirror the Android app's proven approach exactly (see
// CleanupViewModel.kt's REMOVE_PROMPT and ReplaceViewModel.kt's
// buildPrompt()): the model has no separate mask input, so the mask is
// baked into the photo itself as a solid red overlay client-side (see
// src/components/app/MaskCanvas.tsx), and the prompt just tells the model
// red means "edit here," not "paint it red."
//
// Deploy:  supabase functions deploy generate-redesign
// Secrets: supabase secrets set GEMINI_API_KEY=...
//          (optional) supabase secrets set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
// Then set VITE_LIVE_GENERATION=true in the site's .env and rebuild.
//
// Self-contained (no ../_shared import) so it also deploys from the Supabase
// dashboard's function editor.
//
// Order of work, all server-side so the browser can't skip a step:
//   1. check the caller is signed in and the photo is their own, under 10 MB
//   2. spend one credit — spend_credit() refuses at zero and past the hourly cap
//   3. call the model
//   4. store the result in the private bucket and record it in `generations`
// If 3 or 4 fails, the credit is refunded.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generationBlock, imageModels, loadSettings, logAttempt, type PlatformSettings } from "../_shared/platform.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// Image models, fastest first. Benchmarked on the same bedroom photo + prompt:
//   gemini-3.1-flash-lite-image  3.8s  (restyled the whole room - best result)
//   gemini-2.5-flash-image       9.4s  (left dark window frame / furniture untouched)
//   gemini-3.1-flash-image      10.1s
//   gemini-3-pro-image          20.6s
// A model that's retired, overloaded or timing out just hands over to the next one.
// Override the first choice with the GEMINI_IMAGE_MODEL secret.
const IMAGE_MODELS = [
  ...new Set([
    Deno.env.get("GEMINI_IMAGE_MODEL"),
    "gemini-3.1-flash-lite-image",
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-image",
  ].filter((m): m is string => !!m)),
];
// Small text models that tidy the user's prompt (see beautifyPrompt).
const TEXT_MODELS = [
  ...new Set([
    Deno.env.get("GEMINI_TEXT_MODEL"),
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
  ].filter((m): m is string => !!m)),
];

/** Chunked to avoid blowing the call stack on a 10MB image (spreading a huge
 *  array straight into String.fromCharCode's arguments can overflow). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const BUCKET = "generations";
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// A real catalog product per reference image, on top of the room photo. Kept
// small — Gemini's per-image fidelity degrades sharply as more references
// pile into one call (verified: a single product composites faithfully;
// three at once regularly gets ignored in favour of a generic restyle), so
// this is a deliberate, tightened v1 cap, not a technical ceiling.
const MAX_PRODUCTS = 2;
const PRODUCT_FETCH_TIMEOUT_MS = 8_000;
// Per attempt. Two models + one refusal retry still fits the 150s edge limit.
const GEMINI_TIMEOUT_MS = 40_000;
const BEAUTIFY_TIMEOUT_MS = 4_000;

interface Usage { input: number; output: number }
type GeminiImageResult =
  | { ok: true; b64: string; mimeType: string; usage?: Usage }
  | { ok: false; hardError?: string; refusalReason?: string; textPart?: string; usage?: Usage };

/**
 * One call to the image model. Refusals show up two different ways in
 * Gemini's response — a top-level promptFeedback.blockReason (input
 * rejected outright) or a per-candidate finishReason like IMAGE_SAFETY/
 * PROHIBITED_CONTENT/RECITATION (generation started but the output was
 * filtered) — both are surfaced here so the caller can decide whether to
 * retry, and everything Google gave us is logged so a refusal is
 * diagnosable from the Supabase function logs alone.
 */
async function callGeminiImage(
  model: string,
  fullPrompt: string,
  inputB64: string,
  inputMimeType: string,
  referenceImages?: { b64: string; mimeType: string }[],
): Promise<GeminiImageResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: fullPrompt },
              { inlineData: { mimeType: inputMimeType, data: inputB64 } },
              ...(referenceImages ?? []).map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.b64 } })),
            ],
          }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: controller.signal,
      },
    );
    const aiResult = await aiResponse.json();
    const um = aiResult?.usageMetadata;
    const usage: Usage | undefined = um
      ? { input: Number(um.promptTokenCount ?? 0), output: Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0) }
      : undefined;
    if (!aiResponse.ok) {
      return { ok: false, hardError: aiResult?.error?.message ?? `Image model returned ${aiResponse.status}`, usage };
    }
    const candidate = aiResult?.candidates?.[0];
    const parts: { inlineData?: { data?: string; mimeType?: string }; text?: string }[] =
      candidate?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    const b64 = imagePart?.inlineData?.data;
    if (typeof b64 === "string") {
      return { ok: true, b64, mimeType: imagePart?.inlineData?.mimeType || "image/png", usage };
    }
    const blockReason = aiResult?.promptFeedback?.blockReason;
    const finishReason = candidate?.finishReason;
    const textPart = parts.find((p) => typeof p.text === "string")?.text;
    console.error("generate-redesign: no image in response", {
      model,
      blockReason,
      finishReason,
      safetyRatings: candidate?.safetyRatings ?? aiResult?.promptFeedback?.safetyRatings,
      textPart,
    });
    return { ok: false, refusalReason: blockReason || finishReason, textPart, usage };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, hardError: "Image model timed out" };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Walks the model list until one returns an image. A refusal gets one retry
 * with softened framing on the same model (many are false positives on plain
 * interior photos); a hard error - retired model, overload, timeout - moves
 * straight to the next model.
 */
interface AttemptRecord { model: string; ms: number; ok: boolean; usage?: Usage; error?: string; fallbackUsed: boolean }

async function generateImage(
  fullPrompt: string,
  inputB64: string,
  inputMimeType: string,
  models: string[],
  onAttempt: (a: AttemptRecord) => void,
  referenceImages?: { b64: string; mimeType: string }[],
): Promise<GeminiImageResult> {
  let last: GeminiImageResult = { ok: false, hardError: "No image model available" };
  for (const model of models) {
    const started = Date.now();
    let attempt = await callGeminiImage(model, fullPrompt, inputB64, inputMimeType, referenceImages);
    if (!attempt.ok && attempt.refusalReason) {
      console.error("generate-redesign: refused, retrying with softened framing", { model, refusalReason: attempt.refusalReason });
      attempt = await callGeminiImage(
        model,
        `${fullPrompt} This is a professional interior-design photo-editing request for a legitimate home-renovation context.`,
        inputB64,
        inputMimeType,
        referenceImages,
      );
    }
    onAttempt({
      model,
      ms: Date.now() - started,
      ok: attempt.ok,
      usage: attempt.usage,
      error: attempt.ok ? undefined : (attempt.hardError ?? attempt.refusalReason ?? attempt.textPart ?? "no image"),
      fallbackUsed: model !== models[0],
    });
    if (attempt.ok) {
      console.log("generate-redesign: image ready", { model, ms: Date.now() - started });
      return attempt;
    }
    console.error("generate-redesign: model failed, trying next", { model, ms: Date.now() - started, reason: attempt.hardError ?? attempt.refusalReason });
    last = attempt;
  }
  return last;
}

/** Deterministic tidy-up - also the fallback whenever the rewrite model is slow or down. */
function tidyPrompt(raw: string | undefined): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

const THINKING_VARIANTS: Record<string, unknown>[] = [
  { thinkingConfig: { thinkingLevel: "minimal" }, maxOutputTokens: 120, temperature: 0.3 },
  { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 120, temperature: 0.3 },
  { maxOutputTokens: 1024, temperature: 0.3 },
];

/**
 * Behind-the-scenes prompt clean-up. People type "make it cosy nd add a grean
 * sofa" - this turns it into a clear, concrete instruction for the image
 * model, without the user ever seeing the rewrite (the original is what's
 * stored and shown). It never blocks a generation: on a timeout, an error, or
 * gibberish it quietly falls back to a plain tidy-up of what they typed.
 * Returns "" when the note isn't about changing the room at all.
 */
async function beautifyPrompt(
  raw: string | undefined,
  ctx: { kind: "redesign" | "replace" | "refine"; roomLabel?: string; style?: string; detectedLabel?: string },
  lead?: string,
): Promise<string> {
  const base = tidyPrompt(raw);
  if (!base || !GEMINI_API_KEY) return base;

  const brief = ctx.kind === "replace"
    ? "The note says what should REPLACE a selected object" +
      (ctx.detectedLabel ? ` (currently: ${ctx.detectedLabel})` : "") +
      ". Rewrite it as a short, concrete description of the new object only - type, material, colour, finish, size/shape - e.g. \"a low-profile grey linen sofa with slim oak legs\"."
    : ctx.kind === "refine"
      ? `The note is ONE small follow-up change to a ${ctx.roomLabel ?? "room"} that has already been redesigned` +
        ". Rewrite it as a single short imperative sentence describing only that one change, in concrete visual terms - e.g. \"make the sofa a darker charcoal grey\". Never expand it into a wider restyle."
      : `The note describes changes to a ${ctx.roomLabel ?? "room"}` +
        (ctx.style ? ` being restyled as: ${ctx.style}` : "") +
        ". Rewrite it as one or two clear imperative sentences using concrete visual terms - materials, colours, finishes, lighting, furniture.";
  const system =
    (lead?.trim() ? lead.trim() + " " : "You turn a homeowner's rough note into a precise instruction for an interior-design image editor. ") +
    brief +
    " Fix spelling and grammar, translate to English, and make vague wishes specific - but keep only what they asked for: " +
    "never add extra changes, brands, people, text or logos, and never contradict them. Under 40 words. " +
    "Reply with the rewritten instruction only - no quotes, no markdown, no preamble. " +
    "If the note is gibberish or has nothing to do with changing a room, reply with exactly: NONE";

  for (const model of TEXT_MODELS) {
    for (let v = 0; v < THINKING_VARIANTS.length; v++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), BEAUTIFY_TIMEOUT_MS);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: `Note: ${base}` }] }],
            generationConfig: THINKING_VARIANTS[v],
          }),
          signal: controller.signal,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg: string = j?.error?.message ?? "";
          if (/thinking|invalid argument/i.test(msg)) continue; // wrong thinking knob for this model
          break; // retired / overloaded - next model
        }
        const text: string = (j?.candidates?.[0]?.content?.parts ?? [])
          .map((p: { text?: string }) => p.text ?? "")
          .join("")
          .trim()
          .replace(/^["'`\s]+|["'`\s]+$/g, "");
        if (!text) break;
        if (/^none\.?$/i.test(text)) return "";
        return text.slice(0, 400);
      } catch {
        return base; // timeout / network - don't hold the generation up any longer
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return base;
}

// "refine" is a conversational follow-up on an already-generated result
// (e.g. "make the sofa darker") — same photo pipeline as redesign, but the
// input is the PREVIOUS OUTPUT (not the original room) and the prompt asks
// for one small targeted change instead of a whole-room restyle. Stored as
// an ordinary 'redesign' row (see the insert below) — it's not a new kind
// of generation, just a different way of producing one.
type Mode = "redesign" | "cleanup" | "replace" | "refine";

// Fixed prompt, word-for-word from CleanupViewModel.kt's REMOVE_PROMPT —
// Cleanup only ever removes, so this isn't user-editable.
const CLEANUP_PROMPT =
  "This photo has one or more areas marked with a solid red highlight. Treat the red " +
  "highlight strictly as a location marker for editing, not as a color or design " +
  "element: remove everything under each marked area completely and fill it back in " +
  "naturally so it blends with the surrounding lighting, perspective, and materials. " +
  "This is a mandatory, non-negotiable requirement: do not leave any trace, outline, " +
  "shadow, or partial remnant of the removed object — the marked area must look like " +
  "it was always empty. Make sure no red tint remains anywhere in the final image, " +
  "and keep every other part of the photo exactly as it was.";

// Mirrors ReplaceViewModel.kt's buildPrompt(). detectedLabel is Mantha's own
// label-mask-region guess at what's under the mask (see MaskEditFlow.tsx) —
// naming it explicitly grounds the edit instead of just pointing at "the
// area," so the model is less likely to touch anything beyond that object.
function replacePrompt(userPrompt: string | undefined, detectedLabel: string | undefined): string {
  const subject = detectedLabel?.trim() ? `the ${detectedLabel.trim()}` : "it";
  const instruction = userPrompt?.trim()
    ? `replace ${subject} with: ${userPrompt.trim()}`
    : `replace ${subject} with a single object that fits naturally with the rest of the room's style`;
  return "This photo has an area marked with a solid red highlight. Treat the red highlight " +
    `strictly as a location marker for editing, not as a color or design element: ${instruction}. ` +
    "This is a mandatory, non-negotiable requirement: nothing of the original object under the " +
    "marked area may remain — no trace, outline, or partial remnant of it. Match the surrounding " +
    "lighting, perspective, and materials so the edit blends in, make sure no red tint remains " +
    "anywhere in the final image, and keep every other part of the photo exactly as it was.";
}

// A conversational follow-up on an already-generated redesign — deliberately
// the opposite emphasis of the redesign prompt above (which *demands* an
// obvious whole-room change): here the model must touch as little as
// possible and treat the photo it's given as the finished result, not the
// original room.
function refinePrompt(userPrompt: string | undefined, roomLabel: string | undefined): string {
  const room = roomLabel ?? "room";
  const instruction = userPrompt?.trim()
    ? userPrompt.trim()
    : "make the requested area look more finished and polished";
  return `This photo is an already-redesigned ${room} — treat it as the finished result, not a draft. ` +
    `Make exactly one additional change: ${instruction}. ` +
    "This is a mandatory, non-negotiable requirement: everything else in the photo — every other " +
    "surface, object, color, the architecture, camera angle and perspective — must stay pixel-for-pixel " +
    "as close to the original as possible. Do not restyle, re-light, or otherwise reinterpret the room; " +
    "make only the one change described.";
}

interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  composite_image_url: string;
}

/** Downloads one product's reference photo and base64-encodes it. Returns
 *  null (never throws) on any failure — one bad product image should drop
 *  that product, not fail the whole redesign. */
async function fetchProductReference(
  product: CatalogProduct,
): Promise<{ b64: string; mimeType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(product.composite_image_url, { signal: controller.signal });
    if (!res.ok) {
      console.error("generate-redesign: product image fetch failed", { productId: product.id, status: res.status });
      return null;
    }
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!ALLOWED_TYPES.includes(contentType)) {
      console.error("generate-redesign: product image has unusable content type", { productId: product.id, contentType });
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_INPUT_BYTES) {
      console.error("generate-redesign: product image too large", { productId: product.id, bytes: bytes.byteLength });
      return null;
    }
    return { b64: toBase64(bytes), mimeType: contentType };
  } catch (err) {
    console.error("generate-redesign: product image fetch errored", { productId: product.id, err });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Names each product reference image by position, generalizing the wording
 *  from the earlier (reverted) single-reference "paste a Pinterest link"
 *  feature to N products: tells the model exactly which reference image is
 *  which real product, and to match it faithfully rather than invent a
 *  similar-looking item. `startIndex` is 2 when there's a room photo first
 *  (reference image 1), matching how Gemini receives the parts.
 *
 *  Written as a hard constraint placed *before* the stylistic instructions
 *  (see callers), not appended after them — testing showed a single product
 *  composites faithfully, but with the note tacked on at the end after a
 *  full-room restyle instruction, the model reliably falls back to
 *  inventing generic furniture instead of matching the reference photos,
 *  especially with more than one product at once. */
function productReferenceNote(products: CatalogProduct[], startIndex: number): string {
  if (!products.length) return "";
  const lines = products.map((p, i) =>
    `Reference image ${startIndex + i} is a real photo of the exact ${p.category.replace(/_/g, " ")} named "${p.name}" — ` +
    "place this precise item in the room, matching its real colour, material, shape and proportions as exactly as possible. " +
    "Do not invent a different item, a similar-looking substitute, or a stylistic reinterpretation of it.",
  );
  return "MANDATORY, non-negotiable requirement: " + lines.join(" ") +
    (products.length > 1 ? " Both of these exact products" : " This exact product") +
    " must be clearly visible and easily recognizable in the final image, replacing whatever currently occupies that role. " +
    "This requirement overrides any general style direction below if the two ever conflict. ";
}

const POSITION_TIMEOUT_MS = 8_000;

/** Best-effort: asks a Gemini vision call where a just-placed product ended
 *  up in the finished image, as a normalized (0-1, top-left origin) center
 *  point — so the UI can drop a clickable "shop this" dot on it. Returns
 *  null (never throws) on any failure; a miss just means no dot for that
 *  item, not a failed generation. */
async function detectProductPosition(
  outputB64: string,
  outputMimeType: string,
  category: string,
): Promise<{ x: number; y: number } | null> {
  const prompt =
    `This image contains a ${category.replace(/_/g, " ")}. Reply with ONLY a JSON object ` +
    `{"x": <number>, "y": <number>} giving the normalized center point of that ${category.replace(/_/g, " ")} ` +
    "in the image, where x and y are each between 0 and 1 (0,0 is the top-left corner, 1,1 is the bottom-right). " +
    "No other text, no markdown, no code fences.";
  for (const model of TEXT_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POSITION_TIMEOUT_MS);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: outputMimeType, data: outputB64 } },
            ],
          }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const j = await res.json().catch(() => ({}));
      const text: string = (j?.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim()
        .replace(/^```(?:json)?\s*|\s*```$/g, "");
      const parsed = JSON.parse(text);
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);
      if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        return { x, y };
      }
    } catch {
      // try the next model
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!GEMINI_API_KEY) {
    return json({ error: "Generation isn't switched on yet.", code: "not_configured" }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Please sign in again.", code: "unauthenticated" }, 401);
  }

  // Acting as the user means RLS and auth.uid() apply exactly as in the browser.
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: { user } } = await asUser.auth.getUser();
  if (!user) {
    return json({ error: "Please sign in again.", code: "unauthenticated" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }

  // Switches and limits set in the super admin panel (kill switch, generation flag, daily spend cap).
  const settings: PlatformSettings = await loadSettings(admin);
  const { count: activePlans } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"]);
  const blocked = await generationBlock(admin, settings, (activePlans ?? 0) > 0 ? "paid" : "free");
  if (blocked) return json({ error: blocked.message, code: blocked.code }, blocked.status);
  const models = imageModels(settings, Deno.env.get("GEMINI_IMAGE_MODEL"));

  const { inputPath, maskedPath, templateKey, roomType, roomLabel, stylePrompt, prompt, detectedLabel, mode: rawMode, productIds: rawProductIds } = body as {
    inputPath?: string;
    /** Cleanup/Replace: the red-marked copy the model edits. inputPath stays the clean "before". */
    maskedPath?: string;
    templateKey?: string;
    roomType?: string;
    roomLabel?: string;
    stylePrompt?: string;
    prompt?: string;
    detectedLabel?: string;
    mode?: string;
    /** Redesign/Replace only — real catalog products (see public.products) to bring into the room. */
    productIds?: string[];
  };
  const mode: Mode = rawMode === "cleanup" || rawMode === "replace" || rawMode === "refine" ? rawMode : "redesign";
  const productIds = mode !== "cleanup" && Array.isArray(rawProductIds)
    ? [...new Set(rawProductIds.filter((id): id is string => typeof id === "string"))].slice(0, MAX_PRODUCTS)
    : [];
  // The fastest model ("lite") is tuned to freely reinterpret the whole room
  // rather than follow a precise instruction — great for a plain style
  // redesign, but it's the one most likely to ignore a specific reference
  // product in favour of inventing its own, or to leave a masked object
  // half-erased/half-replaced instead of fully complying with the mask.
  // Cleanup/Replace/Refine and product-referenced redesigns all depend on
  // precise instruction-following, so all four try the more literal/
  // preserving models first instead.
  if (productIds.length || mode === "cleanup" || mode === "replace" || mode === "refine") {
    models.sort((a, b) => Number(a.includes("lite")) - Number(b.includes("lite")));
  }

  // ---- 1. check the photo before any credit is spent ------------------------
  // Only ever read the caller's own uploads.
  const ownPath = (p: unknown): p is string =>
    typeof p === "string" && p.startsWith(`${user.id}/`) && !p.includes("..");
  if (!ownPath(inputPath) || (maskedPath !== undefined && !ownPath(maskedPath))) {
    return json({ error: "That photo couldn't be used. Please upload it again.", code: "bad_image" }, 400);
  }
  // The model edits the red-marked copy when there is one (older clients sent
  // only a masked inputPath, which still works).
  const modelPath = mode !== "redesign" && maskedPath ? maskedPath : inputPath;

  const { data: sourceBlob, error: downloadError } = await admin.storage.from(BUCKET).download(modelPath);
  if (downloadError || !sourceBlob) {
    return json({ error: "That photo couldn't be found. Please upload it again.", code: "bad_image" }, 400);
  }
  if (sourceBlob.size > MAX_INPUT_BYTES) {
    return json({ error: "That photo is over 10MB — please use a smaller one.", code: "image_too_large" }, 413);
  }
  if (sourceBlob.type && !ALLOWED_TYPES.includes(sourceBlob.type)) {
    return json({ error: "Please use a JPG, PNG or WebP photo.", code: "bad_image_type" }, 415);
  }

  // ---- 2. spend (while the prompt gets tidied, so the rewrite costs no extra wait)
  const styleName = stylePrompt?.split(/[.;]/)[0]?.trim();
  const beautifiedPromise: Promise<string> = mode === "cleanup"
    ? Promise.resolve("")
    : beautifyPrompt(prompt, { kind: mode, roomLabel, style: styleName, detectedLabel }, settings.ai.beautifier);
  const [{ error: spendError }, beautified] = await Promise.all([asUser.rpc("spend_credit"), beautifiedPromise]);
  if (spendError) {
    if (/no credits remaining/i.test(spendError.message)) {
      return json({ error: "You're out of credits.", code: "out_of_credits" }, 402);
    }
    if (/rate limited/i.test(spendError.message)) {
      return json({ error: "Too many designs this hour — try again shortly.", code: "rate_limited" }, 429);
    }
    if (/suspended/i.test(spendError.message)) {
      return json({ error: "This account has been suspended.", code: "account_suspended" }, 403);
    }
    console.error("spend_credit failed:", spendError);
    return json({ error: "Couldn't reserve a credit. Please try again.", code: "spend_failed" }, 500);
  }

  const attempts: AttemptRecord[] = [];
  const flushAttempts = async (generationId?: string) => {
    for (const a of attempts) {
      await logAttempt(admin, settings, {
        userId: user.id,
        feature: mode,
        model: a.model,
        ok: a.ok,
        latencyMs: a.ms,
        inputTokens: a.usage?.input,
        outputTokens: a.usage?.output,
        error: a.error,
        generationId: a.ok ? generationId : undefined,
        fallbackUsed: a.fallbackUsed,
      });
    }
  };

  try {
    // ---- 3. generate ------------------------------------------------------
    // Real catalog products to bring into the room, if any were chosen. Looked
    // up fresh from the DB (never trust a client-supplied image URL) and
    // fetched in parallel; a product that fails to load is silently dropped
    // rather than failing the whole redesign — it's an enhancement, not the
    // primary photo.
    const usedProducts: CatalogProduct[] = [];
    const productReferenceImages: { b64: string; mimeType: string }[] = [];
    if (productIds.length) {
      const { data: catalogProducts } = await admin
        .from("products")
        .select("id, name, category, composite_image_url")
        .eq("active", true)
        .in("id", productIds);
      if (catalogProducts?.length) {
        const fetched = await Promise.all(
          catalogProducts.map(async (p) => ({ product: p as CatalogProduct, image: await fetchProductReference(p as CatalogProduct) })),
        );
        for (const { product, image } of fetched) {
          if (image) {
            usedProducts.push(product);
            productReferenceImages.push(image);
          }
        }
      }
    }

    const productNote = productReferenceNote(usedProducts, 2);
    const fullPrompt = mode === "cleanup"
      ? CLEANUP_PROMPT
      : mode === "replace"
        ? productNote + replacePrompt(beautified, detectedLabel)
        : mode === "refine"
          ? productNote + refinePrompt(beautified, roomLabel)
          : productNote + [
          `Redesign this ${roomLabel ?? "room"} as a photorealistic interior photograph.`,
          stylePrompt ? `Style: ${stylePrompt}.` : "",
          beautified ? `Requested changes: ${beautified.replace(/[.\s]+$/, "")}.` : "",
          "Keep the room's architecture, windows, doors, camera angle and perspective exactly the same, but the",
          "redesign itself must be clearly and obviously visible — change the wall color or finish and the",
          "flooring as part of the style, not just minor styling touches.",
        ].filter(Boolean).join(" ");

    const inputMimeType = sourceBlob.type || "image/png";
    const inputB64 = toBase64(new Uint8Array(await sourceBlob.arrayBuffer()));

    const attempt = await generateImage(fullPrompt, inputB64, inputMimeType, models, (a) => attempts.push(a), productReferenceImages);
    if (!attempt.ok) {
      throw new Error(
        attempt.hardError ??
          (attempt.refusalReason
            ? `Image model refused the request: ${attempt.refusalReason}`
            : attempt.textPart
              ? `Image model returned text instead of an image: ${attempt.textPart.slice(0, 200)}`
              : "Image model returned no image"),
      );
    }
    const { b64 } = attempt;
    const outputMimeType = attempt.mimeType;
    const outputExt = outputMimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";

    // ---- 4. store + record -------------------------------------------------
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const outputPath = `${user.id}/out-${Date.now()}.${outputExt}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(outputPath, bytes, { contentType: outputMimeType });
    if (uploadError) throw uploadError;

    const { data: generation, error: insertError } = await asUser
      .from("generations")
      .insert({
        user_id: user.id,
        input_image_url: inputPath,
        output_image_url: outputPath,
        // Refine carries the original turn's style/room forward so it reads
        // and behaves exactly like the redesign it's building on — it's
        // stored as one, not tracked as a separate kind (see the Mode comment).
        template_key: mode === "redesign" || mode === "refine" ? (templateKey ?? null) : null,
        room_type: mode === "redesign" || mode === "refine" ? (roomType ?? null) : null,
        // Cleanup has no user prompt (fixed instruction); every other mode does.
        prompt: mode === "cleanup" ? null : (prompt ?? null),
        status: "completed",
        kind: mode === "refine" ? "redesign" : mode,
      })
      .select()
      .single();
    if (insertError) throw insertError;
    await flushAttempts(generation?.id);

    if (usedProducts.length && generation?.id) {
      // Best-effort — figures out where each product actually landed in the
      // finished image so the UI can drop a clickable "shop this" dot on it.
      // A miss here never blocks recording the generation itself.
      const positions = await Promise.all(
        usedProducts.map((p) => detectProductPosition(b64, outputMimeType, p.category)),
      );
      const { error: gpError } = await admin
        .from("generation_products")
        .insert(usedProducts.map((p, i) => ({
          generation_id: generation.id,
          product_id: p.id,
          position_x: positions[i]?.x ?? null,
          position_y: positions[i]?.y ?? null,
        })));
      if (gpError) console.error("generate-redesign: couldn't record generation_products", gpError);
    }

    // The red-marked copy was only an instruction for the model. Best effort.
    if (modelPath !== inputPath) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove([modelPath]);
      if (removeError) console.error("generate-redesign: couldn't remove masked copy", removeError);
    }

    return json({ generation });
  } catch (err) {
    console.error("generate-redesign failed:", err);
    await flushAttempts();
    if (attempts.length === 0) {
      await logAttempt(admin, settings, { userId: user.id, feature: mode, model: null, ok: false, latencyMs: 0, error: err instanceof Error ? err.message : "failed" });
    }
    const { error: refundError } = await admin
      .from("credit_ledger")
      .insert({ user_id: user.id, delta: 1, reason: "refund" });
    if (refundError) console.error("REFUND FAILED — credit owed to", user.id, refundError);

    const message = err instanceof Error ? err.message : "";
    const refused = /refused the request|returned text instead of an image/.test(message);
    const timedOut = /timed out/.test(message);
    return json(
      {
        error: refused
          ? "Mantha's safety filters blocked that edit — your credit has been refunded. Try painting a smaller area or a different photo."
          : timedOut
            ? "That took too long — your credit has been refunded. Please try again."
            : "That design didn't work — your credit has been refunded. Please try again.",
        code: refused ? "model_refused" : timedOut ? "model_timeout" : "generation_failed",
      },
      502,
    );
  }
});
