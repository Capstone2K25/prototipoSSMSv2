// src/data/woo.ts
type Json = Record<string, unknown>;

const URL_FROM_ENV =
  (import.meta.env.VITE_SUPABASE_FUNCTION_WOO as string | undefined)?.replace(/\/+$/, "");
const PROJECT_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");

const BASE =
  URL_FROM_ENV ??
  (PROJECT_URL ? `${PROJECT_URL}/functions/v1/woo-sync` : undefined);

if (!BASE) {
  console.warn("[woo.ts] Falta VITE_SUPABASE_FUNCTION_WOO o VITE_SUPABASE_URL");
}

async function call<T = any>(path: string, init?: RequestInit & { json?: Json }): Promise<T> {
  if (!BASE) throw new Error("Falta configurar la URL base de la función");

  const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      // Estos dos headers evitan rechazos por Supabase/gateway y te
      // sirven si luego decides validar el token en la función:
      "Authorization": `Bearer ${anon}`,
      "apikey": anon,
      ...(init?.headers || {}),
    },
    body: init?.json ? JSON.stringify(init.json) : init?.body,
    mode: "cors",
  });

  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch {}
    throw new Error(`Woo function error (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : (null as T));
}

/** Tipo que usa la UI */
export type WooItem = {
  id: number; name: string; sku: string;
  type?: string; manage_stock?: boolean; stock_quantity?: number | null;
};

/** GET /pull-products */
export function wooPullProducts(): Promise<WooItem[]> {
  return call<WooItem[]>("/pull-products", { method: "GET" });
}

/** POST /sync-down */
export function wooSyncDown(): Promise<{ updated: number; inserted: number }> {
  return call("/sync-down", { method: "POST" });
}

/** POST /push-stock */
export function wooPushStock(sku: string, absoluteStock: number) {
  return call("/push-stock", { method: "POST", json: { sku, absoluteStock } });
}

/** POST /push-stock-local */
export function wooPushStockLocal(sku_local: string, absoluteStock: number) {
  return call("/push-stock-local", { method: "POST", json: { sku_local, absoluteStock } });
}

/** POST /create-product-local */
export function wooCreateProductLocal(args: {
  skuLocal: string; name: string; price?: number; initialStockWeb?: number; skuWoo?: string;
}) {
  const { skuLocal, name, price, initialStockWeb, skuWoo } = args;
  return call("/create-product-local", {
    method: "POST",
    json: { sku_local: skuLocal, name, price, initialStockWeb, sku_wc: skuWoo },
  });
}

/** POST /delete-product-local */
export function wooDeleteProductLocal(sku_local: string) {
  return call("/delete-product-local", { method: "POST", json: { sku_local } });
}

// NUEVO
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
