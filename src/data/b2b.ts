// src/data/b2b.ts
// ======================================================
// Config base para la Edge Function de B2B
// ======================================================

// Fallback: Reemplaza con la URL de tu función si no usas variables de entorno.
const BASE_OVERRIDE = "https://vloofwzvvoyvrvaqbitm.supabase.co/functions/v1/woo-sync-b2b";

// Opción por variables de entorno (p.ej. en Cloudflare Pages)
const URL_FROM_ENV = (import.meta.env.VITE_SUPABASE_FUNCTION_B2B as string | undefined)?.replace(/\/+$/, "");
const PROJECT_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");

// URL final hacia la Edge Function de B2B
const BASE =
  BASE_OVERRIDE ||
  URL_FROM_ENV ||
  (PROJECT_URL ? `${PROJECT_URL}/functions/v1/woo-sync-b2b` : undefined);

if (!BASE) {
  console.warn("[b2b.ts] Falta VITE_SUPABASE_FUNCTION_B2B o VITE_SUPABASE_URL (usando BASE_OVERRIDE?)");
}

// ======================================================
// Utilidades HTTP (sin cambios)
// ======================================================
type Json = Record<string, unknown>;

type CallOpts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  json?: Json;
  signal?: AbortSignal;
};

async function call<T = any>(path: string, opts: CallOpts = {}): Promise<T> {
  if (!BASE) throw new Error("No está configurada la URL base de woo-sync-b2b");
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
// Tipos públicos (prefijo B2b)
// ======================================================
export type B2bItem = {
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
// Endpoints B2B (prefijo b2b)
// ======================================================

/**
 * Baja catálogo desde Woo B2B (Edge: POST /v1/sync-down)
 */
export async function b2bSyncDown(): Promise<{ ok: boolean; products: B2bItem[]; count: number }> {
  const res = await call<{ ok: boolean; products: B2bItem[]; count: number }>("/v1/sync-down", {
    method: "POST",
  });
  if (!res?.ok || !Array.isArray(res.products)) {
    throw new Error("sync-down (b2b) devolvió un formato inesperado");
  }
  return res;
}

/**
 * Crear producto en Woo B2B a partir de un SKU LOCAL (simple)
 * Edge: POST /v1/create
 */
export async function b2bCreateProductLocal(args: {
  skuLocal: string;
  name: string;
  price?: number;
  initialStockB2b?: number; // Mapeado a stock_quantity
}) {
  const { skuLocal, name, price, initialStockB2b } = args;
  const payload: any = {
    sku_local: skuLocal,
    name,
    price,
    manage_stock: true,
    stock_quantity: typeof initialStockB2b === "number" ? Number(initialStockB2b) : 0,
    type: "simple",
  };
  return call("/v1/create", { method: "POST", json: payload });
}

/**
 * Empujar (setear) stock B2B absoluto por SKU local
 * Edge: POST /v1/reflect
 */
export async function b2bPushStockLocal(skuLocal: string, absoluteStockB2b: number) {
  return call("/v1/reflect", {
    method: "POST",
    json: {
      sku_local: skuLocal,
      manage_stock: true,
      stock_quantity: Number(absoluteStockB2b || 0),
    },
  });
}

/**
 * Actualizar producto B2B por SKU local (nombre/precio/stock)
 * Edge: POST /v1/reflect
 */
export async function b2bUpdateProductLocal(args: {
  skuLocal: string;
  name?: string;
  price?: number;
  absoluteStockB2b?: number;
  status?: string;
}) {
  const { skuLocal, name, price, absoluteStockB2b, status } = args;
  const json: any = { sku_local: skuLocal };
  if (name !== undefined) json.name = String(name);
  if (price !== undefined) json.price = Number(price);
  if (absoluteStockB2b !== undefined) {
    json.manage_stock = true;
    json.stock_quantity = Number(absoluteStockB2b);
  }
  if (status !== undefined) json.status = String(status);
  return call("/v1/reflect", { method: "POST", json });
}

/**
 * Borrar producto B2B por SKU local
 * Edge: DELETE /v1/by-sku/:sku_local
 */
export async function b2bDeleteProductLocal(skuLocal: string) {
  return call(`/v1/by-sku/${encodeURIComponent(skuLocal)}`, { method: "DELETE" });
}

// ======================================================
// Extras (prefijo b2b)
// ======================================================

/** Health check de la función B2B (Edge: GET /health) */
export function b2bHealth(): Promise<{ ok: boolean; connected: boolean; site?: string }> {
  return call("/health", { method: "GET" });
}

/** Update directo por ID de producto B2B (Edge: PUT /v1/product/:id) */
export function b2bUpdateProduct(id: number, patch: {
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

/** Update directo por ID de variación B2B (Edge: PUT /v1/product/:id/variation/:vid) */
export function b2bUpdateVariation(id: number, vid: number, patch: {
  price?: number; manage_stock?: boolean; stock_quantity?: number; status?: string;
}) {
  const json: any = {};
  if (patch.price !== undefined) json.price = Number(patch.price);
  if (patch.manage_stock !== undefined) json.manage_stock = !!patch.manage_stock;
  if (patch.stock_quantity !== undefined) json.stock_quantity = Number(patch.stock_quantity);
  if (patch.status !== undefined) json.status = String(patch.status);
  return call(`/v1/product/${id}/variation/${vid}`, { method: "PUT", json });
}