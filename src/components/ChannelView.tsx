import { useState } from 'react';
import { Globe, ShoppingCart, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { mockProducts } from '../data/mockData';

interface ChannelViewProps {
  channel: 'wordpress' | 'mercadolibre';
}

export const ChannelView = ({ channel }: ChannelViewProps) => {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());

  const channelConfig = {
    wordpress: {
      title: 'WordPress',
      icon: <Globe size={24} />,
      color: 'blue',
      stockKey: 'stockWeb' as const,
      description: 'Gestión de inventario en tienda online'
    },
    mercadolibre: {
      title: 'Mercado Libre',
      icon: <ShoppingCart size={24} />,
      color: 'yellow',
      stockKey: 'stockML' as const,
      description: 'Sincronización con marketplace'
    }
  };

  const config = channelConfig[channel];
  const products = mockProducts.map(p => ({
    ...p,
    channelStock: p[config.stockKey]
  }));

  const totalPublished = products.filter(p => p.channelStock > 0).length;
  const totalStock = products.reduce((sum, p) => sum + p.channelStock, 0);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSync(new Date());
    }, 2000);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
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
          <p className="text-sm text-neutral-500 mt-1">publicados</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock Total</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{totalStock}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades</p>
        </div>
      </div>

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
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock en Canal</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock Madre</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                  <td className="py-4 px-4">
                    <div>
                      <p className="font-semibold text-neutral-900">{product.name}</p>
                      <p className="text-sm text-neutral-500">{product.category}</p>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <code className="text-sm bg-neutral-100 px-2 py-1 rounded">{product.sku}</code>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="font-bold text-neutral-900">{product.channelStock}</span>
                  </td>
                  <td className="py-4 px-4 text-center text-neutral-600">{product.stockMadre}</td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      {product.channelStock > 0 ? (
                        <span className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center space-x-1">
                          <CheckCircle size={14} />
                          <span>Publicado</span>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
