import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { RoomType } from '@/lib/templates';

// types.ts predates the products table (see 20260926000000_product_catalog.sql).
const db = supabase as unknown as SupabaseClient;

export type ProductCategory =
  | 'sofa' | 'bed' | 'chair' | 'coffee_table' | 'dining_table'
  | 'lamp' | 'rug' | 'storage' | 'decor' | 'other';

export const PRODUCT_CATEGORIES: { key: ProductCategory; label: string }[] = [
  { key: 'sofa', label: 'Sofas' },
  { key: 'bed', label: 'Beds' },
  { key: 'chair', label: 'Chairs' },
  { key: 'coffee_table', label: 'Coffee tables' },
  { key: 'dining_table', label: 'Dining tables' },
  { key: 'lamp', label: 'Lamps' },
  { key: 'rug', label: 'Rugs' },
  { key: 'storage', label: 'Storage' },
  { key: 'decor', label: 'Decor' },
  { key: 'other', label: 'Other' },
];

/** The most a single generation can bring in — Gemini's per-reference-image
 *  fidelity degrades sharply as more pile into one call (verified: 1 product
 *  composites faithfully, 3 gets ignored for a generic restyle — see the
 *  matching cap in supabase/functions/generate-redesign/index.ts). */
export const MAX_PRODUCTS_PER_GENERATION = 2;

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  brand: string | null;
  price: number | null;
  currency: string;
  display_image_url: string;
  room_types: RoomType[];
  /** Where to buy it, if this came from a retailer (imported), not a manual upload. */
  source_url: string | null;
}

export interface BudgetFilter {
  minPrice?: number;
  maxPrice?: number;
}

/** The real-product catalog, filtered by room type when given. Public read —
 *  works signed out too, same as the Templates gallery. */
export function useProducts(roomType?: RoomType, category?: ProductCategory, budget?: BudgetFilter) {
  return useQuery({
    queryKey: ['products', roomType ?? 'all', category ?? 'all', budget?.minPrice ?? null, budget?.maxPrice ?? null],
    queryFn: async () => {
      let query = db
        .from('products')
        .select('id, name, category, brand, price, currency, display_image_url, room_types, source_url')
        .eq('active', true)
        .order('name');
      if (roomType) query = query.contains('room_types', [roomType]);
      if (category) query = query.eq('category', category);
      if (budget?.minPrice != null) query = query.gte('price', budget.minPrice);
      if (budget?.maxPrice != null) query = query.lte('price', budget.maxPrice);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    // Typing into a budget field re-keys this query on every keystroke —
    // keep showing the last result while the new one loads instead of
    // flashing to empty, which was unmounting (and defocusing) the input
    // sitting right next to the grid.
    placeholderData: keepPreviousData,
  });
}

/** Quick budget presets, shown as chips above the min/max fields. Catalog
 *  prices are mostly USD, so the bands are labelled in dollars. */
export const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under $100', max: 100 },
  { label: '$100–300', min: 100, max: 300 },
  { label: '$300–800', min: 300, max: 800 },
  { label: '$800+', min: 800 },
];

/** Alternatives to a chosen product: same category, similar price (±50%),
 *  cheapest first so the list reads as "a bit less / a bit more". */
