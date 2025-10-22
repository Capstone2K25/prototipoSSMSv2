// src/components/Web.tsx
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle, Globe, Repeat } from "lucide-react";
import { wooPullProducts, wooSyncDown } from "../data/woo";
import { supabase } from "../supabaseClient"; // 👈 usamos tu mismo cliente

type WooItem = {
  id: number;
  name: string;
  sku: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  price?: number | null;
};

export default function Web() {
  const [rows, setRows] = useState<WooItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const connected = !error;

  const toNumber = (v: any) => {
    if (v === null || v === undefined) return 0;
    const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Trae productos del canal (como ya lo haces)
      const data = (await wooPullProducts()) as WooItem[];

      // 2) Trae precios desde Supabase y haz join por SKU (solo lectura)
      const skus = data.map(d => d.sku).filter(Boolean);
      let priceMap = new Map<string, number>();

      if (skus.length) {
        const { data: dbData, error: dbErr } = await supabase
          .from("productos")
          .select("sku, price")
          .in("sku", skus); // ⚡ solo los necesarios

        if (dbErr) {
          console.warn("No pude traer precios desde Supabase:", dbErr.message);
        } else if (dbData) {
          dbData.forEach((r: any) => {
            if (r?.sku) priceMap.set(String(r.sku), toNumber(r.price));
          });
        }
      }

      // 3) Combina: prioridad Supabase, luego lo que venga del pull, si no 0
      const withPrices = data.map(item => ({
        ...item,
        price: priceMap.has(item.sku)
          ? priceMap.get(item.sku)!
          : toNumber(item.price),
      }));

      setRows(withPrices);
      setLastSync(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      await wooSyncDown();
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Error sincronizando");
    } finally {
      setSyncing(false);
    }
  };

  const totalStock = useMemo(
    () => rows.reduce((sum, p) => sum + (p.stock_quantity ?? 0), 0),
    [rows]
  );

  const formatCLP = (n: number | null | undefined) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(n || 0);

  const formatDate = (d: Date | null) =>
    d
      ? d.toLocaleString("es-CL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  if (loading && rows.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        Cargando productos del canal WordPress...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <Globe size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">WordPress</h2>
            <p className="text-sm text-neutral-600">Gestión de inventario en tienda online</p>
          </div>
        </div>

        <button
          onClick={syncAll}
          disabled={syncing}
          className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Bajar stock desde Woo y actualizar BD"
        >
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
          <span>{syncing ? "Sincronizando..." : "Sincronizar ahora"}</span>
        </button>
      </div>

      {/* Métricas + estado */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Estado */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Estado</h3>
            {connected ? (
              <CheckCircle className="text-green-600" size={20} />
            ) : (
              <AlertCircle className="text-red-600" size={20} />
            )}
          </div>
          {connected ? (
            <>
              <p className="text-2xl font-bold text-green-600">Conectado</p>
              <p className="text-xs text-neutral-500 mt-1">
                Última sync: {formatDate(lastSync)}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-red-600">Desconectado</p>
              <p className="text-xs text-neutral-500 mt-1">
                Revisa credenciales de WooCommerce/API.
              </p>
            </>
          )}
        </div>

        {/* Productos visibles (manage_stock ON) */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">
            Productos
          </h3>
          <p className="text-2xl font-bold text-neutral-900">
            {rows.filter((r) => r.manage_stock).length}/{rows.length}
          </p>
          <p className="text-sm text-neutral-500 mt-1">con stock gestionado / total</p>
        </div>

        {/* Stock Web total */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">
            Stock Web Total
          </h3>
          <p className="text-2xl font-bold text-neutral-900">{totalStock}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades</p>
        </div>

        {/* Acción masiva */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-3">
            Acciones
          </h3>
          <button
            onClick={syncAll}
            disabled={syncing || rows.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50"
            title="Bajar stock desde Woo y actualizar BD"
          >
            <Repeat size={18} />
            <span>Sincronizar catálogo</span>
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-neutral-900">Productos en WordPress</h3>
          <span className="text-sm text-neutral-600">Última sync: {formatDate(lastSync)}</span>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left  py-3 px-4 text-sm font-semibold text-neutral-700">Producto</th>
                <th className="text-left  py-3 px-4 text-sm font-semibold text-neutral-700">SKU</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Precio</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock Web</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                  <td className="py-4 px-4">
                    <div>
                      <p className="font-semibold text-neutral-900">{p.name}</p>
                      <p className="text-sm text-neutral-500">{p.manage_stock ? "Manage: On" : "Manage: Off"}</p>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <code className="text-sm bg-neutral-100 px-2 py-1 rounded">{p.sku || "—"}</code>
                  </td>
                  <td className="py-4 px-4 text-center text-neutral-900 font-semibold">
                    {formatCLP(p.price ?? 0)}
                  </td>
                  <td className="py-4 px-4 text-center font-bold text-neutral-900">
                    {p.stock_quantity ?? 0}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-neutral-500">
                    No hay productos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
