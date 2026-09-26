// Public, unauthenticated read for a shared generation's before/after page
// (thinkdecor.app/r/<slug>). `generations` itself is private (RLS: owner
// only), so this function is the one sanctioned public door: given a slug,
// it looks the row up with the service role and hands back only the fields
// a public page needs, with short-lived signed URLs in place of the private
// bucket paths — never the row itself, never the owner's user_id.
//
// GET /functions/v1/public-share?slug=<share_slug>
//
// Deploy:  supabase functions deploy public-share --no-verify-jwt
// Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (already set on every project).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIGNED_URL_TTL_S = 60 * 60; // 1 hour — plenty for a page load + a bit of browsing.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) return json({ error: "Missing slug." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: generation } = await admin
    .from("generations")
    .select("id, input_image_url, output_image_url, template_key, room_type, kind, created_at")
    .eq("share_slug", slug)
    .not("share_slug", "is", null)
    .maybeSingle();

  if (!generation || !generation.output_image_url) {
    return json({ error: "This link isn't live — the owner may have unshared it." }, 404);
  }

  const sign = async (path: string) => {
    const { data } = await admin.storage.from("generations").createSignedUrl(path, SIGNED_URL_TTL_S);
    return data?.signedUrl ?? null;
  };

  const [before, after] = await Promise.all([
    sign(generation.input_image_url),
    sign(generation.output_image_url),
  ]);

  if (!before || !after) return json({ error: "Couldn't load this design's photos." }, 500);

  return json({
    id: generation.id,
    before,
    after,
    templateKey: generation.template_key,
    roomType: generation.room_type,
    kind: generation.kind,
    createdAt: generation.created_at,
  });
});