export function useSimilarProducts(product?: Pick<Product, 'id' | 'category' | 'price'> | null) {
  return useQuery({
    queryKey: ['similar-products', product?.id],
    enabled: !!product,
    queryFn: async () => {
      let query = db
        .from('products')
        .select('id, name, category, brand, price, currency, display_image_url, room_types, source_url')
        .eq('active', true)
        .eq('category', product!.category)
        .neq('id', product!.id)
        .order('price', { ascending: true })
        .limit(8);
      if (product!.price != null) {
        query = query.gte('price', product!.price * 0.5).lte('price', product!.price * 1.5);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
}

export interface SavedProduct extends Product {
  saved_at: string;
}

/** The signed-in user's hearted products ("My picks"), newest first. */
export function useSavedProducts(enabled = true) {
  return useQuery({
    queryKey: ['saved-products'],
    enabled,
    queryFn: async () => {
      const { data, error } = await db
        .from('saved_products')
        .select('created_at, products(id, name, category, brand, price, currency, display_image_url, room_types, source_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.products)
        .map((r) => ({ ...(r.products as unknown as Product), saved_at: r.created_at as string })) as SavedProduct[];
    },
  });
}

export async function setProductSaved(productId: string, saved: boolean) {
  if (saved) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in to save products.');
    const { error } = await db.from('saved_products').upsert({ user_id: user.id, product_id: productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await db.from('saved_products').delete().eq('product_id', productId);
    if (error) throw error;
  }
}

export interface GenerationProductHotspot {
  id: string;
  x: number;
  y: number;
  name: string;
  source_url: string | null;
}

/** Where each real product landed in a finished redesign, for a "shop this"
 *  dot overlay on the result image (see generate-redesign's detectProductPosition).
 *  RLS already scopes generation_products to the caller's own generations. */
export function useGenerationProducts(generationId?: string | null) {
  return useQuery({
    queryKey: ['generation-products', generationId],
    enabled: !!generationId,
    queryFn: async () => {
      const { data, error } = await db
        .from('generation_products')
        .select('product_id, position_x, position_y, products(name, source_url)')
        .eq('generation_id', generationId as string);
      if (error) throw error;
      return (data ?? [])
        .filter((r): r is typeof r & { position_x: number; position_y: number } => r.position_x != null && r.position_y != null)
        .map((r) => ({
          id: r.product_id,
          x: r.position_x,
          y: r.position_y,
          name: (r.products as unknown as { name: string } | null)?.name ?? 'Product',
          source_url: (r.products as unknown as { source_url: string | null } | null)?.source_url ?? null,
        })) as GenerationProductHotspot[];
    },
  });
}

export interface GenerationProductDetail {
  id: string;
  name: string;
  display_image_url: string;
  price: number | null;
  currency: string;
  source_url: string | null;
}

/** Every real product actually used in a generation (regardless of whether
 *  its on-image position was detected) — for a "Shop this look" list, as
 *  opposed to useGenerationProducts' hotspot dots which need a position. */
export function useGenerationProductDetails(generationId?: string | null) {
  return useQuery({
    queryKey: ['generation-product-details', generationId],
    enabled: !!generationId,
    queryFn: async () => {
      const { data, error } = await db
        .from('generation_products')
        .select('product_id, products(name, display_image_url, price, currency, source_url)')
        .eq('generation_id', generationId as string);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const p = r.products as unknown as {
          name: string; display_image_url: string; price: number | null; currency: string; source_url: string | null;
        } | null;
        return {
          id: r.product_id as string,
          name: p?.name ?? 'Product',
          display_image_url: p?.display_image_url ?? '',
          price: p?.price ?? null,
          currency: p?.currency ?? 'GBP',
          source_url: p?.source_url ?? null,
        };
      }) as GenerationProductDetail[];
    },
  });
}

/** A "shop this" link that resolves to the real retailer's own product page
 *  at click time (see supabase/functions/product-link) — never the Google
 *  Shopping listing / reviews page that source_url itself points at for
 *  imported products. Public, no auth needed. */
export function productShopUrl(productId: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/product-link?id=${productId}`;
}

/** Prompt-driven suggestions — given the free text someone typed in Create or
 *  Replace, returns real products matching what they described (see
 *  supabase/functions/search-products). Any signed-in user can call this. */
export async function searchProductsForPrompt(
  input: { prompt: string; roomType?: RoomType } & BudgetFilter,
): Promise<Product[]> {
  const { data, error } = await supabase.functions.invoke('search-products', { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.products ?? []) as Product[];
}

/* ------------------------------------------------------- admin CRUD ------------------------------------------------------- */
// RLS restricts insert/update/delete to admins (public.has_role) — these calls
// simply fail for anyone else, the same trust model as the rest of admin/*.

export interface AdminProduct extends Product {
  composite_image_url: string;
  source_retailer: string | null;
  active: boolean;
  created_at: string;
}

export async function listAllProducts(): Promise<AdminProduct[]> {
  const { data, error } = await db
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminProduct[];
}

export interface ProductInput {
  name: string;
  category: ProductCategory;
  brand: string | null;
  price: number | null;
  currency: string;
  display_image_url: string;
  composite_image_url: string;
  room_types: RoomType[];
  active: boolean;
}

export async function createProduct(input: ProductInput) {
  const { error } = await db.from('products').insert({ ...input, source_retailer: 'manual' });
  if (error) throw error;
}

export async function updateProduct(id: string, input: ProductInput) {
  const { error } = await db.from('products').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) throw error;
}

/** Pulls real products into the catalog from OpenWeb Ninja's Google Shopping
 *  search (see supabase/functions/import-products) — real photos, prices and
 *  retailers, deduped against anything already imported. */
export async function importProducts(input: {
  category: ProductCategory;
  query: string;
  roomTypes: RoomType[];
  limit?: number;
  country?: string;
}): Promise<{ imported: number; message?: string }> {
  const { data, error } = await supabase.functions.invoke('import-products', { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { imported: number; message?: string };
}

export interface BulkImportQuery {
  category: ProductCategory;
  query: string;
  roomTypes: RoomType[];
}

export interface BulkImportQueryResult {
  category: ProductCategory;
  query: string;
  imported: number;
  error?: string;
}

/** Runs a whole list of category+query searches in one call — each one is
 *  still its own RapidAPI request under the hood (see import-products),
 *  just batched server-side instead of clicking the single-query form N
 *  times. Capped server-side (MAX_BATCH_SIZE) so one run can't blow past
 *  a month's API quota by accident. */
export async function bulkImportProducts(
  queries: BulkImportQuery[],
  opts?: { limit?: number; country?: string },
): Promise<{ imported: number; results: BulkImportQueryResult[]; skipped: number }> {
  const { data, error } = await supabase.functions.invoke('import-products', {
    body: { queries, ...opts },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { imported: number; results: BulkImportQueryResult[]; skipped: number };
}

export interface ProductAnalyticsRow {
  productId: string;
  selections: number;
  clicks: number;
}

/** How often each product has been picked into a design (generation_products)
 *  and how often its shop link's been clicked (product_link_clicks) — so the
 *  admin catalog page can show what's actually resonating instead of guessing
 *  what to import more of. Counted client-side; fine at this catalog's size. */
export async function getProductAnalytics(): Promise<ProductAnalyticsRow[]> {
  const [{ data: gp, error: gpErr }, { data: clicks, error: clickErr }] = await Promise.all([
    db.from('generation_products').select('product_id'),
    db.from('product_link_clicks').select('product_id'),
  ]);
  if (gpErr) throw gpErr;
  if (clickErr) throw clickErr;

  const counts = new Map<string, ProductAnalyticsRow>();
  const bump = (id: string, key: 'selections' | 'clicks') => {
    const row = counts.get(id) ?? { productId: id, selections: 0, clicks: 0 };
    row[key] += 1;
    counts.set(id, row);
  };
  for (const row of gp ?? []) bump(row.product_id as string, 'selections');
  for (const row of clicks ?? []) bump(row.product_id as string, 'clicks');
  return [...counts.values()];
}

const PRODUCT_MEDIA_BUCKET = 'product-media';
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class ProductImageError extends Error {}

/** Uploads a product photo to the public product-media bucket and returns its
 *  URL — mirrors src/lib/upload.ts's uploadImage, kept separate since it's a
 *  different bucket with admin-only write policies (see product_catalog migration). */
export async function uploadProductImage(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new ProductImageError('Use a JPG, PNG or WebP photo.');
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new ProductImageError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`);
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(name, file, { cacheControl: '31536000', upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new ProductImageError('Product image storage is not set up yet — run the product_catalog migration.');
    }
    throw new ProductImageError(error.message);
  }
  const { data } = supabase.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(name);
  if (!data?.publicUrl) throw new ProductImageError('Upload succeeded but no public URL came back.');
  return data.publicUrl;
}
