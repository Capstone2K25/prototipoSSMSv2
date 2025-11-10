// src/data/woo.ts
// ======================================================
// Config base (con fallback a tu Edge Function)
// ======================================================

// Fallback temporal: si luego configuras variables en Cloudflare Pages (VITE_*), puedes borrar esta línea.
const BASE_OVERRIDE = "https://vloofwzvvoyvrvaqbitm.supabase.co/functions/v1/woo-sync";

// Opción por variables (Cloudflare Pages -> Settings -> Environment variables)
const URL_FROM_ENV = (import.meta.env.VITE_SUPABASE_FUNCTION_WOO as string | undefined)?.replace(/\/+$/, "");
const PROJECT_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");

// URL final hacia la Edge Function
const BASE =
  BASE_OVERRIDE ||
  URL_FROM_ENV ||
  (PROJECT_URL ? `${PROJECT_URL}/functions/v1/woo-sync` : undefined);

if (!BASE) {
  console.warn("[woo.ts] Falta VITE_SUPABASE_FUNCTION_WOO o VITE_SUPABASE_URL (usando BASE_OVERRIDE?)");
}

// ======================================================
// Utilidades HTTP
// ======================================================
type Json = Record<string, unknown>;

type CallOpts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
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
    headers: { "Content-Type": "application/json" },
    body: json ? JSON.stringify(json) : undefined,
  });

  const text = await r.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!r.ok) {
    const msg =
      typeof payload === "object" && payload?.error
        ? payload.error
        : `HTTP ${r.status} ${r.statusText}`;
    throw new Error(msg);
  }
  return payload as T;
}

// ======================================================
// Tipos públicos (usados por tu UI)
// ======================================================
export type WooItem = {
  id: number;
  name: string;
  sku: string;
  type?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  price?: number | null;
  status?: string;
};

// ======================================================
// Endpoints reales mapeados a los nombres que usa StockManager
// ======================================================

/**
 * Baja catálogo desde Woo (Edge: POST /v1/sync-down)
 * Devuelve { ok, products: WooItem[], count }
 */
export async function wooSyncDown(): Promise<{ ok: boolean; products: WooItem[]; count: number }> {
  const res = await call<{ ok: boolean; products: WooItem[]; count: number }>("/v1/sync-down", {
    method: "POST",
  });
  if (!res?.ok || !Array.isArray(res.products)) {
    throw new Error("sync-down devolvió un formato inesperado");
  }
  return res;
}

/**
 * Crear producto en Woo a partir de un SKU LOCAL (simple)
 * Edge: POST /v1/create
 */
export async function wooCreateProductLocal(args: {
  skuLocal: string;
  name: string;
  price?: number;
  initialStockWeb?: number; // mapeado a stock_quantity
}) {
  const { skuLocal, name, price, initialStockWeb } = args;
  const payload: any = {
    sku_local: skuLocal,
    name,
    price,
    manage_stock: true,
    stock_quantity: typeof initialStockWeb === "number" ? Number(initialStockWeb) : 0,
    type: "simple",
  };
  return call("/v1/create", { method: "POST", json: payload });
}

/**
 * Empujar (setear) stock web absoluto por SKU local
 * Edge: POST /v1/reflect
 */
export async function wooPushStockLocal(skuLocal: string, absoluteStockWeb: number) {
  return call("/v1/reflect", {
    method: "POST",
    json: {
      sku_local: skuLocal,
      manage_stock: true,
      stock_quantity: Number(absoluteStockWeb || 0),
    },
  });
}

/**
 * Actualizar producto por SKU local (nombre/precio/stock)
 * Edge: POST /v1/reflect
 */
export async function wooUpdateProductLocal(args: {
  skuLocal: string;
  name?: string;
  price?: number;
  absoluteStockWeb?: number;
  status?: string;
}) {
  const { skuLocal, name, price, absoluteStockWeb, status } = args;
  const json: any = { sku_local: skuLocal };
  if (name !== undefined) json.name = String(name);
  if (price !== undefined) json.price = Number(price);
  if (absoluteStockWeb !== undefined) {
    json.manage_stock = true;
    json.stock_quantity = Number(absoluteStockWeb);
  }
  if (status !== undefined) json.status = String(status);
  return call("/v1/reflect", { method: "POST", json });
}

/**
 * Borrar producto por SKU local (enlazado via wc_links)
 * Edge: DELETE /v1/by-sku/:sku_local
 */
export async function wooDeleteProductLocal(skuLocal: string) {
  return call(`/v1/by-sku/${encodeURIComponent(skuLocal)}`, { method: "DELETE" });
}

// ======================================================
// Extras útiles
// ======================================================

/** Health check mínimo (Edge: GET /health) */
export function wooHealth(): Promise<{ ok: boolean; connected: boolean; site?: string }> {
  return call("/health", { method: "GET" });
}

/** Update directo por ID (Edge: PUT /v1/product/:id) */
export function wooUpdateProduct(id: number, patch: {
  name?: string; price?: number; manage_stock?: boolean; stock_quantity?: number; status?: string;
}) {
  const json: any = {};
  if (patch.name !== undefined) json.name = String(patch.name);
  if (patch.price !== undefined) json.price = Number(patch.price);
  if (patch.manage_stock !== undefined) json.manage_stock = !!patch.manage_stock;
  if (patch.stock_quantity !== undefined) json.stock_quantity = Number(patch.stock_quantity);
  if (patch.status !== undefined) json.status = String(patch.status);
  return call(`/v1/product/${id}`, { method: "PUT", json });
}

/** Update directo por ID de variación (Edge: PUT /v1/product/:id/variation/:vid) */
export function wooUpdateVariation(id: number, vid: number, patch: {
  price?: number; manage_stock?: boolean; stock_quantity?: number; status?: string;
}) {
  const json: any = {};
  if (patch.price !== undefined) json.price = Number(patch.price);
  if (patch.manage_stock !== undefined) json.manage_stock = !!patch.manage_stock;
  if (patch.stock_quantity !== undefined) json.stock_quantity = Number(patch.stock_quantity);
  if (patch.status !== undefined) json.status = String(patch.status);
  return call(`/v1/product/${id}/variation/${vid}`, { method: "PUT", json });
}
