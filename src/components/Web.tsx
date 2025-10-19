// src/components/Web.tsx
import { useEffect, useState } from "react";
import { wooPullProducts, wooSyncDown, type WooItem } from "../data/woo";

export default function Web() {
  const [rows, setRows] = useState<WooItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await wooPullProducts();
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const syncAll = async () => {
    setSyncing(true);
    try {
      await wooSyncDown(); // Woo → actualiza productos.stockweb en Supabase
      await load();        // refresca tabla Web
    } catch (e: any) {
      setError(e?.message ?? "Error sincronizando");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">WordPress</h1>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-2 rounded border disabled:opacity-60"
            disabled={loading || syncing}
            title="Refrescar lista desde Woo (sin escribir en BD)"
          >
            {loading ? "Cargando..." : "Refrescar"}
          </button>
          <button
            onClick={syncAll}
            className="px-3 py-2 rounded bg-green-700 text-white disabled:opacity-60"
            disabled={loading || syncing}
            title="Bajar stock desde Woo y actualizar BD"
          >
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Producto</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-left p-2">Manage</th>
              <th className="text-right p-2">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.name}</td>
                <td className="p-2">{p.sku || "—"}</td>
                <td className="p-2">{p.manage_stock ? "On" : "Off"}</td>
                <td className="p-2 text-right">{p.stock_quantity ?? 0}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan={4}>
                  No hay productos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
