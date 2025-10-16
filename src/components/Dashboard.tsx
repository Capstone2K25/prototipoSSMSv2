import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  RefreshCw,
  Store,
  Building2,
  ShoppingBag,
  Filter
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
  categoria: string | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
};

export const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Umbral bajo stock (por canal)
  const THRESHOLD = 10;

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('productos')
      .select('id, name, sku, categoria, stockb2b, stockweb, stockml');
    if (!error && data) setProducts(data as Product[]);
    else console.error('Error al cargar productos:', error);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
    const interval = setInterval(fetchProducts, 100000);
    return () => clearInterval(interval);
  }, []);

  // Categorías únicas para el selector
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.categoria && p.categoria.trim().length > 0) set.add(p.categoria);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Subconjunto filtrado
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(p => {
      const matchCat = categoryFilter === 'all' || (p.categoria || '').toLowerCase() === categoryFilter.toLowerCase();
      const matchText =
        term.length === 0 ||
        (p.name || '').toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term);
      return matchCat && matchText;
    });
  }, [products, categoryFilter, search]);

  // Totales por canal (en base al filtro)
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

  // Alertas de stock bajo por canal (filtrado)
  type LowEntry = { id: number; name: string; sku: string; channel: 'B2B' | 'Web' | 'ML'; value: number };
  const lowByChannel: LowEntry[] = useMemo(() => {
    const out: LowEntry[] = [];
    for (const p of filtered) {
      if ((p.stockb2b || 0) < THRESHOLD) out.push({ id: p.id, name: p.name, sku: p.sku, channel: 'B2B', value: p.stockb2b || 0 });
      if ((p.stockweb || 0) < THRESHOLD) out.push({ id: p.id, name: p.name, sku: p.sku, channel: 'Web', value: p.stockweb || 0 });
      if ((p.stockml  || 0) < THRESHOLD) out.push({ id: p.id, name: p.name, sku: p.sku, channel: 'ML',  value: p.stockml  || 0 });
    }
    // Ordenamos primero por valor asc y luego por canal
    const channelRank = { B2B: 0, Web: 1, ML: 2 } as const;
    return out.sort((a, b) => (a.value - b.value) || (channelRank[a.channel] - channelRank[b.channel]));
  }, [filtered]);

  // Datos para mini-gráficos (composición por canal)
  const compData = useMemo(() => ([
    { canal: 'B2B', value: totalB2B },
    { canal: 'Web', value: totalWeb },
    { canal: 'ML',  value: totalML  },
  ]), [totalB2B, totalWeb, totalML]);

  // Sparklines por canal (simple serie Line con 3 puntos B2B/Web/ML simulando composición)
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
      {/* Header + filtros */}
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">Todas las categorías</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
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
          <div className="mt-4 h-10">
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
          <div className="mt-4 h-10">
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
          <div className="mt-4 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Tooltip cursor={false} />
                <Line type="monotone" dataKey="web" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ML */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock ML</h3>
            <ShoppingBag className="text-amber-500" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalML}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades en Mercado Libre</p>
          <div className="mt-4 h-10">
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
                    <p className="font-semibold text-neutral-900 truncate">{product.name}</p>
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

        {/* Alertas de stock bajo por canal */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <AlertTriangle className="text-red-600" size={24} />
            <h3 className="text-lg font-bold text-neutral-900">Alertas de Stock Bajo por Canal</h3>
          </div>

          {lowByChannel.length === 0 ? (
            <p className="text-sm text-neutral-500">No hay alertas con el filtro actual 🎉</p>
          ) : (
            <div className="space-y-3">
              {lowByChannel.map(entry => (
                <div key={`${entry.id}-${entry.channel}`} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">{entry.name}</p>
                    <p className="text-xs text-neutral-500">{entry.sku}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold
                      ${entry.channel === 'B2B' ? 'bg-fuchsia-100 text-fuchsia-700'
                        : entry.channel === 'Web' ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'}`}>
                      {entry.channel}
                    </span>
                    <span className={`text-sm font-bold ${entry.value < 5 ? 'text-red-600' : 'text-orange-600'}`}>
                      {entry.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-neutral-400 mt-3">
            Umbral de “bajo stock”: &lt; {THRESHOLD} unidades por canal (aplicado al conjunto filtrado).
          </p>
        </div>
      </div>
    </div>
  );
};
