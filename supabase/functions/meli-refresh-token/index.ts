import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ML_CLIENT_ID = Deno.env.get("ML_CLIENT_ID");
const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET");
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: cors
  });
  try {
    const { data, error } = await sb.from("ml_credentials").select("*").order("updated_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (error || !data) throw new Error("No existen credenciales ML");
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: data.refresh_token
    });
    const r = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({
        error: t
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...cors
        }
      });
    }
    const json = await r.json();
    const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
    await sb.from("ml_credentials").upsert({
      access_token: json.access_token,
      refresh_token: json.refresh_token || data.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    });
    return new Response(JSON.stringify(json), {
      headers: {
        "Content-Type": "application/json",
        ...cors
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e?.message || "error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...cors
      }
    });
  }
});
