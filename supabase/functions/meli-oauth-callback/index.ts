// supabase/functions/meli-oauth-callback/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS
function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      req.headers.get("Access-Control-Request-Headers")
      ?? "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  } as Record<string, string>;
}

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SB_SERVICE);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(req) });
  }

  try {
    const u = new URL(req.url);
    const code = u.searchParams.get("code");
    if (!code) {
      return new Response("Falta code", { status: 400, headers: corsHeaders(req) });
    }

    const CLIENT_ID = Deno.env.get("ML_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET")!;
    const REDIRECT = Deno.env.get("ML_REDIRECT_URI")!; // debe ser idéntico al registrado en ML

    const r = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT,
      }).toString(),
    });

    if (!r.ok) {
      return new Response(await r.text(), { status: 502, headers: corsHeaders(req) });
    }

    const tok = await r.json();
    const expires_at = new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString();

    await sb.from("ml_credentials").upsert({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at,
      updated_at: new Date().toISOString(),
    });

    // Redirige a tu app (ajústalo a tu ruta)
    return new Response(null, {
      status: 302,
      headers: { Location: `${u.origin}/admin?meli=ok`, ...corsHeaders(req) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

