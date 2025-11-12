// src/components/PurchaseOrders.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { b2bSyncDown, type B2bItem } from "../data/b2b";

type SortKey = "id" | "name" | "sku" | "price" | "stock_quantity" | "status" | "type";

export default function PurchaseOrders() {
  // ===== Estado B2B =====
  const [b2bLoading, setB2bLoading] = useState(false);
  const [b2bError, setB2bError] = useState<string | null>(null);
  const [b2bProducts, setB2bProducts] = useState<B2bItem[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // ===== UI helpers (búsqueda/orden) =====
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = [...b2bProducts];

    if (term) {
      rows = rows.filter((r) => {
        const hay = [
          String(r.id ?? ""),
          String(r.name ?? ""),
          String(r.sku ?? ""),
          String(r.status ?? ""),
          String(r.type ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      });
    }

    rows.sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];

      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });

    return rows;
  }, [b2bProducts, q, sortKey, sortDir]);

  // ===== Carga catálogo desde B2B Woo =====
  const loadB2bProducts = useCallback(async () => {
    try {
      setB2bLoading(true);
      setB2bError(null);
      const res = await b2bSyncDown(); // Llama a la función de b2b.ts
      setB2bProducts(res.products ?? []);
      setLastSync(new Date());
    } catch (e: any) {
      setB2bError(e?.message ?? String(e));
      setB2bProducts([]);
    } finally {
      setB2bLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial
    loadB2bProducts();
  }, [loadB2bProducts]);

  // ===== Render =====
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo B2B</h1>
          <p className="text-sm text-neutral-500">
            Productos sincronizados desde el WooCommerce B2B.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadB2bProducts}
            className="rounded-xl border px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-60"
            disabled={b2bLoading}
          >
            {b2bLoading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </header>

      {/* Estado/sistema */}
      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border p-4">
          <h3 className="text-sm font-medium text-neutral-700">Estado Conexión B2B</h3>
          <div className="mt-2 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  b2bLoading ? "bg-yellow-500" : b2bError ? "bg-red-600" : "bg-emerald-600"
                }`}
              />
              <span>
                {b2bLoading ? "Sincronizando…" : b2bError ? "Desconectado" : "Conectado"}
              </span>
            </div>
            <div className="mt-1 text-neutral-500">
              {lastSync ? (
                <span>
                  Última sync:{" "}
                  {lastSync.toLocaleString(undefined, {
                    hour12: false,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                <span>Aún sin sincronizar</span>
              )}
            </div>
            {b2bError && (
              <p className="mt-2 break-all text-xs text-red-600">{b2bError}</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-2">
          <h3 className="text-sm font-medium text-neutral-700">Búsqueda y orden</h3>
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por ID, nombre, SKU, estado…"
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            />
            <div className="flex items-center gap-2">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-xl border px-3 py-2"
              >
                <option value="id">ID</option>
                <option value="name">Nombre</option>
                <option value="sku">SKU</option>
                <option value="price">Precio</option>
                <option value="stock_quantity">Stock</option>
                <option value="status">Status</option>
                <option value="type">Tipo</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="rounded-xl border px-3 py-2 hover:bg-neutral-50"
                title="Cambiar orden"
              >
                {sortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Lista de productos B2B */}
      <section className="mt-6 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Productos B2B</h2>
          <div className="text-sm text-neutral-500">
            {b2bProducts.length} item{b2bProducts.length !== 1 ? "s" : ""}
          </div>
        </div>

        {!b2bLoading && !b2bError && b2bProducts.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">
            No hay productos en el B2B o no se pudieron cargar.
          </p>
        )}

        <div className="mt-3 max-h-[60vh] overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left">
                <th className="border-b py-2 px-3">ID</th>
                <th className="border-b py-2 px-3">Nombre</th>
                <th className="border-b py-2 px-3">SKU</th>
                <th className="border-b py-2 px-3">Precio</th>
                <th className="border-b py-2 px-3">Stock</th>
                <th className="border-b py-2 px-3">Status</th>
                <th className="border-b py-2 px-3">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b hover:bg-neutral-50">
                  <td className="py-2 px-3">{p.id}</td>
                  <td className="py-2 px-3">{p.name}</td>
                  <td className="py-2 px-3">{p.sku || "-"}</td>
                  <td className="py-2 px-3">
                    {p.price != null ? `$${Number(p.price).toFixed(2)}` : "-"}
                  </td>
                  <td className="py-2 px-3">
                    {p.manage_stock ? (p.stock_quantity ?? 0) : "—"}
                  </td>
                  <td className="py-2 px-3">{p.status || "-"}</td>
                  <td className="py-2 px-3">{p.type || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {b2bLoading && (
          <p className="mt-3 text-sm text-neutral-500">Cargando productos B2B…</p>
        )}
      </section>
    </div>
  );
}