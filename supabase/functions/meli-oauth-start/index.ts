// supabase/functions/meli-oauth-start/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// CORS
function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") ?? "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req)
    });
  }
  try {
    const CLIENT_ID = Deno.env.get("ML_CLIENT_ID");
    const REDIRECT = Deno.env.get("ML_REDIRECT_URI"); // = meli-oauth-callback
    const url = new URL("https://auth.mercadolibre.com/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT);
    return new Response(JSON.stringify({
      auth_url: url.toString()
    }), {
      headers: {
        ...corsHeaders(req),
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String(e)
    }), {
      status: 500,
      headers: {
        ...corsHeaders(req),
        "Content-Type": "application/json"
      }
    });
  }
});
