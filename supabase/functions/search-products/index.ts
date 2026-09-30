// Prompt-driven product suggestions: given the free text someone typed in
// Create or Replace ("a green velvet sofa and a jute rug"), figures out
// which catalog categories they're describing, searches the local catalog
// for matches first (free), and — only when a category comes up short —
// tops it up with a live OpenWeb Ninja search (see import-products) so the
// picker never sits empty just because nothing was imported yet.
//
// Deploy:  supabase functions deploy search-products
// Secrets: RAPIDAPI_KEY, plus the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//          every project already has.
//
// Any signed-in user can call this (unlike import-products, which is
// admin-only) — it's read-mostly, and the live-search fallback is capped
// hard (one small request per detected category, only when the local
// catalog is thin) to keep it cheap against the free-tier request quota.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ordered so more specific phrases ("dining table") are checked before the
// generic ones ("table") that would otherwise swallow them. Not exhaustive —
// see the FALLBACK path below for anything typed that isn't on this list.
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["dining_table", ["dining table", "dining set", "kitchen table"]],
  ["coffee_table", ["coffee table", "side table", "end table", "console table", "nightstand", "bedside table"]],
  ["sofa", ["sofa", "couch", "loveseat", "settee", "sectional"]],
  ["bed", ["bed frame", "headboard", "mattress", "bunk bed", " bed", "bed."]],
  ["chair", ["armchair", "accent chair", "recliner", "ottoman", "bar stool", "stool", "chair"]],
  ["lamp", ["lamp", "lighting", "light fixture", "chandelier", "pendant light", "ceiling light"]],
  ["rug", ["rug", "carpet", "floor mat"]],
  ["storage", [
    "bookshelf", "bookcase", "shelving", "shelf", "cabinet", "wardrobe", "cupboard", "almirah",
    "dresser", "chest of drawers", "drawers", "sideboard", "credenza", "tv unit", "tv stand", "tv console", "storage",
  ]],
  ["decor", ["vase", "wall art", "artwork", "painting", "mirror", "cushion", "curtain", "blinds", "plant pot", "plant", "clock", "decor"]],
  ["coffee_table", ["table"]],
];

const MIN_LOCAL_MATCHES = 4;
const LIVE_TOPUP_LIMIT = 6;
const MAX_CATEGORIES = 2;
const MAX_TOTAL_RESULTS = 14;

// Stripped out of the free-text prompt before it's used as a search query —
// otherwise "i want to change the cupboard" gets searched verbatim and
// returns nothing useful.
const STOPWORDS = new Set([
  "i", "want", "to", "change", "the", "a", "an", "and", "with", "for", "my", "add", "remove", "replace",
  "keep", "it", "as", "in", "on", "into", "some", "of", "this", "that", "these", "those", "make", "get",
  "put", "new", "different", "please", "need", "instead", "there", "here", "room", "up",
]);

// A bare Google Shopping search for a common word ("lamp", "storage") pulls
// back results that are technically that word but nothing to do with home
// decor (a UV nail lamp, storage luggage). Anything whose title contains one
// of these is dropped before it reaches the catalog — the "home decor" text
// appended to fallback queries below only nudges Google's own ranking and
// can't be trusted alone.
const OFF_TOPIC_TITLE_WORDS = [
  "lotion", "cream", "cc cream", "serum", "shampoo", "conditioner", "sunscreen", "moisturizer", "deodorant",
  "bra", "bras", "underwear", "panty", "panties", "lingerie", "boxer briefs", "thong",
  "perfume", "cologne", "makeup", "cosmetic", "cosmetics", "lipstick", "mascara", "nail polish",
  "vitamin", "supplement", "protein powder", "capsules", "tablets",
  "phone case", "iphone", "android phone", "laptop", "headphone", "earbud", "charger cable", "usb cable",
  "sneaker", "sandals", "running shoe", "t-shirt", "jeans", "hoodie", "swimsuit", "bikini",
  "diaper", "baby formula", "pet food", "dog food", "cat food", "cat litter",
  "video game", "game console", "controller",
];

