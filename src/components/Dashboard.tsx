import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { wooSyncDown } from "../data/woo";
import {
  TrendingUp,
  Package,
  AlertTriangle,
  RefreshCw,
  Globe,
  Building2,
  ShoppingCart,
  Filter,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ------------------ Types ------------------
type Product = {
  id: number;
  name: string;
  sku: string;
  categoria_id: number | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
  talla_id: number | null;
  talla_etiqueta: string | null;
};

type Category = { id_categoria: number; nombre_categoria: string };
type Channel = "all" | "B2B" | "Web" | "ML";

// Colors per channel (consistent across charts)
const CH_PURPLE = "#a855f7"; // B2B
const CH_SKY = "#0284c7"; // Web
const CH_AMBER = "#f59e0b"; // ML

// ------------------ Component ------------------
export const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros globales
  const [categoryFilter, setCategoryFilter] = useState<"all" | number>("all");
  const [search, setSearch] = useState<string>("");

  // Filtro local (tarjeta) de alertas por canal
  const [channelFilter, setChannelFilter] = useState<Channel>("all");

  // Paginación local de alertas
  const [alertPage, setAlertPage] = useState(1);
  const [alertPageSize, setAlertPageSize] = useState(10);

  const [syncing, setSyncing] = useState(false);

  async function syncAndReload() {
    setSyncing(true);
    try {
      await wooSyncDown();
      await fetchData();
    } finally {
      setSyncing(false);
    }
  }

  // Umbral bajo stock (por canal)
  const THRESHOLD = 10;

  const fetchData = async () => {
    setLoading(true);

    const [{ data: prodData, error: prodErr }, { data: catData, error: catErr }] = await Promise.all([
      supabase
        .from("productos")
        .select(`
          id, name, sku, categoria_id, stockb2b, stockweb, stockml, talla_id,
          tallas:talla_id ( id_talla, etiqueta )
        `),
      supabase
        .from("categorias")
        .select("id_categoria, nombre_categoria")
        .order("nombre_categoria", { ascending: true }),
    ]);

    if (!prodErr && prodData) {
      setProducts(
        (prodData as any[]).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          categoria_id: p.categoria_id,
          stockb2b: p.stockb2b || 0,
          stockweb: p.stockweb || 0,
          stockml: p.stockml || 0,
          talla_id: p.talla_id ?? null,
          talla_etiqueta: p.tallas?.etiqueta ?? null,
        }))
      );
    } else {
      console.error("Error al cargar productos:", prodErr);
    }

    if (!catErr && catData) {
      setCategories(catData as Category[]);
    } else if (catErr) {
      console.error("Error al cargar categorías:", catErr);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 100000);
    return () => clearInterval(interval);
  }, []);

  // Mapa id->nombre para UI
  const catNameById = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach((c) => {
      map[c.id_categoria] = c.nombre_categoria;
    });
    return map;
  }, [categories]);

  // Subconjunto filtrado (global)
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = categoryFilter === "all" || (p.categoria_id ?? null) === categoryFilter;
      const matchText =
        term.length === 0 ||
        (p.name || "").toLowerCase().includes(term) ||
        (p.sku || "").toLowerCase().includes(term);
      return matchCat && matchText;
    });
  }, [products, categoryFilter, search]);

  // Totales por canal
  const totalB2B = useMemo(() => filtered.reduce((acc, p) => acc + (p.stockb2b || 0), 0), [filtered]);
  const totalWeb = useMemo(() => filtered.reduce((acc, p) => acc + (p.stockweb || 0), 0), [filtered]);
  const totalML = useMemo(() => filtered.reduce((acc, p) => acc + (p.stockml || 0), 0), [filtered]);
  const totalMadre = totalB2B + totalWeb + totalML;

  // Top por TOTAL
  const topProducts = useMemo(() => {
    return [...filtered]
      .map((p) => ({ ...p, total: (p.stockb2b || 0) + (p.stockweb || 0) + (p.stockml || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filtered]);

  // ---------- Alertas agrupadas por producto ----------
  type LowGroup = {
    id: number;
    name: string;
    sku: string;
    talla?: string | null;
    low: { channel: "B2B" | "Web" | "ML"; value: number }[];
  };

  const lowByChannelAll: LowGroup[] = useMemo(() => {
    const channelRank = { B2B: 0, Web: 1, ML: 2 } as const;

    const out: LowGroup[] = [];
    for (const p of filtered) {
      const low: LowGroup["low"] = [];
      const b2b = p.stockb2b || 0;
      const web = p.stockweb || 0;
      const ml = p.stockml || 0;

      if (b2b < THRESHOLD) low.push({ channel: "B2B", value: b2b });
      if (web < THRESHOLD) low.push({ channel: "Web", value: web });
      if (ml < THRESHOLD) low.push({ channel: "ML", value: ml });

      if (low.length > 0) {
        low.sort((a, b) => channelRank[a.channel] - channelRank[b.channel]);
        out.push({ id: p.id, name: p.name, sku: p.sku, talla: p.talla_etiqueta, low });
      }
    }

    return out.sort((a, b) => {
      const minA = Math.min(...a.low.map((x) => x.value));
      const minB = Math.min(...b.low.map((x) => x.value));
      if (minA !== minB) return minA - minB;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, THRESHOLD]);

  // Filtro local por canal en tarjeta de alertas
  const lowByChannelFiltered = useMemo(() => {
    const base =
      channelFilter === "all"
        ? lowByChannelAll
        : lowByChannelAll
            .map((g) => ({ ...g, low: g.low.filter((l) => l.channel === channelFilter) }))
            .filter((g) => g.low.length > 0);
    setAlertPage(1);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowByChannelAll, channelFilter]);

  // Paginación alertas
  const alertTotal = lowByChannelFiltered.length;
  const alertTotalPages = Math.max(1, Math.ceil(alertTotal / alertPageSize));
  const alertFrom = alertTotal === 0 ? 0 : (alertPage - 1) * alertPageSize + 1;
  const alertTo = Math.min(alertTotal, alertPage * alertPageSize);
  const alertsPageData = useMemo(() => {
    const from = (alertPage - 1) * alertPageSize;
    return lowByChannelFiltered.slice(from, from + alertPageSize);
  }, [lowByChannelFiltered, alertPage, alertPageSize]);

  const goFirst = () => setAlertPage(1);
  const goPrev = () => setAlertPage((p) => Math.max(1, p - 1));
  const goNext = () => setAlertPage((p) => Math.min(alertTotalPages, p + 1));
  const goLast = () => setAlertPage(alertTotalPages);

  // ---------- Datos para gráficos ----------
  // 1) Composición por canal (para donut y otros)
  const compData = useMemo(
    () => [
      { name: "B2B", value: totalB2B },
      { name: "Web", value: totalWeb },
      { name: "ML", value: totalML },
    ],
    [totalB2B, totalWeb, totalML]
  );

  // 2) Stock por categoría (stacked bars)
  const stockByCategory = useMemo(() => {
    const catMap: Record<string, { categoria: string; B2B: number; Web: number; ML: number; total: number }> = {};
    filtered.forEach((p) => {
      const name = catNameById[p.categoria_id || 0] || "Sin categoría";
      if (!catMap[name]) catMap[name] = { categoria: name, B2B: 0, Web: 0, ML: 0, total: 0 };
      catMap[name].B2B += p.stockb2b || 0;
      catMap[name].Web += p.stockweb || 0;
      catMap[name].ML += p.stockml || 0;
      catMap[name].total += (p.stockb2b || 0) + (p.stockweb || 0) + (p.stockml || 0);
    });
    return Object.values(catMap).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [filtered, catNameById]);

  // 4) Heat de bajo stock (mínimo por producto)
  const lowStockHeat = useMemo(() => {
    return lowByChannelAll
      .map((p) => ({ name: p.talla ? `${p.name} · ${p.talla}` : p.name, minStock: Math.min(...p.low.map((l) => l.value)) }))
      .slice(0, 10);
  }, [lowByChannelAll]);

  // 5) Insights
  const insights = useMemo(() => {
    const critical = lowByChannelAll.filter((p) => Math.min(...p.low.map((l) => l.value)) === 0).length;
    const avgStock = Math.round(totalMadre / (filtered.length || 1));
    const tip = totalWeb < totalB2B ?
      "🌐 El canal Web tiene menos stock que B2B; considera redistribuir." :
      "🏬 B2B domina la disponibilidad; verifica el equilibrio por demanda.";
    return [
      `🔴 ${critical} productos están sin stock en algún canal`,
      `📦 Promedio de stock por producto: ${avgStock}`,
      tip,
    ];
  }, [lowByChannelAll, totalMadre, filtered.length, totalWeb, totalB2B]);

  const lastUpdate = new Date().toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (loading) {
    return <div className="text-center py-12 text-neutral-500">Cargando dashboard...</div>;
  }

  return (
    <div className="space-y-6 bg-transparent text-neutral-900 dark:text-white min-h-screen p-4 transition-colors duration-300">
      {/* Header + filtros globales */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Dashboard</h2>
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <RefreshCw size={16} />
            <span>Última actualización: {lastUpdate}</span>
          </div>
        </div>

        <div className="w-full lg:w-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Filter size={16} />
            <span className="text-sm">Filtros</span>
          </div>

          <select
            value={categoryFilter === "all" ? "all" : String(categoryFilter)}
            onChange={(e) => {
              const val = e.target.value === "all" ? "all" : Number(e.target.value);
              setCategoryFilter(val as any);
            }}
            className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-800 dark:text-white focus:ring-2 focus:ring-neutral-500 outline-none"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id_categoria} value={cat.id_categoria}>
                {cat.nombre_categoria}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-800 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-400 w-full lg:w-64 focus:ring-2 focus:ring-neutral-500 outline-none"
          />
        </div>
      </div>

      {/* KPIs con micrográficos */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Stock Madre */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">Stock Madre (Total)</h3>
            <Package className="text-neutral-500 dark:text-neutral-400" size={22} />
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{totalMadre}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">unidades totales</p>
          <div className="mt-3" style={{ width: "100%", height: 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ canal: "B2B", value: totalB2B }, { canal: "Web", value: totalWeb }, { canal: "ML", value: totalML }]}>
                <XAxis dataKey="canal" hide />
                <Tooltip cursor={false} />
                <Bar dataKey="value">
                  <Cell fill={CH_PURPLE} />
                  <Cell fill={CH_SKY} />
                  <Cell fill={CH_AMBER} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

       {/* B2B */}
      <div className="bg-purple-600 text-white rounded-xl p-6 shadow-md hover:shadow-lg transition-all">
        <div className="flex items-center justify-between mb-4 opacity-90">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Stock B2B</h3>
          <Building2 size={24} />
        </div>
        <p className="text-3xl font-bold">{totalB2B}</p>
        <p className="text-sm opacity-90 mt-2">unidades canal B2B</p>
      </div>

      {/* Web */}
      <div className="bg-sky-600 text-white rounded-xl p-6 shadow-md hover:shadow-lg transition-all">
        <div className="flex items-center justify-between mb-4 opacity-90">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Stock Web</h3>
          <Globe size={24} />
        </div>
        <p className="text-3xl font-bold">{totalWeb}</p>
        <p className="text-sm opacity-90 mt-2">unidades en sitio web</p>
      </div>

      {/* ML */}
      <div className="bg-amber-500 text-white rounded-xl p-6 shadow-md hover:shadow-lg transition-all">
        <div className="flex items-center justify-between mb-4 opacity-90">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Stock ML</h3>
          <ShoppingCart size={24} />
        </div>
        <p className="text-3xl font-bold">{totalML}</p>
        <p className="text-sm opacity-90 mt-2">unidades en Mercado Libre</p>
      </div>
    </div>

      {/* Distribución por categoría + Donut por canal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <TrendingUp className="text-neutral-500 dark:text-neutral-400" size={20} />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Stock por Categoría (Top 12)</h3>
          </div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockByCategory}>
                <XAxis dataKey="categoria" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="B2B" stackId="a" fill={CH_PURPLE} />
                <Bar dataKey="Web" stackId="a" fill={CH_SKY} />
                <Bar dataKey="ML" stackId="a" fill={CH_AMBER} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <Package className="text-neutral-500 dark:text-neutral-400" size={20} />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Distribución por Canal</h3>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie dataKey="value" data={compData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} label>
                  <Cell fill={CH_PURPLE} />
                  <Cell fill={CH_SKY} />
                  <Cell fill={CH_AMBER} />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-3 text-center text-sm text-neutral-700 dark:text-neutral-300">
            <div>B2B: {totalB2B}</div>
            <div>Web: {totalWeb}</div>
            <div>ML: {totalML}</div>
          </div>
        </div>
      </div>

      {/* Top total + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top por TOTAL */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <TrendingUp className="text-neutral-500 dark:text-neutral-400" size={20} />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Mayor Stock Total (según filtros)</h3>
          </div>
          <div className="space-y-4">
            {topProducts.map((product, index) => {
              const total = (product.stockb2b || 0) + (product.stockweb || 0) + (product.stockml || 0);
              return (
                <div key={product.id} className="flex items-center space-x-4 pb-4 border-b border-neutral-200 dark:border-neutral-700 last:border-0">
                  <div className="flex-shrink-0 w-8 h-8 bg-neutral-700 dark:bg-neutral-800 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 dark:text-white truncate">
                      {product.name}
                      {product.talla_etiqueta ? ` · ${product.talla_etiqueta}` : ""}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">{total}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">unidades</p>
                  </div>
                </div>
              );
            })}
            {topProducts.length === 0 && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No hay productos con el filtro actual.</p>
            )}
          </div>
        </div>

        {/* Alertas */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-neutral-500 dark:text-neutral-400" size={20} />
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Alertas de Stock Bajo por Canal</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Canal:</span>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value as Channel)}
                className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-sm text-neutral-800 dark:text-white focus:ring-2 focus:ring-neutral-500 outline-none"
              >
                <option value="all">Todos</option>
                <option value="B2B">B2B</option>
                <option value="Web">Web</option>
                <option value="ML">ML</option>
              </select>
            </div>
          </div>

          {alertsPageData.length === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">No hay alertas con el filtro actual 🎉</p>
          ) : (
            <>
              <div className="space-y-3">
                {alertsPageData.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-3 last:border-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 dark:text-white truncate">
                        {entry.name}
                        {entry.talla ? ` · ${entry.talla}` : ""}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{entry.sku}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      {entry.low.map((l) => (
                        <div key={l.channel} className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              l.channel === "B2B"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
                                : l.channel === "Web"
                                ? "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300"
                            }`}
                          >
                            {l.channel}
                          </span>
                          <span
                            className={`text-sm font-semibold ${
                              l.value < 5 ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"
                            }`}
                          >
                            {l.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Paginación */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  Mostrando <strong>{alertFrom}</strong>–<strong>{alertTo}</strong> de <strong>{alertTotal}</strong> alertas
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">Por página:</span>
                  <select
                    value={alertPageSize}
                    onChange={(e) => {
                      setAlertPageSize(Number(e.target.value));
                      setAlertPage(1);
                    }}
                    className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-sm"
                  >
                    {[5, 10, 20, 30].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 ml-2">
                    <button className="border rounded p-1 disabled:opacity-50" onClick={goFirst} disabled={alertPage === 1}>
                      <ChevronsLeft size={16} />
                    </button>
                    <button className="border rounded p-1 disabled:opacity-50" onClick={goPrev} disabled={alertPage === 1}>
                      <ChevronLeft size={16} />
                    </button>
                    <span className="mx-2 text-sm">
                      Página <strong>{alertPage}</strong> de <strong>{alertTotalPages}</strong>
                    </span>
                    <button className="border rounded p-1 disabled:opacity-50" onClick={goNext} disabled={alertPage === alertTotalPages}>
                      <ChevronRight size={16} />
                    </button>
                    <button className="border rounded p-1 disabled:opacity-50" onClick={goLast} disabled={alertPage === alertTotalPages}>
                      <ChevronsRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">
            Umbral de “bajo stock”: &lt; {THRESHOLD} unidades por canal
          </div>
        </div>
      </div>
    </div>
  );
};
