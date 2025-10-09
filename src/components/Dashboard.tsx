import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { TrendingUp, Package, AlertTriangle, RefreshCw } from 'lucide-react';

type Product = {
  id: number;
  name: string;
  sku: string;
  stockmadre: number;
  stockweb: number;
  stockml: number;
};

export const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // 🛰️ Fetch productos desde Supabase
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('productos')
      .select('id, name, sku, stockmadre, stockweb, stockml');

    if (!error && data) {
      setProducts(data as Product[]);
    } else {
      console.error('Error al cargar productos:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
    const interval = setInterval(fetchProducts, 100000);
    return () => clearInterval(interval);
  }, []);

  // 🧮 Totales dinámicos
  const totalMadre = products.reduce((acc, p) => acc + (p.stockmadre || 0), 0);
  const totalWeb = products.reduce((acc, p) => acc + (p.stockweb || 0), 0);
  const totalML = products.reduce((acc, p) => acc + (p.stockml || 0), 0);

  // 🚨 Productos con stock bajo en Madre
  const lowStockProducts = products.filter(p => p.stockmadre < 10);

  // 🔝 Productos con mayor stock (simulación de “mayor rotación” por ahora)
  const topProducts = [...products]
    .sort((a, b) => b.stockmadre - a.stockmadre)
    .slice(0, 5);

  const lastUpdate = new Date().toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (loading) {
    return (
      <div className="text-center py-12 text-neutral-500">
        Cargando dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Dashboard</h2>
        <div className="flex items-center space-x-2 text-sm text-neutral-600">
          <RefreshCw size={16} />
          <span>Última actualización: {lastUpdate}</span>
        </div>
      </div>

      {/* Tarjetas de totales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock Madre</h3>
            <Package className="text-green-700" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalMadre}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades totales</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock Web</h3>
            <Package className="text-blue-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalWeb}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades publicadas</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock ML</h3>
            <Package className="text-yellow-500" size={24} />
          </div>
          <p className="text-3xl font-bold text-neutral-900">{totalML}</p>
          <p className="text-sm text-neutral-500 mt-2">unidades en Mercado Libre</p>
        </div>
      </div>

      {/* Top rotación + Alertas de bajo stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top productos */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <TrendingUp className="text-green-700" size={24} />
            <h3 className="text-lg font-bold text-neutral-900">Mayor Stock Madre</h3>
          </div>
          <div className="space-y-4">
            {topProducts.map((product, index) => (
              <div key={product.id} className="flex items-center space-x-4 pb-4 border-b border-neutral-100 last:border-0">
                <div className="flex-shrink-0 w-8 h-8 bg-neutral-900 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-900 truncate">{product.name}</p>
                  <p className="text-sm text-neutral-500">{product.sku}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">{product.stockmadre}</p>
                    <p className="text-xs text-neutral-500">unidades</p>
                  </div>
                </div>
              </div>
            ))}
            {topProducts.length === 0 && (
              <p className="text-sm text-neutral-500">No hay productos cargados.</p>
            )}
          </div>
        </div>

        {/* Bajo stock */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <AlertTriangle className="text-red-600" size={24} />
            <h3 className="text-lg font-bold text-neutral-900">Alertas de Stock Bajo</h3>
          </div>
          <div className="space-y-4">
            {lowStockProducts.map(product => (
              <div key={product.id} className="flex items-center space-x-4 pb-4 border-b border-neutral-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-900 truncate">{product.name}</p>
                  <p className="text-sm text-neutral-500">{product.sku}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${product.stockmadre < 5 ? 'text-red-600' : 'text-orange-600'}`}>
                    {product.stockmadre}
                  </p>
                  <p className="text-xs text-neutral-500">unidades</p>
                </div>
              </div>
            ))}
            {lowStockProducts.length === 0 && (
              <p className="text-sm text-neutral-500">No hay alertas de bajo stock 🎉</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
