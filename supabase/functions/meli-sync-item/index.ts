// supabase/functions/meli-sync-item/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// CORS
function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") ?? "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}
const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(SB_URL, SB_SERVICE);
const ML_SITE_ID = Deno.env.get("ML_SITE_ID") ?? "MLC"; // Chile por defecto
async function getValidToken() {
  const { data } = await sb.from("ml_credentials").select("*").order("updated_at", {
    ascending: false
  }).limit(1).maybeSingle();
  if (!data) throw new Error("Sin credenciales ML");
  const exp = new Date(data.expires_at).getTime();
  if (Date.now() < exp - 60_000) return data.access_token;
  // refresh
  const CLIENT_ID = Deno.env.get("ML_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET");
  const r = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: data.refresh_token
    }).toString()
  });
  if (!r.ok) throw new Error(`Refresh token ML falló: ${await r.text()}`);
  const tok = await r.json();
  const expires_at = new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString();
  await sb.from("ml_credentials").upsert({
    id: data.id,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? data.refresh_token,
    expires_at,
    updated_at: new Date().toISOString()
  });
  return tok.access_token;
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
    const body = await req.json().catch(()=>({}));
    const action = String(body?.action || "").toLowerCase();
    const sku = String(body?.sku || "").trim();
    if (!action || !sku) {
      return new Response(JSON.stringify({
        error: "action y sku son obligatorios"
      }), {
        status: 400,
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json"
        }
      });
    }
    const token = await getValidToken();
    // datos locales del SKU
    const { data: prod } = await sb.from("productos").select("name, price, stockml, categoria").eq("sku", sku).maybeSingle();
    if (!prod) {
      return new Response(JSON.stringify({
        error: "SKU no existe en productos"
      }), {
        status: 404,
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json"
        }
      });
    }
    const { data: link } = await sb.from("ml_links").select("meli_item_id, meli_variation_id").eq("sku", sku).maybeSingle();
    if (action === "update") {
      if (!link?.meli_item_id) {
        return new Response(JSON.stringify({
          error: "SKU no está vinculado a ML"
        }), {
          status: 400,
          headers: {
            ...corsHeaders(req),
            "Content-Type": "application/json"
          }
        });
      }
      const res = await fetch(`https://api.mercadolibre.com/items/${link.meli_item_id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          available_quantity: Number(prod.stockml || 0),
          price: Number(prod.price || 0)
        })
      });
      if (!res.ok) return new Response(await res.text(), {
        status: 502,
        headers: corsHeaders(req)
      });
      return new Response(JSON.stringify({
        ok: true,
        action,
        item_id: link.meli_item_id
      }), {
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json"
        }
      });
    }
    if (action === "create") {
      if (link?.meli_item_id) {
        // si ya existe, tratamos como update
        const res = await fetch(`https://api.mercadolibre.com/items/${link.meli_item_id}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            available_quantity: Number(prod.stockml || 0),
            price: Number(prod.price || 0)
          })
        });
        if (!res.ok) return new Response(await res.text(), {
          status: 502,
          headers: corsHeaders(req)
        });
        return new Response(JSON.stringify({
          ok: true,
          action: "update",
          item_id: link.meli_item_id
        }), {
          headers: {
            ...corsHeaders(req),
            "Content-Type": "application/json"
          }
        });
      }
      const payload = {
        title: String(body?.title ?? prod.name),
        category_id: String(body?.category_hint ?? "MLC3530"),
        price: Number(body?.price ?? prod.price ?? 0),
        currency_id: "CLP",
        available_quantity: Number(body?.stock ?? prod.stockml ?? 0),
        buying_mode: "buy_it_now",
        listing_type_id: "gold_special",
        condition: "new",
        site_id: ML_SITE_ID,
        seller_custom_field: sku
      };
      const res = await fetch("https://api.mercadolibre.com/items", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return new Response(await res.text(), {
        status: 502,
        headers: corsHeaders(req)
      });
      const item = await res.json();
      await sb.from("ml_links").upsert({
        sku,
        meli_item_id: item.id,
        meli_variation_id: null
      });
      return new Response(JSON.stringify({
        ok: true,
        action,
        item_id: item.id
      }), {
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      error: "action inválida"
    }), {
      status: 400,
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
