// Pulls real products into the catalog from OpenWeb Ninja's Real-Time
// E-commerce Data API (Google Shopping search, which aggregates Wayfair,
// Amazon, Walmart, Home Depot, Costco and more under one endpoint — see
// supabase/migrations/20260926000000_product_catalog.sql for why).
//
// Two request shapes, same endpoint:
//   - single: { category, query, roomTypes?, limit?, country? }        -> { imported, message? }
//   - batch:  { queries: { category, query, roomTypes? }[], limit?, country? } -> { imported, results: [...] }
// Each item in a batch is one RapidAPI call (one search = up to `limit`,
// max 40, results) — the batch is capped at MAX_BATCH_SIZE items per
// invocation so one click can't blow through a month's quota by accident;
// run it again for the next slice of queries.
//
// Deploy:  supabase functions deploy import-products
// Secrets: RAPIDAPI_KEY (RapidAPI key for the "Real-Time E-commerce Data" API)
//          beyond the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY every project has.
//
// The caller must already hold the admin role — checked here, server-side,
// same pattern as admin-users. Self-contained (no ../_shared import) so it
// also deploys from the Supabase dashboard's function editor.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "sofa", "bed", "chair", "coffee_table", "dining_table",
  "lamp", "rug", "storage", "decor", "other",
] as const;
type Category = typeof CATEGORIES[number];

const CURRENCY_BY_COUNTRY: Record<string, string> = { us: "USD", gb: "GBP", ca: "CAD", au: "AUD" };

// A bare Google Shopping search for a common word ("lamp", "storage") pulls
// back results that are technically that word but nothing to do with home
// decor (a UV nail lamp, storage luggage). Anything whose title contains one
// of these is dropped before it ever reaches the catalog. Kept in sync with
// the same list in search-products/index.ts.
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

