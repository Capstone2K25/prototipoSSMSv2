// src/data/woo.ts
const BASE = import.meta.env.VITE_SUPABASE_FUNCTION_WOO;

if (!BASE) {
  // Nota: en cf/pages o vercel, asegúrate de exponer la variable de entorno
  // y que comience con "VITE_" para que Vite la inserte en el bundle.
  // En producción, configura también el CORS ORIGIN de la Edge Function.
  console.warn("VITE_SUPABASE_FUNCTION_WOO no está definida");
}

async function call(path: string, init?: RequestInit) {
  const url = `${BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw Object.assign(new Error("Woo API error"), { status: r.status, data });
  return data;
}

export async function wooPullProducts() {
  // GET; lo hacemos con POST por simplicidad de CORS (puedes cambiar si quieres)
  return call("pull-products");
}

export async function wooPushStockLocal(skuLocal: string, absoluteStock: number) {
  return call("push-stock-local", {
    body: JSON.stringify({ sku_local: skuLocal, absoluteStock }),
  });
}

export async function wooCreateProductLocal(opts: {
  skuLocal: string;
  name: string;
  price?: number;
  initialStockWeb?: number;
  skuWoo?: string; // opcional si Woo usa otro SKU
}) {
  return call("create-product-local", { body: JSON.stringify(opts) });
}

export async function wooSyncDown() {
  return call("sync-down");
}

// delete (best–effort) en Woo por SKU local (usa el mapeo wc_links en el Edge)
export async function wooDeleteProductLocal(skuLocal: string) {
  const base =
    (typeof window !== 'undefined' && (window as any).__WOO_FN__) ||
    import.meta.env.VITE_SUPABASE_FUNCTION_WOO;
  if (!base) throw new Error('VITE_SUPABASE_FUNCTION_WOO no configurado');

  const r = await fetch(`${base}/delete-product-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku_local: skuLocal }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Fallo al borrar en Woo');
  return j; // { ok:true, wc_product_id?, skuWoo? }
}

/*
PRO-TIP (Vite / CF Pages):
- Variables de entorno front: usa prefijo VITE_. En CF Pages agrégala en "Environment Variables".
- Si cambias el dominio de la Edge Function entre entornos, crea .env.local:
  VITE_SUPABASE_FUNCTION_WOO="https://<tu-proyecto>.supabase.co/functions/v1/woo-sync"
*/
