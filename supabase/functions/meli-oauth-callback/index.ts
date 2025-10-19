// Deno runtime (Edge Functions)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// --- ENV (usa "!" para que TS no marque string|undefined) ---
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ML_CLIENT_ID     = Deno.env.get("ML_CLIENT_ID")!;
const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET")!;
const ML_REDIRECT_URI  = Deno.env.get("ML_REDIRECT_URI")!;
const APP_OK           = Deno.env.get("APP_REDIRECT_SUCCESS") || "https://prototipossmsv2.pages.dev/admin?ml=connected";
const APP_ERR          = Deno.env.get("APP_REDIRECT_ERROR")   || "https://prototipossmsv2.pages.dev/admin?ml=error";

// Supabase admin client (Service role, sólo en backend)
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  user_id?: number;
  [k: string]: unknown;
};

serve(async (req: Request): Promise<Response> => {
  try {
    // code & state vienen por querystring de Mercado Libre
    const url   = new URL(req.url);
    const code  = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";

    if (!code) {
      // Falta el code → redirige con error
      return Response.redirect(`${APP_ERR}&reason=missing_code`, 302);
    }

    // Intercambio de "code" por tokens
    const form = new URLSearchParams({
      grant_type:   "authorization_code",
      client_id:    ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri: ML_REDIRECT_URI,
    });

    const r = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    if (!r.ok) {
      const t = await r.text();
      // Redirige a tu app con detalle del error de intercambio
      return Response.redirect(
        `${APP_ERR}&reason=token_exchange&detail=${encodeURIComponent(t)}`,
        302
      );
    }

    const json = (await r.json()) as TokenResponse;

    // Calcula la expiración absoluta
    const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();

    // Guarda/actualiza credenciales en tu tabla
    const { error } = await sb.from("ml_credentials").upsert({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    });

    if (error) {
      // Si falló DB, regresa con error
      return Response.redirect(
        `${APP_ERR}&reason=db_upsert&detail=${encodeURIComponent(error.message)}`,
        302
      );
    }

    // Éxito → vuelve a tu panel
    return Response.redirect(`${APP_OK}&state=${encodeURIComponent(state)}`, 302);
  } catch (e) {
    // Cualquier excepción
    const msg = e instanceof Error ? e.message : String(e);
    return Response.redirect(`${APP_ERR}&reason=exception&detail=${encodeURIComponent(msg)}`, 302);
  }
});
