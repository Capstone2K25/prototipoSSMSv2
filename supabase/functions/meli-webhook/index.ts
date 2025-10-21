// supabase/functions/meli-webhook/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// CORS
function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") ?? "authorization, content-type, x-meli-signature, apikey, x-client-info",
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
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders(req)
    });
  }
  try {
    const raw = await req.text(); // si luego validas firma, no conviertas antes de validar
    console.log("ML Webhook:", raw);
    // TODO: parsear y encolar trabajo (p.ej., actualizar stock de un item)
    // const evt = JSON.parse(raw);
    return new Response(JSON.stringify({
      ok: true
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
