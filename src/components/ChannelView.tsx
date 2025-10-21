// src/components/ChannelView.tsx
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

type MLLink = {
  sku: string;
  meli_item_id: string | null;
  meli_variation_id: string | null;
};

type Health = {
  connected: boolean;
  nickname?: string;
  expires_at_ms?: number;
  now_ms?: number;
};

export const ChannelView = ({ channel }: ChannelViewProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [mlLinks, setMlLinks] = useState<Record<string, MLLink>>({});
  const [health, setHealth] = useState<Health | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(new Date());

  // Config canal
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

  // Helpers
  const formatDate = (date: Date) =>
    date.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const connected = !!health?.connected;
  const expiresInMin = useMemo(() => {
    if (!health?.expires_at_ms || !health.now_ms) return null;
    return Math.floor((health.expires_at_ms - health.now_ms) / 60000);
  }, [health]);

  // ===== Fetchers =====
  const fetchHealth = async () => {
    try {
      const url = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL + '/meli-health';
      const r = await fetch(url, { method: 'GET' });
      const j = (await r.json()) as Health;
      setHealth(j);
    } catch {
      setHealth({ connected: false });
    }
  };

  const fetchProducts = async () => {
  const { data, error } = await supabase
    .from('productos')
    .select('id, name, sku, categoria, price, stockb2b, stockweb, stockml')
    .gt('stockml', 0)               // ⬅️ solo > 0
    .order('id', { ascending: true });

  if (error) {
    console.error('Error al cargar productos:', error);
    setProducts([]);
    return;
  }

  const rows = (data as any[]).map((p) => ({
    id: Number(p.id),
    name: p.name,
    sku: p.sku,
    categoria: p.categoria ?? '',
    price: Number(p.price) || 0,
    stockb2b: Number(p.stockb2b) || 0,
    stockweb: Number(p.stockweb) || 0,
    stockml: Number(p.stockml) || 0,
  }));
  setProducts(rows);
};


  const fetchMlLinks = async () => {
    const { data, error } = await supabase
      .from('ml_links')
      .select('sku, meli_item_id, meli_variation_id');
    if (error) {
      console.error('Error leyendo ml_links:', error);
      setMlLinks({});
      return;
    }
    const map: Record<string, MLLink> = {};
    (data as any[]).forEach((row) => {
      map[row.sku] = {
        sku: row.sku,
        meli_item_id: row.meli_item_id ?? null,
        meli_variation_id: row.meli_variation_id ?? null,
      };
    });
    setMlLinks(map);
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      // 1) Pull desde ML → llena ml_links y actualiza stockml
      const pullUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL + '/meli-pull';
      await fetch(pullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual' }),
      });
      // 2) Refrescar datos locales
      await Promise.all([fetchProducts(), fetchMlLinks(), fetchHealth()]);
      setLastSync(new Date());
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchProducts(), fetchMlLinks(), fetchHealth()]);
      setLoading(false);
    })();
    const interval = setInterval(() => {
      fetchHealth();
    }, 1000 * 60 * 3); // cada 3 min solo el health
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derivados
  const key = config.stockKey;
  const tableRows = useMemo(
    () => products.map((p) => ({ ...p, channelStock: (p as any)[key] as number })),
    [products, key]
  );
  const totalLinked = useMemo(
    () => tableRows.filter((p) => !!mlLinks[p.sku]?.meli_item_id).length,
    [tableRows, mlLinks]
  );
  const totalStock = useMemo(
    () => tableRows.reduce((sum, p) => sum + (p.channelStock || 0), 0),
    [tableRows]
  );

  // ===== Acciones fila =====
  async function publicarEnML(p: Product) {
    // Publica (POST /meli-post) y empareja (sku -> item_id), luego refresca ml_links
    const url = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL + '/meli-post';
    // Mínimos de ejemplo para categoría MLC3530 (ajusta si usas otra)
    const body = {
      sku: p.sku,
      title: 'Item de Prueba - Por favor, NO OFERTAR', // o p.name si ya está validado
      category_id: 'MLC3530',
      price: p.price || 9900,
      available_quantity: p.stockml || 1,
      pictures: ['https://http2.mlstatic.com/D_NQ_NP_2X_000000-MLC0000000000_000000-F.jpg'],
      attributes: [
        { id: 'BRAND', value_name: 'Genérica' },
        { id: 'MODEL', value_name: 'Prueba' },
      ],
      condition: 'new' as const,
      listing_type_id: 'gold_special',
      currency_id: 'CLP',
      buying_mode: 'buy_it_now' as const,
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j?.ok) {
      throw new Error(
        `Fallo al publicar. Status=${j?.status ?? 'unknown'} Error=${JSON.stringify(j?.error ?? j)}`
      );
    }
    await fetchMlLinks();
  }

  const handleRowAction = async (p: Product) => {
    try {
      setRowBusy(p.sku);
      if (!connected) throw new Error('Mercado Libre desconectado. Conecta antes de continuar.');

      const link = mlLinks[p.sku];
      if (link?.meli_item_id) {
        // Ya está publicado → solo refrescamos estado desde ML
        await handleSyncAll();
        alert(`Estado sincronizado desde ML para SKU ${p.sku}.`);
      } else {
        // No publicado → publicar ahora
        await publicarEnML(p);
        alert(`Publicado en ML: ${p.name} (SKU ${p.sku}).`);
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? String(e));
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
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          <span>{syncing ? 'Sincronizando...' : 'Sincronizar ahora'}</span>
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
                {health?.nickname ? `@${health.nickname} · ` : ''}
                {typeof expiresInMin === 'number' ? `expira en ${expiresInMin} min` : ''}
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

        {/* Productos con link ML */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Productos</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{totalLinked}/{tableRows.length}</p>
          <p className="text-sm text-neutral-500 mt-1">publicados / totales</p>
        </div>

        {/* Stock ML total */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Stock ML Total</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{totalStock}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades (sumadas)</p>
        </div>

        {/* Acción masiva */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Acciones</h3>
          </div>
          <button
            disabled={!connected || syncing || tableRows.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50"
            onClick={handleSyncAll}
            title="Sincroniza catálogo y enlaces ML"
          >
            <Repeat size={18} />
            <span>Sincronizar catálogo</span>
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-neutral-900">Productos en {config.title}</h3>
          <span className="text-sm text-neutral-600">Última sync: {formatDate(lastSync)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left  py-3 px-4 text-sm font-semibold text-neutral-700">Producto</th>
                <th className="text-left  py-3 px-4 text-sm font-semibold text-neutral-700">SKU</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Precio</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Stock ML</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Publicación ML</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-neutral-700">Acción</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((product) => {
                const link = mlLinks[product.sku];
                const isLinked = !!link?.meli_item_id;
                return (
                  <tr key={product.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
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
                          <a
                            className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1"
                            href={`https://articulo.mercadolibre.cl/${link.meli_item_id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver publicación en Mercado Libre"
                          >
                            <LinkIcon size={14} />
                            <span>Publicado</span>
                          </a>
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
                          onClick={() => handleRowAction(product)}
                          disabled={!connected || rowBusy === product.sku}
                          className={`flex items-center gap-2 px-3 py-2 rounded
                            ${isLinked ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}
                            text-white disabled:opacity-50`}
                          title={isLinked ? 'Refrescar estado desde ML' : 'Publicar en ML'}
                        >
                          {rowBusy === product.sku ? (
                            <RefreshCw size={16} className="animate-spin" />
                          ) : isLinked ? (
                            <Repeat size={16} />
                          ) : (
                            <Upload size={16} />
                          )}
                          <span>{isLinked ? 'Refrescar ML' : 'Publicar en ML'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-neutral-500">
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
};
