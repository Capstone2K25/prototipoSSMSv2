import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { wooSyncDown } from '../data/woo';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  RefreshCw,
  Store,
  Building2,
  ShoppingBag,
  Filter,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  LineChart,
  Line
} from 'recharts';

type Product = {
  id: number;
  name: string;
  sku: string;
  categoria_id: number | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
  talla_id: number | null;           // ⬅️ nuevo
  talla_etiqueta: string | null;     // ⬅️ nuevo
};


type Category = { id_categoria: number; nombre_categoria: string };
type Channel = 'all' | 'B2B' | 'Web' | 'ML';

export const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros globales
  const [categoryFilter, setCategoryFilter] = useState<'all' | number>('all');
  const [search, setSearch] = useState<string>('');

  // Filtro local (tarjeta) de alertas por canal
  const [channelFilter, setChannelFilter] = useState<Channel>('all');

  // Paginación local de alertas
  const [alertPage, setAlertPage] = useState(1);
  const [alertPageSize, setAlertPageSize] = useState(10);

  const [syncing, setSyncing] = useState(false);

  async function syncAndReload() {
    setSyncing(true);
    try {
      await wooSyncDown();   // baja desde Woo y escribe en productos.stockweb
      await fetchProducts(); // recarga métricas/cards
    } finally {
      setSyncing(false);
    }
  }

  // Umbral bajo stock (por canal)
  const THRESHOLD = 10;

  const fetchProducts = async () => {
    setLoading(true);

    const [{ data: prodData, error: prodErr }] = await Promise.all([
  supabase
    .from('productos')
    .select(`
      id, name, sku, categoria_id, stockb2b, stockweb, stockml, talla_id,
      tallas:talla_id ( id_talla, etiqueta )
    `),
  supabase
    .from('categorias')
    .select('id_categoria, nombre_categoria')
    .order('nombre_categoria', { ascending: true }),
]);

if (!prodErr && prodData) {
  setProducts((prodData as any[]).map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    categoria_id: p.categoria_id,
    stockb2b: p.stockb2b,
    stockweb: p.stockweb,
    stockml: p.stockml,
    talla_id: p.talla_id ?? null,
    talla_etiqueta: p.tallas?.etiqueta ?? null,   // ⬅️ aquí viene la etiqueta de talla
  })));
} else {
  console.error('Error al cargar productos:', prodErr);
}

    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
    const interval = setInterval(fetchProducts, 100000);
    return () => clearInterval(interval);
  }, []);

  // Mapa id->nombre para mostrar nombres en UI cuando se necesite
  const catNameById = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach(c => { map[c.id_categoria] = c.nombre_categoria; });
    return map;
  }, [categories]);

  // Subconjunto filtrado (global)
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(p => {
      const matchCat =
        categoryFilter === 'all' ||
        (p.categoria_id ?? null) === categoryFilter;
      const matchText =
        term.length === 0 ||
        (p.name || '').toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term);
      return matchCat && matchText;
    });
  }, [products, categoryFilter, search]);

  // Totales por canal (en base al filtro global)
  const totalB2B = useMemo(() => filtered.reduce((acc, p) => acc + (p.stockb2b || 0), 0), [filtered]);
  const totalWeb = useMemo(() => filtered.reduce((acc, p) => acc + (p.stockweb || 0), 0), [filtered]);
  const totalML  = useMemo(() => filtered.reduce((acc, p) => acc + (p.stockml  || 0), 0), [filtered]);
  const totalMadre = totalB2B + totalWeb + totalML; // “Madre” = total

  // Top por TOTAL (filtrado)
  const topProducts = useMemo(() => {
    return [...filtered]
      .map(p => ({ ...p, total: (p.stockb2b || 0) + (p.stockweb || 0) + (p.stockml || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filtered]);

  // Alertas de stock bajo agrupadas por producto
  type LowGroup = {
  id: number;
  name: string;
  sku: string;
  talla?: string | null;   // ⬅️ nuevo
  low: { channel: 'B2B' | 'Web' | 'ML'; value: number }[];
};

  const lowByChannelAll: LowGroup[] = useMemo(() => {
    const channelRank = { B2B: 0, Web: 1, ML: 2 } as const;

    const out: LowGroup[] = [];
    for (const p of filtered) {
      const low: LowGroup['low'] = [];
      const b2b = p.stockb2b || 0;
      const web = p.stockweb || 0;
      const ml  = p.stockml  || 0;

      if (b2b < THRESHOLD) low.push({ channel: 'B2B', value: b2b });
      if (web < THRESHOLD) low.push({ channel: 'Web', value: web });
      if (ml  < THRESHOLD) low.push({ channel: 'ML',  value: ml  });

      if (low.length > 0) {
        // Ordena chips dentro de la fila: B2B → Web → ML
        low.sort((a, b) => channelRank[a.channel] - channelRank[b.channel]);
        out.push({
  id: p.id,
  name: p.name,
  sku: p.sku,
  talla: p.talla_etiqueta,     // ⬅️ nuevo
  low
});

      }
    }

    // Ordena filas por lo más crítico (stock mínimo asc) y luego por nombre
    return out.sort((a, b) => {
      const minA = Math.min(...a.low.map(x => x.value));
      const minB = Math.min(...b.low.map(x => x.value));
      if (minA !== minB) return minA - minB;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, THRESHOLD]);

  // Filtro de canal solo para la tarjeta (opera sobre 'low' de cada producto)
  const lowByChannelFiltered = useMemo(() => {
    const base = channelFilter === 'all'
      ? lowByChannelAll
      : lowByChannelAll
          .map(g => ({
            ...g,
            low: g.low.filter(l => l.channel === channelFilter),
          }))
          .filter(g => g.low.length > 0); // descarta filas sin ese canal

    // reset de página al cambiar filtro
    setAlertPage(1);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowByChannelAll, channelFilter]);

  // Paginación local sobre alertas
  const alertTotal = lowByChannelFiltered.length;
  const alertTotalPages = Math.max(1, Math.ceil(alertTotal / alertPageSize));
  const alertFrom = alertTotal === 0 ? 0 : (alertPage - 1) * alertPageSize + 1;
  const alertTo = Math.min(alertTotal, alertPage * alertPageSize);
  const alertsPageData = useMemo(() => {
    const from = (alertPage - 1) * alertPageSize;
    return lowByChannelFiltered.slice(from, from + alertPageSize);
  }, [lowByChannelFiltered, alertPage, alertPageSize]);

  const goFirst = () => setAlertPage(1);
  const goPrev  = () => setAlertPage(p => Math.max(1, p - 1));
  const goNext  = () => setAlertPage(p => Math.min(alertTotalPages, p + 1));
  const goLast  = () => setAlertPage(alertTotalPages);

  // Datos para mini-gráficos (composición por canal)
  const compData = useMemo(() => ([
    { canal: 'B2B', value: totalB2B },
    { canal: 'Web', value: totalWeb },
    { canal: 'ML',  value: totalML  },
  ]), [totalB2B, totalWeb, totalML]);

  // Sparklines (3 puntos: B2B/Web/ML)
  const sparkData = useMemo(() => {
    return [
      { idx: 1, b2b: totalB2B, web: undefined, ml: undefined },
      { idx: 2, b2b: undefined, web: totalWeb, ml: undefined },
      { idx: 3, b2b: undefined, web: undefined, ml: totalML },
    ];
  }, [totalB2B, totalWeb, totalML]);

  const lastUpdate = new Date().toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  if (loading) return <div className="text-center py-12 text-neutral-500">Cargando dashboard...</div>;

  return (
    <div className="space-y-6">
      {/* Header + filtros globales */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Dashboard</h2>
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <RefreshCw size={16} />
            <span>Última actualización: {lastUpdate}</span>
          </div>
        </div>

        <div className="w-full lg:w-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-neutral-500" />
            <span className="text-sm text-neutral-600">Filtros</span>
          </div>

          <select
            value={categoryFilter === 'all' ? 'all' : String(categoryFilter)}
            onChange={(e) => {
              const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
              setCategoryFilter(val as any);
            }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">Todas las categorías</option>
            {categories.map(cat => (
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
            className="border rounded-lg px-3 py-2 text-sm w-full lg:w-64"
          />
        </div>
      </div>

      {/* Tarjetas de totales (4) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Madre / Total */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock Madre (Total)</h3>
            <Package className="text-emerald-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalMadre}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades totales (según filtros)</p>
          <div className="mt-4" style={{ width: '100%', height: 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compData}>
                <XAxis dataKey="canal" hide />
                <Tooltip cursor={false} />
                <Bar dataKey="value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* B2B */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock B2B</h3>
            <Building2 className="text-fuchsia-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalB2B}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades canal B2B</p>
          <div className="mt-4" style={{ width: '100%', height: 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Tooltip cursor={false} />
                <Line type="monotone" dataKey="b2b" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Web */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock Web</h3>
            <Store className="text-blue-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalWeb}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades en sitio web</p>
          <div className="mt-4" style={{ width: '100%', height: 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Tooltip cursor={false} />
                <Line type="monotone" dataKey="web" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <button
            onClick={syncAndReload}
            disabled={syncing}
            className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-60"
            title="Sincronizar con WooCommerce"
          >
            {syncing ? "Sync..." : "Sincronizar"}
          </button>
        </div>

        {/* ML */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock ML</h3>
            <ShoppingBag className="text-amber-500" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalML}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades en Mercado Libre</p>
          <div className="mt-4" style={{ width: '100%', height: 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Tooltip cursor={false} />
                <Line type="monotone" dataKey="ml" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top total + Alertas por canal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top por TOTAL */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <TrendingUp className="text-green-700" size={24} />
            <h3 className="text-lg font-bold text-neutral-900">Mayor Stock Total (según filtros)</h3>
          </div>
          <div className="space-y-4">
            {topProducts.map((product, index) => {
              const total = (product.stockb2b || 0) + (product.stockweb || 0) + (product.stockml || 0);
              return (
                <div key={product.id} className="flex items-center space-x-4 pb-4 border-b border-neutral-100 last:border-0">
                  <div className="flex-shrink-0 w-8 h-8 bg-neutral-900 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                   <p className="font-semibold text-neutral-900 truncate">
  {product.name}{product.talla_etiqueta ? ` · ${product.talla_etiqueta}` : ''}
</p>

                    <p className="text-sm text-neutral-500">{product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">{total}</p>
                    <p className="text-xs text-neutral-500">unidades</p>
                  </div>
                </div>
              );
            })}
            {topProducts.length === 0 && <p className="text-sm text-neutral-500">No hay productos con el filtro actual.</p>}
          </div>
        </div>

        {/* Alertas de stock bajo por canal (con filtro y paginación) */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-600" size={24} />
              <h3 className="text-lg font-bold text-neutral-900">Alertas de Stock Bajo por Canal</h3>
            </div>

            {/* Filtro de canal (solo afecta esta tarjeta) */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600">Canal:</span>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value as Channel)}
                className="border rounded-lg px-2 py-1 text-sm"
                title="Filtrar alertas por canal"
              >
                <option value="all">Todos</option>
                <option value="B2B">B2B</option>
                <option value="Web">Web</option>
                <option value="ML">ML</option>
              </select>
            </div>
          </div>

          {/* Lista/Paginación de alertas */}
{alertsPageData.length === 0 ? (
  <p className="text-sm text-neutral-500">No hay alertas con el filtro actual 🎉</p>
) : (
  <>
    <div className="space-y-3">
      {alertsPageData.map(entry => (
        <div key={entry.id} className="flex items-center justify-between border-b pb-3 last:border-0">
          <div className="min-w-0">
            <p className="font-semibold text-neutral-900 truncate">
              {entry.name}{entry.talla ? ` · ${entry.talla}` : ''}
            </p>
            <p className="text-xs text-neutral-500">{entry.sku}</p>
            {entry.low.length > 0 && (
              <p className="text-[11px] text-neutral-500 mt-1">
                {/* opcional: nombre de categoría */}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {entry.low.map(l => (
              <div key={l.channel} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-semibold
                  ${l.channel === 'B2B' ? 'bg-fuchsia-100 text-fuchsia-700'
                    : l.channel === 'Web' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'}`}>
                  {l.channel}
                </span>
                <span className={`text-sm font-bold ${l.value < 5 ? 'text-red-600' : 'text-orange-600'}`}>
                  {l.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* Paginación de alertas */}
    <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="text-sm text-neutral-600">
        Mostrando <strong>{alertFrom}</strong>–<strong>{alertTo}</strong> de <strong>{alertTotal}</strong> alertas
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600">Por página:</span>
        <select
          value={alertPageSize}
          onChange={(e) => { setAlertPageSize(Number(e.target.value)); setAlertPage(1); }}
          className="border rounded px-2 py-1 text-sm"
        >
          {[5, 10, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
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

         
          <p className="text-xs text-neutral-400 mt-3">
            Umbral de “bajo stock”: &lt; {THRESHOLD} unidades por canal (aplicado al conjunto filtrado).
          </p>
        </div>
      </div>
    </div>
  );
};
