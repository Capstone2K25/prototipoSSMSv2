const BASE = (import.meta.env.VITE_SUPABASE_FUNCTION_WOO as string | undefined)?.replace(/\/+$/, "");

if (!BASE) {
  // Aviso visible solo en dev si la variable no está
  console.warn(
    "[woo.ts] VITE_SUPABASE_FUNCTION_WOO no está definido. Configúralo en .env.local para evitar errores en producción."
  );
}

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) {
    throw new Error(
      "Woo function base URL no configurada. Define VITE_SUPABASE_FUNCTION_WOO en .env.local y reinicia el dev server."
    );
  }

  const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {}
    const msg = `Woo function error (HTTP ${res.status})${detail ? `: ${detail}` : ""}`;
    throw new Error(msg);
  }

  // Si no hay cuerpo, regresa null
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

/** Tipo de ítems que devuelve /pull-products (solo lo usamos en el front) */
export type WooItem = {
  id: number;
  name: string;
  sku: string;
  type?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
};

// --------- Endpoints públicos que usa tu UI ---------

/** GET /pull-products */
export function wooPullProducts(): Promise<WooItem[]> {
  return call<WooItem[]>("/pull-products");
}

/** POST /sync-down (Woo -> actualiza productos.stockweb en Supabase) */
export function wooSyncDown(): Promise<{ updated: number; inserted: number }> {
  return call("/sync-down", { method: "POST" });
}

/** POST /push-stock */
export function wooPushStock(sku: string, absoluteStock: number) {
  return call("/push-stock", {
    method: "POST",
    body: JSON.stringify({ sku, absoluteStock }),
  });
}

/** POST /push-stock-local (usa mapeo wc_links) */
export function wooPushStockLocal(sku_local: string, absoluteStock: number) {
  return call("/push-stock-local", {
    method: "POST",
    body: JSON.stringify({ sku_local, absoluteStock }),
  });
}

/** POST /create-product-local */
export function wooCreateProductLocal(args: {
  skuLocal: string;
  name: string;
  price?: number;
  initialStockWeb?: number;
  skuWoo?: string;
}) {
  const { skuLocal, name, price, initialStockWeb, skuWoo } = args;
  return call("/create-product-local", {
    method: "POST",
    body: JSON.stringify({
      sku_local: skuLocal,
      name,
      price,
      initialStockWeb,
      sku_wc: skuWoo,
    }),
  });
}

/** POST /delete-product-local */
export function wooDeleteProductLocal(sku_local: string) {
  return call("/delete-product-local", {
    method: "POST",
    body: JSON.stringify({ sku_local }),
  });
}
