// src/data/woo.ts
export type WooItem = {
  id: number;
  name: string;
  sku: string;
  type: "simple" | "variable";
  manage_stock: boolean;
  stock_quantity: number | null;
};

const BASE = import.meta.env.VITE_SUPABASE_FUNCTION_WOO as string;

function assertBase() {
  if (!BASE) {
    throw new Error(
      "VITE_SUPABASE_FUNCTION_WOO no está definida. Revisa tu .env.local y reinicia `npm run dev`."
    );
  }
}

export async function wooPullProducts(): Promise<WooItem[]> {
  assertBase();
  const r = await fetch(`${BASE}/pull-products`);
  if (!r.ok) throw new Error(`pull-products failed: ${r.status}`);
  return r.json();
}

export async function wooPushStockBySKU(sku: string, absoluteStock: number) {
  assertBase();
  const r = await fetch(`${BASE}/push-stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku, absoluteStock }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function wooPushStockLocal(
  skuLocal: string,
  absoluteStock: number
) {
  assertBase();
  const r = await fetch(`${BASE}/push-stock-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku_local: skuLocal, absoluteStock }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function wooSyncDown() {
  assertBase();
  const r = await fetch(`${BASE}/sync-down`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ updated: number }>;
}

export async function wooCreateProductLocal(args: {
  skuLocal: string;
  name: string;
  price?: number;
  initialStockWeb?: number;
  skuWoo?: string; // opcional si quieres diferenciar el SKU de Woo
}) {
  const r = await fetch(`${BASE}/create-product-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sku_local: args.skuLocal,
      name: args.name,
      price: args.price,
      initialStockWeb: args.initialStockWeb ?? 0,
      sku_wc: args.skuWoo,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ ok: true; wc_product_id: number; skuWoo: string }>;
}
