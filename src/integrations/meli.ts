// src/integrations/meli.ts
import { supabase } from "../supabaseClient";

type MeliCreds = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO
};

const OAUTH_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

async function getCreds(): Promise<MeliCreds | null> {
  const { data, error } = await supabase
    .from("ml_credentials")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function saveCreds(c: Partial<MeliCreds>) {
  // upsert simple (asume 1 fila)
  const { error } = await supabase
    .from("ml_credentials")
    .upsert(
      { ...c, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}

export async function getValidAccessToken(): Promise<string> {
  const creds = await getCreds();
  if (!creds) throw new Error("ML credentials missing");

  const expiresAt = new Date(creds.expires_at).getTime();
  const now = Date.now();

  // Renovar 2 minutos antes de expirar
  if (now < expiresAt - 2 * 60 * 1000) return creds.access_token;

  // REFRESH
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: import.meta.env.VITE_ML_CLIENT_ID!,
    client_secret: import.meta.env.VITE_ML_CLIENT_SECRET!,
    refresh_token: creds.refresh_token,
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Refresh failed: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const newExpiresAt = new Date(
    Date.now() + json.expires_in * 1000
  ).toISOString();

  await saveCreds({
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? creds.refresh_token,
    expires_at: newExpiresAt,
  });

  return json.access_token;
}

// --- Mapeo SKU ↔ item/variation ---
export async function getMeliLinkBySku(sku: string) {
  const { data, error } = await supabase
    .from("ml_links")
    .select("meli_item_id, meli_variation_id")
    .eq("sku", sku)
    .maybeSingle();
  if (error) throw error;
  return data as {
    meli_item_id: string;
    meli_variation_id: string | null;
  } | null;
}

// --- Update stock en ML ---
export async function updateMeliStockBySku(sku: string, newQty: number) {
  const link = await getMeliLinkBySku(sku);
  if (!link) throw new Error(`No ML link for SKU ${sku}`);
  const token = await getValidAccessToken();

  const url = `https://api.mercadolibre.com/items/${link.meli_item_id}`;

  let payload: any;
  if (link.meli_variation_id) {
    // Con variaciones: actualizar la variación específica
    payload = {
      variations: [
        { id: Number(link.meli_variation_id), available_quantity: newQty },
      ],
    };
  } else {
    // Sin variaciones: actualizar directamente el available_quantity del item
    payload = { available_quantity: newQty };
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    // Si caducó el token entre medio, intenta 1 refresh y reintenta:
    if (res.status === 401) {
      const fresh = await getValidAccessToken();
      const res2 = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${fresh}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res2.ok)
        throw new Error(
          `ML update retry failed: ${res2.status} ${await res2.text()}`
        );
      return await res2.json();
    }
    throw new Error(`ML update failed: ${res.status} ${txt}`);
  }

  return await res.json();
}