// Plain substring matching would reject "Antique Brass Body" (contains
// "bras") or "creamy white sofa" (contains "cream") — match whole words only.
const OFF_TOPIC_PATTERN = new RegExp(
  `\\b(${OFF_TOPIC_TITLE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

function looksLikeHomeDecor(title: string): boolean {
  return !OFF_TOPIC_PATTERN.test(title);
}

// One RapidAPI call per item — kept small enough that a single batch run
// can't silently exhaust a whole month's quota (the free plan is 100
// calls/month total, shared with live "shop this" link resolution).
const MAX_BATCH_SIZE = 25;

interface ShoppingProduct {
  product_id?: string;
  product_title?: string;
  price?: string;
  product_page_url?: string;
  product_photos?: string[];
  store_name?: string;
}

interface QueryItem {
  category: string;
  query: string;
  roomTypes?: string[];
}

interface QueryResult {
  category: string;
  query: string;
  imported: number;
  error?: string;
}

function parsePrice(price?: string): number | null {
  if (!price) return null;
  const n = Number(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Runs one search + dedupe + insert. Never throws — failures come back as
 *  { imported: 0, error } so one bad query doesn't abort the rest of a batch. */
// deno-lint-ignore no-explicit-any
async function runOneImport(
  admin: any,
  rapidApiKey: string,
  item: { category: Category; query: string; roomTypes: string[]; limit: number; country: string },
): Promise<QueryResult> {
  const { category, query, roomTypes, limit, country } = item;
  const base: QueryResult = { category, query, imported: 0 };

  const url = new URL("https://real-time-e-commerce-data.p.rapidapi.com/google-shopping/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("country", country);

  let apiData: { products?: ShoppingProduct[] };
  try {
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": "real-time-e-commerce-data.p.rapidapi.com",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ...base, error: `Search failed (${res.status}): ${text.slice(0, 200)}` };
    }
    const payload = await res.json();
    apiData = payload?.data ?? {};
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Couldn't reach the product search API." };
  }

  const products = apiData.products ?? [];
  const currency = CURRENCY_BY_COUNTRY[country] ?? "USD";

  const rows = products
    .map((p) => {
      const image = p.product_photos?.[0];
      const name = p.product_title?.trim();
      if (!image || !name || !p.product_id) return null;
      if (!looksLikeHomeDecor(name)) return null;
      return {
        name,
        category,
        brand: p.store_name ?? null,
        price: parsePrice(p.price),
        currency,
        display_image_url: image,
        composite_image_url: image,
        source_retailer: "google_shopping",
        source_sku: p.product_id,
        source_url: p.product_page_url ?? null,
        room_types: roomTypes,
        active: true,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return base;

  // products_source_sku_uniq is a partial unique index (where source_sku is
  // not null), which plain PostgREST upsert can't target via ON CONFLICT —
  // so dedupe by hand instead: drop anything already ingested from this SKU.
  const skus = rows.map((r) => r.source_sku);
  const { data: existing, error: existingErr } = await admin
    .from("products")
    .select("source_sku")
    .eq("source_retailer", "google_shopping")
    .in("source_sku", skus);
  if (existingErr) return { ...base, error: existingErr.message };

  const alreadyImported = new Set((existing ?? []).map((r: { source_sku: string }) => r.source_sku));
  const newRows = rows.filter((r) => !alreadyImported.has(r.source_sku));
  if (newRows.length === 0) return base;

  const { error } = await admin.from("products").insert(newRows);
  if (error) return { ...base, error: error.message };

  return { ...base, imported: newRows.length };
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

  const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
  if (!rapidApiKey) {
    return json({ error: "RAPIDAPI_KEY is not configured on the server." }, 500);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Please sign in again." }, 401);
  }

  const { data: { user: caller } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!caller) {
    return json({ error: "Please sign in again." }, 401);
  }

  const { data: callerRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!callerRole) {
    return json({ error: "This account does not have admin access." }, 403);
  }

  let body: {
    category?: string; query?: string; roomTypes?: string[];
    queries?: QueryItem[];
    limit?: number; country?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 40);
  const country = (body.country ?? "us").toLowerCase();

  // ---- batch shape ----------------------------------------------------
  if (Array.isArray(body.queries)) {
    const items = body.queries.slice(0, MAX_BATCH_SIZE);
    if (items.length === 0) {
      return json({ error: "queries must contain at least one { category, query }." }, 400);
    }
    for (const it of items) {
      if (!CATEGORIES.includes(it.category as Category) || !String(it.query ?? "").trim()) {
        return json({ error: `Every query needs a valid category (${CATEGORIES.join(", ")}) and a non-empty query.` }, 400);
      }
    }
    const results: QueryResult[] = [];
    for (const it of items) {
      const roomTypes = Array.isArray(it.roomTypes) ? it.roomTypes.filter((r) => typeof r === "string") : [];
      // deno-lint-ignore no-await-in-loop
      results.push(await runOneImport(admin, rapidApiKey, {
        category: it.category as Category,
        query: String(it.query).trim(),
        roomTypes,
        limit,
        country,
      }));
    }

    return json({
      imported: results.reduce((sum, r) => sum + r.imported, 0),
      results,
      skipped: Math.max(0, (body.queries?.length ?? 0) - items.length),
    });
  }

  // ---- single shape (unchanged, kept for the existing admin form) -----
  const category = String(body.category ?? "");
  const query = String(body.query ?? "").trim();
  const roomTypes = Array.isArray(body.roomTypes) ? body.roomTypes.filter((r) => typeof r === "string") : [];

  if (!CATEGORIES.includes(category as Category)) {
    return json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, 400);
  }
  if (!query) {
    return json({ error: "A search query is required (e.g. \"sofa\")." }, 400);
  }

  const result = await runOneImport(admin, rapidApiKey, { category: category as Category, query, roomTypes, limit, country });
  if (result.error) return json({ error: result.error }, 502);
  if (result.imported === 0) return json({ imported: 0, message: "Nothing new came back for that search." });
  return json({ imported: result.imported });
});