// A deny-list can never be complete — Google Shopping happily returns
// trading cards, a $4,000,000 watch, coffee, plastic cups and a menstrual
// cup for words that aren't furniture synonyms (all of these actually made
// it into the catalog before this list existed, none containing any
// OFF_TOPIC_TITLE_WORDS). So this is the real gate: for a product to reach
// the catalog its title must contain an actual home-decor / furniture word,
// not just avoid a banned one. Named categories (sofa, chair...) already
// come from a targeted search, but this still applies to them too — Google
// Shopping's own ranking is not to be trusted alone, ever.
const HOME_DECOR_ALLOW_WORDS = [
  "sofa", "couch", "loveseat", "settee", "sectional", "chaise", "chesterfield",
  "bed", "headboard", "footboard", "mattress", "bunk bed", "daybed",
  "table", "nightstand", "console", "desk",
  "chair", "armchair", "recliner", "ottoman", "stool", "bench", "footstool", "seater",
  "lamp", "lighting", "light fixture", "chandelier", "pendant", "sconce",
  "rug", "carpet", "floor mat", "runner",
  "bookshelf", "bookcase", "shelf", "shelving", "cabinet", "wardrobe", "cupboard", "almirah",
  "dresser", "drawers", "sideboard", "credenza", "tv unit", "tv stand", "tv console",
  "vase", "wall art", "artwork", "painting", "print", "poster", "mirror", "picture frame", "wall decor",
  "cushion", "throw pillow", "pillow cover", "curtain", "drape", "blinds", "tapestry",
  "plant", "plant pot", "planter", "clock", "candle holder", "candlestick",
  "throw blanket", "bedding", "duvet", "comforter", "quilt", "bed sheet",
  "wallpaper", "room divider", "coat rack", "furniture", "home decor", "decor",
  "coffee table", "dining table", "side table", "end table",
];

