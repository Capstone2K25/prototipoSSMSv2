// src/components/Web.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Globe,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Repeat,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { wooSyncDown } from "../data/woo";

// ---------- Tipos ----------
type LookupTalla = {
  id_talla: number; // PK de tabla tallas
  etiqueta: string; // "S", "M", "38", etc.
  tipo: "alfanumerica" | "numerica";
  valor_numerico: number | null; // para ordenar tallas numéricas
};

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number | null;
  categoria_id: number | null;
  stockweb: number;
  talla_id: number | null;
};

type FamRow = {
  name: string;
  categoria_id: number | null;
  tipo: "alfanumerica" | "numerica";
  byTalla: Record<number, Product>; // talla_id -> producto
};

const ALFA_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

// ---------- Componente ----------
export default function Web() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [tallas, setTallas] = useState<LookupTalla[]>([]);

  // --------- Loaders ----------
  async function fetchTallas() {
    // sin crear nada extra: leemos la tabla existente
    const { data, error } = await supabase
      .from("tallas")
      .select("id_talla, etiqueta, tipo, valor_numerico")
      .order("tipo")
      .order("valor_numerico", { ascending: true, nullsFirst: true })
      .order("etiqueta");

    if (error) {
      console.error("Error tallas", error);
      setTallas([]);
      return;
    }
    setTallas((data || []) as LookupTalla[]);
  }

  async function fetchProducts() {
    // IMPORTANTE: solo columnas reales de la tabla productos (nuevo esquema)
    const { data, error } = await supabase
      .from("productos")
      .select("id, name, sku, price, stockweb, categoria_id, talla_id")
      .order("id", { ascending: true });

    if (error) {
      console.error("Error productos", error);
      setProducts([]);
      setError(error.message || "No se pudieron obtener productos");
      return;
    }

    setError(null);
    setProducts((data || []) as Product[]);
  }

  async function handleSyncAll() {
    try {
      setSyncing(true);
      await wooSyncDown(); // la función persiste en productos / wc_links
      await fetchProducts(); // refrescamos
      setLastSync(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Error sincronizando");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchTallas(), fetchProducts()]);
      setLastSync(new Date());
      setLoading(false);
    })();
  }, []);

  // --------- Derivados ----------
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

  const connected = !error;

  // Map de tallas por id para armar familias
  const tallaMap = useMemo(() => {
    const m = new Map<number, LookupTalla>();
    for (const t of tallas) m.set(t.id_talla, t);
    return m;
  }, [tallas]);

  // Armamos familias por (name + tipo talla)
  const fams: FamRow[] = useMemo(() => {
    const map = new Map<string, FamRow>();
    for (const p of products) {
      const infoTalla = p.talla_id ? tallaMap.get(p.talla_id) : null;
      const tipo = (infoTalla?.tipo || "alfanumerica") as
        | "alfanumerica"
        | "numerica";
      const key = `${p.name}::${p.categoria_id ?? 0}::${tipo}`;
      if (!map.has(key)) {
        map.set(key, {
          name: p.name,
          categoria_id: p.categoria_id ?? null,
          tipo,
          byTalla: {},
        });
      }
      if (p.talla_id != null) {
        map.get(key)!.byTalla[p.talla_id] = p;
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [products, tallaMap]);

  const tallasByTipo = useMemo(
    () => ({
      alfanumerica: tallas
        .filter((t) => t.tipo === "alfanumerica")
        .sort(
          (a, b) =>
            ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta)
        ),
      numerica: tallas
        .filter((t) => t.tipo === "numerica")
        .sort((a, b) => (a.valor_numerico ?? 0) - (b.valor_numerico ?? 0)),
    }),
    [tallas]
  );

  const columnsForFam = (fam: FamRow) =>
    fam.tipo === "numerica" ? tallasByTipo.numerica : tallasByTipo.alfanumerica;

  const totalStockWeb = useMemo(
    () => products.reduce((sum, p) => sum + (p.stockweb || 0), 0),
    [products]
  );

  // --------- Render ----------
  if (loading)
    return (
      <div className="text-center py-12 text-neutral-500">
        Cargando productos…
      </div>
    );

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
            <p className="text-sm text-neutral-600">
              Gestión de inventario en tienda online
            </p>
          </div>
        </div>

        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
        >
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
          <span>{syncing ? "Sincronizando…" : "Sincronizar ahora"}</span>
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Estado */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase">
              Estado
            </h3>
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

        {/* Productos con stock Web (agrupadas) */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">
            Productos con stock Web
          </h3>
          <p className="text-2xl font-bold">{fams.length}</p>
          <p className="text-sm text-neutral-500 mt-1">agrupadas por nombre</p>
        </div>

        {/* Stock Web total */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">
            Stock Web Total
          </h3>
          <p className="text-2xl font-bold">{totalStockWeb}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades</p>
        </div>
      </div>

      {/* Tabla agrupada por familia con matriz de tallas */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-neutral-900">
            Productos en WordPress
          </h3>
          <span className="text-sm text-neutral-600">
            Última sync: {formatDate(lastSync)}
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left  py-3 px-4 text-sm font-semibold">
                  Producto
                </th>
                <th className="text-left  py-3 px-4 text-sm font-semibold">
                  Tallas (Stock Web)
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold">
                  Total Web
                </th>
              </tr>
            </thead>
            <tbody>
              {fams.map((fam, idx) => {
                const cols = columnsForFam(fam);
                const totalFam = cols.reduce(
                  (acc, t) => acc + (fam.byTalla[t.id_talla]?.stockweb || 0),
                  0
                );

                return (
                  <tr key={fam.name + idx} className="border-b align-top">
                    {/* Columna nombre */}
                    <td className="py-4 px-4 w-64">
                      <div className="font-semibold">{fam.name}</div>
                      <div className="text-[11px] text-neutral-500">
                        {fam.tipo === "numerica"
                          ? "Tallas numéricas"
                          : "Tallas alfanuméricas"}
                      </div>
                    </td>

                    {/* Matriz de tallas */}
                    <td className="py-4 px-4">
                      <div
                        className="overflow-x-auto"
                        style={{ minWidth: 420 }}
                      >
                        <div
                          className="grid gap-y-2 gap-x-2 items-center"
                          style={{
                            gridTemplateColumns: `120px repeat(${cols.length}, minmax(84px, 1fr))`,
                          }}
                        >
                          {/* Encabezados tallas */}
                          <div></div>
                          {cols.map((t) => (
                            <div
                              key={t.id_talla}
                              className="text-center text-xs text-neutral-700 font-medium"
                            >
                              {t.etiqueta}
                            </div>
                          ))}

                          {/* Fila: Stock Web */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                              Stock Web
                            </span>
                          </div>
                          {cols.map((t) => {
                            const p = fam.byTalla[t.id_talla];
                            const val = p?.stockweb ?? 0;
                            const cls =
                              val === 0
                                ? "text-red-600"
                                : val < 5
                                ? "text-orange-600"
                                : "text-green-700";
                            return (
                              <div key={t.id_talla} className="text-center">
                                <span className={`font-semibold ${cls}`}>
                                  {val}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>

                    {/* Total por familia */}
                    <td className="py-4 px-4 text-center font-bold">
                      {totalFam}
                    </td>
                  </tr>
                );
              })}

              {fams.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-neutral-500">
                    No hay productos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Acción masiva */}
        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={handleSyncAll}
            disabled={syncing || products.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50"
            title="Bajar stock desde Woo y actualizar BD"
          >
            <Repeat size={18} />
            <span>Sincronizar catálogo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
