import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ML_CLIENT_ID = Deno.env.get("ML_CLIENT_ID")!;
const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

async function getCreds() {
  const { data, error } = await sb
    .from("ml_credentials")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("Credenciales ML no encontradas");
  return data as { access_token: string; refresh_token: string; expires_at: string };
}

async function refreshIfNeeded(creds: any) {
  if (Date.now() < new Date(creds.expires_at).getTime() - 120000)
    return creds.access_token;

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
    refresh_token: creds.refresh_token,
  });

  const r = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const json = await r.json();
  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  await sb.from("ml_credentials").upsert({
    access_token: json.access_token,
    refresh_token: json.refresh_token || creds.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  return json.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const { action, sku } = body as {
      action: "create" | "update";
      sku: string;
      title?: string;
      price?: number;
      stock?: number;
      category_hint?: string;
    };

    if (!action || !sku) {
      return new Response(JSON.stringify({ error: "Faltan parámetros" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const creds = await getCreds();
    const token = await refreshIfNeeded(creds);

    const { data: link } = await sb.from("ml_links").select("*").eq("sku", sku).maybeSingle();

    if (action === "update") {
      if (!link) throw new Error(`SKU ${sku} no tiene publicación vinculada`);
      const itemId = link.meli_item_id as string;
      const payload = { available_quantity: Number(body.stock ?? 0) };

      const r = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      const json = await r.json();
      return new Response(JSON.stringify({ ok: true, item_id: itemId, result: json }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // CREATE
    if (link) {
      // ya publicado, actualiza stock
      const r = await fetch(`https://api.mercadolibre.com/items/${link.meli_item_id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ available_quantity: Number(body.stock ?? 0) }),
      });
      if (!r.ok) throw new Error(await r.text());
      const json = await r.json();
      return new Response(JSON.stringify({ ok: true, item_id: link.meli_item_id, result: json }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // Crear nueva publicación
    const createPayload = {
      title: body.title || `SKU ${sku}`,
      category_id: body.category_hint || "MLC3530",
      price: Number(body.price || 0),
      currency_id: "CLP",
      available_quantity: Number(body.stock || 0),
      buying_mode: "buy_it_now",
      condition: "new",
      listing_type_id: "gold_pro",
      seller_custom_field: sku,
    };

    const r = await fetch("https://api.mercadolibre.com/items", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(createPayload),
    });
    if (!r.ok) throw new Error(await r.text());
    const created = await r.json();

    await sb.from("ml_links").upsert({
      sku,
      meli_item_id: created.id,
      meli_variation_id: null,
    });

    return new Response(JSON.stringify({ ok: true, item_id: created.id, result: created }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
