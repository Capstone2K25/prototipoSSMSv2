// src/data/woo.ts
type Json = Record<string, unknown>;

const URL_FROM_ENV =
  (import.meta.env.VITE_SUPABASE_FUNCTION_WOO as string | undefined)?.replace(/\/+$/, "");
const PROJECT_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");

/**
 * BASE apunta a tu edge function "woo-sync".
 * - Si defines VITE_SUPABASE_FUNCTION_WOO (URL directa a la función), lo usa.
 * - Si no, cae al proyecto: `${VITE_SUPABASE_URL}/functions/v1/woo-sync`
 */
const BASE =
  URL_FROM_ENV ??
  (PROJECT_URL ? `${PROJECT_URL}/functions/v1/woo-sync` : undefined);

if (!BASE) {
  console.warn("[woo.ts] Falta VITE_SUPABASE_FUNCTION_WOO o VITE_SUPABASE_URL");
}

type CallOpts = {
  method?: "GET" | "POST";
  json?: Json;
  signal?: AbortSignal;
};

async function call<T = any>(path: string, opts: CallOpts = {}): Promise<T> {
  if (!BASE) throw new Error("No está configurada la URL base de woo-sync");
  const url = `${BASE}${path}`;
  const { method = "GET", json, signal } = opts;

  const r = await fetch(url, {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: json ? JSON.stringify(json) : undefined,
  });

  // intentamos parsear siempre para poder ver el mensaje del edge
  const text = await r.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!r.ok) {
    const msg = typeof payload === "object" && payload?.error
      ? payload.error
      : `HTTP ${r.status} ${r.statusText}`;
    throw new Error(msg);
  }
  return payload as T;
}

/** Tipo que usa la UI */
export type WooItem = {
  id: number;
  name: string;
  sku: string;
  type?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  price?: number | null;
};

/** GET /pull-products  (el edge acepta GET o POST) */
export function wooPullProducts(): Promise<WooItem[]> {
  return call<WooItem[]>("/pull-products", { method: "GET" });
}

/** POST /sync-down -> sincroniza catálogo Woo -> Supabase */
export function wooSyncDown(): Promise<{
  updated: number;
  inserted: number;
  updatedSkus?: string[];
  insertedSkus?: string[];
  skippedNoSku?: string[];
  insertErrors?: { sku: string; err: string }[];
}> {
  return call("/sync-down", { method: "POST" });
}

/** POST /push-stock-local -> empuja stock web absoluto de un SKU LOCAL a Woo */
export function wooPushStockLocal(skuLocal: string, absoluteStock: number) {
  return call("/push-stock-local", {
    method: "POST",
    json: { sku_local: skuLocal, absoluteStock },
  });
}

/** POST /create-product-local -> crea en Woo y mappea en wc_links (usa sku_local) */
export function wooCreateProductLocal(args: {
  skuLocal: string;
  name: string;
  price?: number;
  initialStockWeb?: number;
  skuWoo?: string; // opcional si quieres forzar un SKU distinto al local
}) {
  const { skuLocal, name, price, initialStockWeb, skuWoo } = args;
  return call("/create-product-local", {
    method: "POST",
    json: {
      sku_local: skuLocal,
      name,
      price,
      initialStockWeb,
      sku_wc: skuWoo, // el edge ya lo contempla (cae al local si no se envía)
    },
  });
}

/** POST /delete-product-local -> borra wc_links y (opcional) el producto en Woo */
export function wooDeleteProductLocal(skuLocal: string, forceWoo = true) {
  return call("/delete-product-local", {
    method: "POST",
    json: { sku_local: skuLocal, forceWoo },
  });
}

/**
 * POST /update-product-local
 * Sincroniza nombre, precio y/o stock web de un SKU LOCAL hacia Woo.
 * Útil cuando editas la familia en tu matriz y quieres reflejarlo en Woo.
 */
export function wooUpdateProductLocal(args: {
  skuLocal: string;
  name?: string;
  price?: number;
  absoluteStockWeb?: number;
}) {
  const { skuLocal, name, price, absoluteStockWeb } = args;
  return call("/update-product-local", {
    method: "POST",
    json: { sku_local: skuLocal, name, price, absoluteStockWeb },
  });
}
