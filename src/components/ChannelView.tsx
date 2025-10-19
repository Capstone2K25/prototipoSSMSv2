import { useEffect, useMemo, useState } from 'react';
import {
  Globe,
  ShoppingCart,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Upload,
  Repeat,
} from 'lucide-react';
import { supabase } from '../supabaseClient';

interface ChannelViewProps {
  channel: 'wordpress' | 'mercadolibre';
}

type Product = {
  id: number;
  name: string;
  sku: string;
  categoria?: string | null;
  price: number;
  stockb2b: number;
  stockweb: number;
  stockml: number;
};

type MLCreds = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO
  updated_at: string; // ISO
};

type MLLink = {
  sku: string;
  meli_item_id: string;
  meli_variation_id: string | null;
};

export const ChannelView = ({ channel }: ChannelViewProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null); // sku en operación
  const [lastSync, setLastSync] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const [mlCreds, setMlCreds] = useState<MLCreds | null>(null);
  const [mlLinks, setMlLinks] = useState<Record<string, MLLink>>({}); // sku -> link

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

  // ===== Helpers =====
  const formatDate = (date: Date) =>
    date.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const isMeliConnected = useMemo(() => {
    if (!mlCreds) return false;
    const exp = new Date(mlCreds.expires_at).getTime();
    return Date.now() < exp - 2 * 60 * 1000; // válido con margen de 2 minutos
  }, [mlCreds]);

  // ===== Fetch datos =====
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('productos')
      .select('id, name, sku, categoria, price, stockb2b, stockweb, stockml')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error al cargar productos:', error);
    } else if (data) {
      setProducts((data as any[]).map((p) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        categoria: p.categoria ?? '',
        price: Number(p.price) || 0,
        stockb2b: Number(p.stockb2b) || 0,
        stockweb: Number(p.stockweb) || 0,
        stockml: Number(p.stockml) || 0,
      })));
    }
    setLoading(false);
  };

  const fetchMlCreds = async () => {
    const { data, error } = await supabase
      .from('ml_credentials')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Error leyendo ml_credentials:', error);
      setMlCreds(null);
    } else {
      setMlCreds(data as any);
    }
  };

  const fetchMlLinks = async () => {
    const { data, error } = await supabase
      .from('ml_links')
      .select('sku, meli_item_id, meli_variation_id');
    if (error) {
      console.error('Error leyendo ml_links:', error);
      setMlLinks({});
    } else {
      const map: Record<string, MLLink> = {};
      (data as any[]).forEach((row) => {
        map[row.sku] = {
          sku: row.sku,
          meli_item_id: row.meli_item_id,
          meli_variation_id: row.meli_variation_id,
        };
      });
      setMlLinks(map);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await Promise.all([fetchProducts(), fetchMlCreds(), fetchMlLinks()]);
    setSyncing(false);
    setLastSync(new Date());
  };

  useEffect(() => {
    handleSync();
    const interval = setInterval(handleSync, 1000 * 60 * 3); // cada 3 min
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Derivados =====
  const channelProducts = useMemo(() => {
    const key = config.stockKey;
    return products
      .map((p) => ({ ...p, channelStock: (p as any)[key] as number }))
      .filter((p) => p.channelStock > 0); // solo con stock disponible en el canal
  }, [products, config.stockKey]);

  const totalPublished = useMemo(
    () => channelProducts.filter((p) => !!mlLinks[p.sku]).length,
    [channelProducts, mlLinks]
  );
  const totalStock = useMemo(
    () => channelProducts.reduce((sum, p) => sum + (p.channelStock || 0), 0),
    [channelProducts]
  );

  // ===== Acciones Mercado Libre (vía Edge Function) =====
  /**
   * Invoca la Edge Function 'meli-sync-item'
   * - action: 'create' | 'update'
   * - create: crea publicación (o vincula) desde SKU y devuelve item_id (+ guarda en ml_links)
   * - update: sincroniza available_quantity de una publicación ya vinculada
   */
  const invokeMeli = async (payload: any) => {
    const { data, error } = await supabase.functions.invoke('meli-sync-item', {
      body: payload,
    });
    if (error) throw new Error(error.message || 'Fallo en función ML');
    return data;
  };

  const handlePublish = async (p: Product) => {
    try {
      setRowBusy(p.sku);
      if (!isMeliConnected) throw new Error('Mercado Libre desconectado. Conecta antes de publicar.');

      // Si ya hay link, pasamos a update; si no, create
      const link = mlLinks[p.sku];
      if (link) {
        // actualizar stock
        const res = await invokeMeli({
          action: 'update',
          sku: p.sku,
          stock: p.stockml, // canal ML
        });
        console.log('ML update ok:', res);
        alert(`Stock actualizado en ML: ${p.name} (SKU ${p.sku}) → ${p.stockml}`);
      } else {
        // crear publicación (mínimos: título, precio, categoría, stock, sku)
        // La categoría puede resolverse en la Edge Function (por mapeo propio o fija).
        const res = await invokeMeli({
          action: 'create',
          sku: p.sku,
          title: p.name,
          price: p.price,
          category_hint: p.categoria || 'MLA3530', // ejemplo: indumentaria (ajústalo server-side)
          stock: p.stockml,
        });
        console.log('ML create ok:', res);
        alert(`Publicado en ML: ${p.name} (SKU ${p.sku})`);
        // refrescamos mapeos
        await fetchMlLinks();
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error ML: ${e.message || e}`);
    } finally {
      setRowBusy(null);
    }
  };

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

      {/* Métricas + estado conexión */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Estado */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Estado</h3>
            {isMeliConnected ? (
              <CheckCircle className="text-green-600" size={20} />
            ) : (
              <AlertCircle className="text-red-600" size={20} />
            )}
          </div>
          {isMeliConnected ? (
            <>
              <p className="text-2xl font-bold text-green-600">Conectado</p>
              <p className="text-xs text-neutral-500 mt-1">
                Expira el {new Date(mlCreds!.expires_at).toLocaleString('es-CL')}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-red-600">Desconectado</p>
              <p className="text-xs text-neutral-500 mt-1">
                Ve a credenciales y conecta tu cuenta de Mercado Libre.
              </p>
            </>
          )}
        </div>

        {/* Productos con stock ML > 0 */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Productos</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{totalPublished}/{channelProducts.length}</p>
          <p className="text-sm text-neutral-500 mt-1">publicados / con stock ML</p>
        </div>

        {/* Stock total ML */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock ML Total</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{totalStock}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades en canal ML</p>
        </div>

        {/* Acción masiva (publicar/actualizar todos) */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Acciones</h3>
          </div>
          <button
            disabled={!isMeliConnected || syncing || channelProducts.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50"
            onClick={async () => {
              if (!isMeliConnected) return;
              setSyncing(true);
              try {
                // Publica/actualiza todos en serie (simple)
                for (const p of channelProducts) {
                  await handlePublish(p);
                }
              } finally {
                setSyncing(false);
              }
            }}
            title="Publicar/actualizar todos los productos con stock ML"
          >
            <Repeat size={18} />
            <span>Sincronizar todos</span>
          </button>
        </div>
      </div>

      {/* Tabla de productos con stock ML */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-neutral-900">Productos con stock en {config.title}</h3>
          <span className="text-sm text-neutral-600">Última sync: {formatDate(lastSync)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Producto</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">SKU</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Precio</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock ML</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Publicación ML</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Acción</th>
              </tr>
            </thead>
            <tbody>
              {channelProducts.map((product) => {
                const link = mlLinks[product.sku];
                const isLinked = !!link;
                return (
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
                    <td className="py-4 px-4 text-center text-neutral-900 font-semibold">
                      {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(product.price || 0)}
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-neutral-900">
                      {product.stockml}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {isLinked ? (
                          <span className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1">
                            <LinkIcon size={14} />
                            <span>Publicado</span>
                          </span>
                        ) : (
                          <span className="bg-neutral-100 text-neutral-600 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1">
                            <AlertCircle size={14} />
                            <span>Sin publicar</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-center">
                        <button
                          onClick={() => handlePublish(product)}
                          disabled={!isMeliConnected || rowBusy === product.sku}
                          className={`flex items-center gap-2 px-3 py-2 rounded
                            ${isLinked ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}
                            text-white disabled:opacity-50`}
                          title={isLinked ? 'Actualizar stock en ML' : 'Publicar en ML'}
                        >
                          {rowBusy === product.sku ? (
                            <RefreshCw size={16} className="animate-spin" />
                          ) : isLinked ? (
                            <Repeat size={16} />
                          ) : (
                            <Upload size={16} />
                          )}
                          <span>{isLinked ? 'Actualizar ML' : 'Publicar en ML'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {channelProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-neutral-500">
                    No hay productos con stock ML disponible.
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
