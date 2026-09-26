// A plain, public GET link (no auth) that a "shop this" dot/icon can point
// straight at: `${SUPABASE_URL}/functions/v1/product-link?id=<product id>`.
// Resolves to the real retailer's own product page — never Google's own
// Shopping listing (which is what source_url holds for imported products,
// see import-products/search-products) — by asking OpenWeb Ninja's
// Product Offers endpoint for that item's live offers and 302-redirecting
// to the first one's offer_page_url. Falls back to the stored source_url
// (still better than nothing) if that lookup fails or the product wasn't
// imported from Google Shopping at all.
//
// The resolved link is cached on the product row (resolved_shop_url /
// resolved_shop_url_at) for CACHE_TTL_MS — the first click on a given
// product pays for the live lookup (~1-2s), every click after that for
// anyone, until the cache goes stale, redirects immediately.
//
// Affiliate wrapping (Sovrn Commerce, pending approval): every redirect
// destination this function computes passes through wrapAffiliate() before
// the 302. Today that's a no-op — SOVRN_ENABLED isn't set, so it returns the
// URL untouched. Once the account is approved, set SOVRN_ENABLED=true and
// SOVRN_REDIRECT_BASE (Sovrn's own redirect-prefix URL, destination
// URL-encoded and appended) as secrets — no code change needed to turn it on.
//
// Deploy:  supabase functions deploy product-link --no-verify-jwt
// Secrets: RAPIDAPI_KEY, plus the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//          every project already has. SOVRN_ENABLED / SOVRN_REDIRECT_BASE
//          once Sovrn approves the account.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CURRENCY_TO_COUNTRY: Record<string, string> = { USD: "us", GBP: "gb", CAD: "ca", AUD: "au" };
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SOVRN_ENABLED = (Deno.env.get("SOVRN_ENABLED") ?? "").toLowerCase() === "true";
const SOVRN_REDIRECT_BASE = Deno.env.get("SOVRN_REDIRECT_BASE");

/** Routes a resolved destination through Sovrn's affiliate redirect when the
 *  account is live; otherwise returns it unchanged. Centralising this one
 *  call site means enabling Sovrn later is a secrets change, not a redeploy. */
function wrapAffiliate(destUrl: string): string {
  if (!SOVRN_ENABLED || !SOVRN_REDIRECT_BASE) return destUrl;
  return SOVRN_REDIRECT_BASE + encodeURIComponent(destUrl);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: product } = await admin
    .from("products")
    .select("source_retailer, source_sku, source_url, currency, resolved_shop_url, resolved_shop_url_at")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();

  if (!product) return new Response("Not found", { status: 404 });

  // Logged for the admin analytics view ("what people actually click"),
  // fire-and-forget — a failed log write should never hold up the redirect.
  admin.from("product_link_clicks").insert({ product_id: id })
    .then(({ error }) => { if (error) console.error("product-link: couldn't log click", error); });

  const fallback = () =>
    product.source_url
      ? Response.redirect(wrapAffiliate(product.source_url), 302)
      : new Response("This product has no listing link.", { status: 404 });

  const cacheAge = product.resolved_shop_url_at ? Date.now() - new Date(product.resolved_shop_url_at).getTime() : Infinity;
  if (product.resolved_shop_url && cacheAge < CACHE_TTL_MS) {
    return Response.redirect(wrapAffiliate(product.resolved_shop_url), 302);
  }

  const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
  if (product.source_retailer !== "google_shopping" || !product.source_sku || !rapidApiKey) {
    return fallback();
  }

  try {
    const country = CURRENCY_TO_COUNTRY[product.currency] ?? "us";
    const offersUrl = new URL("https://real-time-e-commerce-data.p.rapidapi.com/google-shopping/product-offers");
    offersUrl.searchParams.set("product_id", product.source_sku);
    offersUrl.searchParams.set("country", country);
    const res = await fetch(offersUrl, {
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": "real-time-e-commerce-data.p.rapidapi.com",
      },
    });
    if (!res.ok) return fallback();
    const payload = await res.json();
    const offerUrl: string | undefined = payload?.data?.offers?.[0]?.offer_page_url;
    if (!offerUrl) return fallback();

    // Best-effort — a failed cache write shouldn't break the redirect, but is
    // awaited (it's one fast local DB call) so it isn't dropped when the
    // isolate is torn down right after the response is sent.
    const { error: cacheErr } = await admin
      .from("products")
      .update({ resolved_shop_url: offerUrl, resolved_shop_url_at: new Date().toISOString() })
      .eq("id", id);
    if (cacheErr) console.error("product-link: couldn't cache resolved URL", cacheErr);

    return Response.redirect(wrapAffiliate(offerUrl), 302);
  } catch {
    return fallback();
  }
});