const HOME_DECOR_ALLOW_PATTERN = new RegExp(
  `\\b(${HOME_DECOR_ALLOW_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

// Plain substring matching would reject "Antique Brass Body" (contains
// "bras") or "creamy white sofa" (contains "cream") — match whole words only.
const OFF_TOPIC_PATTERN = new RegExp(
  `\\b(${OFF_TOPIC_TITLE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

// A product that a targeted, category-matched search returned (sofa, bed,
// chair...) only needs to clear the deny-list — the search query itself
// already scoped it. The allow-list is the harder gate, and it's reserved
// for "other": that catch-all has no real category to lean on, so a name
// match against known decor words is the only thing standing between
// "brahma" and whatever junk Google Shopping decides is relevant. Applying
// the allow-list to named categories too caused false rejects — a
// "Chesterfield" sofa or a "2 Seater" listing doesn't literally say "sofa".
function looksLikeHomeDecor(title: string, category: string): boolean {
  if (OFF_TOPIC_PATTERN.test(title)) return false;
  if (category === "other") return HOME_DECOR_ALLOW_PATTERN.test(title);
  return true;
}

interface CategoryTarget { category: string; keyword: string; descriptors: string[]; categoryWords: string[] }

/** Everything left of the prompt once filler words are stripped — "large
 *  blue velvet sofa for the living room" becomes ["large","blue","velvet","sofa","living"].
 *  Used both as the live-search query and to check whether already-cached
 *  local products actually match what was described, not just the category. */
function extractDescriptors(promptLower: string): string[] {
  return promptLower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
}

/** Named categories first; if the prompt doesn't mention any of them by a
 *  known synonym, fall back to the generic "other" category and search
 *  live using whatever's left of the prompt after stripping filler words —
 *  so an unanticipated word ("cupboard" before it was added above, or
 *  anything else not yet on the list) still returns *something* instead of
 *  silently going empty.
 *
 *  `keyword` is always the full descriptive phrase, not just the bare
 *  category word — a one-word prompt ("sofa") and a full sentence ("a large
 *  blue velvet sofa for my living room") used to collapse to the exact same
 *  live-search query because only the matched synonym was kept. */
function detectTargets(promptLower: string): CategoryTarget[] {
  const descriptors = extractDescriptors(promptLower);
  const fullQuery = descriptors.join(" ").trim();

  const found: CategoryTarget[] = [];
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (found.some((f) => f.category === category)) continue;
    const hit = keywords.find((k) => promptLower.includes(k));
    if (hit) {
      found.push({ category, keyword: fullQuery || hit.trim(), descriptors, categoryWords: hit.trim().split(/\s+/) });
    }
    if (found.length >= MAX_CATEGORIES) break;
  }
  if (found.length > 0) return found;

  return fullQuery
    ? [{ category: "other", keyword: `${fullQuery} home decor`, descriptors, categoryWords: [] }]
    : [];
}

interface ShoppingProduct {
  product_id?: string;
  product_title?: string;
  price?: string;
  product_page_url?: string;
  product_photos?: string[];
  store_name?: string;
}

function parsePrice(price?: string): number | null {
  if (!price) return null;
  const n = Number(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Please sign in again." }, 401);
  }
  const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Please sign in again." }, 401);

  let body: { prompt?: string; roomType?: string; minPrice?: number; maxPrice?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const promptLower = String(body.prompt ?? "").toLowerCase().trim();
  const roomType = typeof body.roomType === "string" ? body.roomType : undefined;
  const minPrice = typeof body.minPrice === "number" ? body.minPrice : undefined;
  const maxPrice = typeof body.maxPrice === "number" ? body.maxPrice : undefined;

  if (promptLower.length < 4) return json({ products: [] });

  const targets = detectTargets(promptLower);
  if (targets.length === 0) return json({ products: [] });

  const columns = "id, name, category, brand, price, currency, display_image_url, room_types, source_url";
  const all: Record<string, unknown>[] = [];
  const seenIds = new Set<string>();

  const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");

  for (const { category, keyword, descriptors, categoryWords } of targets) {
    let query = admin.from("products").select(columns).eq("category", category).eq("active", true);
    if (roomType) query = query.contains("room_types", [roomType]);
    if (minPrice != null) query = query.gte("price", minPrice);
    if (maxPrice != null) query = query.lte("price", maxPrice);
    const { data: local } = await query.limit(20);

    // Words the prompt used beyond the bare category noun ("blue", "velvet",
    // not "sofa") — what actually makes a description specific. For the
    // "other" catch-all, categoryWords is always empty, so this is always
    // every word the prompt used — which is exactly right: nothing in that
    // bucket has a real category to fall back on, so a name match against
    // the actual words typed is the only thing standing between "brahma"
    // and whatever junk happens to already be cached under "other".
    const extraDescriptors = descriptors.filter((w) => w.length > 2 && !categoryWords.includes(w));
    const scored = (local ?? [])
      // Old imports predate this allow-list — re-check every cached row on
      // the way out too, not just what's freshly inserted below.
      .filter((row) => looksLikeHomeDecor(String(row.name), category))
      .map((row) => ({
        row,
        score: extraDescriptors.filter((w) => String(row.name).toLowerCase().includes(w)).length,
      }))
      .sort((a, b) => b.score - a.score);

    // A plain "sofa" prompt is happy with any cached sofa. A specific one
    // ("blue velvet sofa"), or anything routed through "other", should only
    // surface matches that actually mention those words — otherwise a cache
    // full of unrelated "other" products silently answers a search that
    // doesn't describe any of them.
    const relevant = extraDescriptors.length > 0 ? scored.filter((s) => s.score > 0) : scored;

    for (const { row } of relevant.slice(0, 8)) {
      const id = row.id as string;
      if (!seenIds.has(id)) { seenIds.add(id); all.push(row); }
    }

    const relevantCount = relevant.length;

    if (relevantCount >= MIN_LOCAL_MATCHES || !rapidApiKey) continue;

    // Thin on that category locally — top it up with one small live search.
    try {
      const url = new URL("https://real-time-e-commerce-data.p.rapidapi.com/google-shopping/search");
      url.searchParams.set("q", keyword);
      url.searchParams.set("limit", String(LIVE_TOPUP_LIMIT));
      url.searchParams.set("country", "us");
      if (minPrice != null) url.searchParams.set("min_price", String(minPrice));
      if (maxPrice != null) url.searchParams.set("max_price", String(maxPrice));
      const res = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": rapidApiKey,
          "X-RapidAPI-Host": "real-time-e-commerce-data.p.rapidapi.com",
        },
      });
      if (!res.ok) continue;
      const payload = await res.json();
      const products: ShoppingProduct[] = payload?.data?.products ?? [];

      const skus = products.map((p) => p.product_id).filter((s): s is string => !!s);
      const { data: existing } = skus.length
        ? await admin.from("products").select("id, source_sku").eq("source_retailer", "google_shopping").in("source_sku", skus)
        : { data: [] as { id: string; source_sku: string }[] };
      const existingBySku = new Map((existing ?? []).map((r) => [r.source_sku, r.id]));

      const newRows = products
        .map((p) => {
          const image = p.product_photos?.[0];
          const name = p.product_title?.trim();
          if (!image || !name || !p.product_id || existingBySku.has(p.product_id)) return null;
          if (!looksLikeHomeDecor(name, category)) return null;
          return {
            name,
            category,
            brand: p.store_name ?? null,
            price: parsePrice(p.price),
            currency: "USD",
            display_image_url: image,
            composite_image_url: image,
            source_retailer: "google_shopping",
            source_sku: p.product_id,
            source_url: p.product_page_url ?? null,
            room_types: roomType ? [roomType] : [],
            active: true,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (newRows.length > 0) {
        const { data: inserted } = await admin.from("products").insert(newRows).select(columns);
        for (const row of inserted ?? []) {
          const id = row.id as string;
          if (!seenIds.has(id)) { seenIds.add(id); all.push(row); }
        }
      }
      // Already-imported matches for this SKU set still count as "found" —
      // pull them in too, since they just weren't tagged for this room yet.
      if (existingBySku.size > 0) {
        const { data: already } = await admin.from("products").select(columns).in("id", [...existingBySku.values()]);
        for (const row of already ?? []) {
          const id = row.id as string;
          if (!seenIds.has(id)) { seenIds.add(id); all.push(row); }
        }
      }
    } catch {
      // A flaky live search shouldn't break the whole suggestion — local
      // results (if any) still come back.
    }
  }

  return json({ products: all.slice(0, MAX_TOTAL_RESULTS) });
});
