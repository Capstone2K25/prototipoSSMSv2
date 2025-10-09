import { useEffect, useState } from 'react';
import { Globe, ShoppingCart, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface ChannelViewProps {
  channel: 'wordpress' | 'mercadolibre';
}

type Product = {
  id: number;
  name: string;
  sku: string;
  categoria?: string | null;
  stockmadre: number;
  stockweb: number;
  stockml: number;
};

export const ChannelView = ({ channel }: ChannelViewProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());
  const [loading, setLoading] = useState(true);

  // Configuración del canal
  const channelConfig = {
    wordpress: {
      title: 'WordPress',
      icon: <Globe size={24} />,
      color: 'blue',
      stockKey: 'stockweb' as const,
      description: 'Gestión de inventario en tienda online',
    },
    mercadolibre: {
      title: 'Mercado Libre',
      icon: <ShoppingCart size={24} />,
      color: 'yellow',
      stockKey: 'stockml' as const,
      description: 'Sincronización con marketplace',
    },
  };

  const config = channelConfig[channel];

  // 🔄 Obtener productos desde Supabase
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('productos')
      .select('id, name, sku, categoria, stockmadre, stockweb, stockml')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error al cargar productos:', error);
    } else if (data) {
      setProducts(data as Product[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // 📊 Calcular métricas del canal
  const channelProducts = products.map((p) => ({
    ...p,
    channelStock: p[config.stockKey],
  }));

  const totalPublished = channelProducts.filter((p) => p.channelStock > 0).length;
  const totalStock = channelProducts.reduce((sum, p) => sum + (p.channelStock || 0), 0);

  const handleSync = async () => {
    setSyncing(true);
    await fetchProducts();
    setTimeout(() => {
      setSyncing(false);
      setLastSync(new Date());
    }, 1000);
  };

  const formatDate = (date: Date) =>
    date.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <div className="text-center py-12 text-neutral-500">
        Cargando productos del canal {config.title}...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className={`p-3 bg-${config.color}-100 text-${config.color}-600 rounded-lg`}>
            {config.icon}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">{config.title}</h2>
            <p className="text-sm text-neutral-600">{config.description}</p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          <span>{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Estado</h3>
            <CheckCircle className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-green-600">Conectado</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Productos</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{totalPublished}</p>
          <p className="text-sm text-neutral-500 mt-1">disponibles en {config.title}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock Total</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{totalStock}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades en canal</p>
        </div>
      </div>

      {/* Tabla de productos */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-neutral-900">Productos en {config.title}</h3>
          <span className="text-sm text-neutral-600">Última sync: {formatDate(lastSync)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Producto</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">SKU</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock Canal</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock Madre</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {channelProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                >
                  <td className="py-4 px-4">
                    <div>
                      <p className="font-semibold text-neutral-900">{product.name}</p>
                      <p className="text-sm text-neutral-500">{product.categoria || '—'}</p>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <code className="text-sm bg-neutral-100 px-2 py-1 rounded">{product.sku}</code>
                  </td>
                  <td className="py-4 px-4 text-center font-bold text-neutral-900">
                    {product.channelStock}
                  </td>
                  <td className="py-4 px-4 text-center text-neutral-600">{product.stockmadre}</td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      {product.channelStock > 0 ? (
                        <span className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center space-x-1">
                          <CheckCircle size={14} />
                          <span>Disponible</span>
                        </span>
                      ) : (
                        <span className="bg-neutral-100 text-neutral-600 text-xs font-semibold px-3 py-1 rounded-full flex items-center space-x-1">
                          <AlertCircle size={14} />
                          <span>Sin stock</span>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {channelProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-neutral-500">
                    No hay productos disponibles.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
