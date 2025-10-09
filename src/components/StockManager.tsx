import { useEffect, useState } from 'react';
import { RefreshCw, Search, Filter } from 'lucide-react';
import { supabase } from '../supabaseClient'; // 👈 Importa tu cliente

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number;
  category: string;
  stockmadre: number;
  stockweb: number;
  stockml: number;
};

export const StockManager = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // 🔹 Cargar productos desde Supabase
  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase.from('productos').select('*');
      if (error) console.error(error);
      else setProducts(data);
      setLoading(false);
    };

    fetchProducts();
  }, []);

  const categories = ['all', ...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const lastUpdate = new Date().toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);

  const getStockStatus = (stock: number) => {
    if (stock < 10) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Crítico' };
    if (stock < 20) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Bajo' };
    return { color: 'text-green-700', bg: 'bg-green-50', label: 'Normal' };
  };

  if (loading)
    return <div className="text-center py-12 text-neutral-500">Cargando datos...</div>;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Stock Madre</h2>
          <p className="text-sm text-neutral-600 mt-1">Vista consolidada de inventario</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-neutral-600">
          <RefreshCw size={16} />
          <span>Última sync: {lastUpdate}</span>
        </div>
      </div>

      {/* Controles de búsqueda y filtro */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-700 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="pl-10 pr-8 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-700 focus:border-transparent appearance-none bg-white"
            >
              <option value="all">Todas las categorías</option>
              {categories.filter(c => c !== 'all').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla de productos */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Producto</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">SKU</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Precio</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock Madre</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock Web</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock ML</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Total</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => {
                const totalStock = product.stockmadre + product.stockweb + product.stockml;
                const status = getStockStatus(product.stockmadre);
                return (
                  <tr key={product.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-semibold text-neutral-900">{product.name}</p>
                        <p className="text-sm text-neutral-500">{product.category}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4"><code className="text-sm bg-neutral-100 px-2 py-1 rounded">{product.sku}</code></td>
                    <td className="py-4 px-4 text-center font-semibold text-neutral-900">{formatPrice(product.price)}</td>
                    <td className="py-4 px-4 text-center font-bold text-neutral-900">{product.stockmadre}</td>
                    <td className="py-4 px-4 text-center text-neutral-700">{product.stockweb}</td>
                    <td className="py-4 px-4 text-center text-neutral-700">{product.stockml}</td>
                    <td className="py-4 px-4 text-center font-bold text-neutral-900">{totalStock}</td>
                    <td className="py-4 px-4 text-center">
                      <span className={`${status.bg} ${status.color} text-xs font-semibold px-3 py-1 rounded-full`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-neutral-500">
            No se encontraron productos con los filtros aplicados
          </div>
        )}
      </div>
    </div>
  );
};
