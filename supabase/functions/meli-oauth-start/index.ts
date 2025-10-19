import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOW_ORIGIN = "*"; // cámbialo por tu dominio en producción si deseas más seguridad

const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const clientId = Deno.env.get("ML_CLIENT_ID");
    const redirectUri = Deno.env.get("ML_REDIRECT_URI");

    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "Faltan ML_CLIENT_ID o ML_REDIRECT_URI" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const state = crypto.randomUUID();
    const authUrl = new URL("https://auth.mercadolibre.com/authorization");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "offline_access read write");
    authUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ auth_url: authUrl.toString(), state }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
