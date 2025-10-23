// src/components/ChannelView.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  ShoppingCart,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Upload,
  Repeat,
  X,
  Trash2,
} from 'lucide-react';
import { supabase } from '../supabaseClient';

interface ChannelViewProps {
  channel: 'wordpress' | 'mercadolibre';
}

type Product = {
  id: number;
  name: string;
  sku: string;
  categoria_id?: number | null;
  categoria_nombre?: string | null;
  price: number;
  stockb2b: number;
  stockweb: number;
  stockml: number;
};

type MLLink = {
  sku: string;
  meli_item_id: string | null;
  meli_variation_id: string | null;
  meli_status?: string | null;
  last_seen_at?: string | null;
};

type Health = {
  connected: boolean;
  nickname?: string;
  expires_at_ms?: number;
  now_ms?: number;
};

type DraftAttr = { id: string; value_name: string };
type DraftPublish = {
  sku: string;
  title: string;
  price: number;
  available_quantity: number;
  category_id: string;    // MLC* fijo
  pictures: string[];
  attributes: DraftAttr[];
  condition: string;
  listing_type_id: string;
  currency_id: string;
  buying_mode: string;
};

export const ChannelView = ({ channel }: ChannelViewProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [mlLinks, setMlLinks] = useState<Record<string, MLLink[]>>({});
  const [health, setHealth] = useState<Health | null>(null);

  const [catQuery, setCatQuery] = useState("");
  const [catOpts, setCatOpts] = useState<Array<{category_id:string; category_name:string; domain_name:string}>>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [draftCatName, setDraftCatName] = useState<string>("");


  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(new Date());

  // Modal de publicación
  const [showPreview, setShowPreview] = useState(false);
  const [draft, setDraft] = useState<DraftPublish | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSending, setDraftSending] = useState(false);

  // Drag & drop / input file
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ------- Config -------
  const channelConfig = {
    wordpress: { title: 'WordPress', icon: <Globe size={24} />, color: 'blue', stockKey: 'stockweb' as const, description: 'Gestión de inventario en tienda online' },
    mercadolibre: { title: 'Mercado Libre', icon: <ShoppingCart size={24} />, color: 'yellow', stockKey: 'stockml' as const, description: 'Sincronización con marketplace' },
  };
  const config = channelConfig[channel];

  // Mapeo de tus categorías -> IDs válidos de Mercado Libre Chile
  const meliCategoryMap: Record<number, string> = {
    2: 'MLC3530', // Pantalones → Jeans
    3: 'MLC1197', // Shorts
    4: 'MLC1572', // Poleras
    5: 'MLC3706', // Polerones
    6: 'MLC4483', // Gorros
    7: 'MLC1912', // Accesorios
    8: 'MLC1080', // Chaquetas
    9: 'MLC3271', // Poleras manga larga
  };
  const getMeliCategory = (id: number | null | undefined) =>
    typeof id === 'number' && meliCategoryMap[id] ? meliCategoryMap[id] : 'MLC3530';

  const formatDate = (date: Date) =>
    date.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const connected = !!health?.connected;
  const expiresInMin = useMemo(() => (!health?.expires_at_ms || !health.now_ms ? null : Math.floor((health.expires_at_ms - health.now_ms) / 60000)), [health]);

  // ---------- Loaders ----------
  async function fetchHealth() {
    const { data, error } = await supabase.functions.invoke('meli-health');
    if (error) setHealth({ connected: false });
    else setHealth(data as Health);
  }

  async function fetchProducts() {
    const { data, error } = await supabase
      .from('productos')
      .select('id, name, sku, price, stockb2b, stockweb, stockml, categoria_id, categorias(nombre_categoria)')
      .gt('stockml', 0)
      .order('id', { ascending: true });

    if (error) {
      console.error('Error productos', error);
      setProducts([]);
      return;
    }

    setProducts(
      (data || []).map((p: any) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        categoria_id: p.categoria_id ?? null,
        categoria_nombre: p.categorias?.nombre_categoria || null,
        price: Number(p.price) || 0,
        stockb2b: Number(p.stockb2b) || 0,
        stockweb: Number(p.stockweb) || 0,
        stockml: Number(p.stockml) || 0,
      }))
    );
  }

  async function fetchMlLinks() {
    const { data, error } = await supabase
      .from('ml_links')
      .select('sku, meli_item_id, meli_variation_id, meli_status, last_seen_at');

    if (error) {
      console.error('Error ml_links', error);
      setMlLinks({});
      return;
    }

    const map: Record<string, MLLink[]> = {};
    (data || []).forEach((row: any) => {
      const arr = map[row.sku] || [];
      arr.push({
        sku: row.sku,
        meli_item_id: row.meli_item_id ?? null,
        meli_variation_id: row.meli_variation_id ?? null,
        meli_status: row.meli_status ?? null,
        last_seen_at: row.last_seen_at ?? null,
      });
      map[row.sku] = arr;
    });
    setMlLinks(map);
  }

  async function handleSyncAll() {
    try {
      setSyncing(true);
      await supabase.functions.invoke('meli-pull', { body: { reason: 'manual' } });
      await Promise.all([fetchProducts(), fetchMlLinks(), fetchHealth()]);
      setLastSync(new Date());
    } finally {
      setSyncing(false);
    }
  }
// Debounce: espera 300 ms tras teclear
  useEffect(() => {
    const q = catQuery.trim();
    if (!showPreview) return;
    if (!q) {
      setCatOpts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setCatLoading(true);
        const { data, error } = await supabase.functions.invoke('meli-categories', { body: { q } });
        if (!error && data?.ok) setCatOpts(data.results || []);
        else setCatOpts([]);
      } finally {
        setCatLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [catQuery, showPreview]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchProducts(), fetchMlLinks(), fetchHealth()]);
      setLoading(false);
    })();
    const interval = setInterval(() => void fetchHealth(), 1000 * 60 * 3);
    return () => clearInterval(interval);
  }, []);

  // ---------- Derivados ----------
  const key = config.stockKey;
  const tableRows = useMemo(() => products.map((p) => ({ ...p, channelStock: (p as any)[key] as number })), [products, key]);

  const isSkuPublished = (sku: string) =>
    (mlLinks[sku] || []).some((l) => l.meli_status === 'active' || l.meli_status === 'paused');

  const firstActiveItemId = (sku: string) =>
    (mlLinks[sku] || []).find((l) => l.meli_status === 'active' || l.meli_status === 'paused')?.meli_item_id || null;

  const totalLinked = useMemo(() => tableRows.filter((p) => isSkuPublished(p.sku)).length, [tableRows, mlLinks]);
  const totalStock = useMemo(() => tableRows.reduce((sum, p) => sum + (p.channelStock || 0), 0), [tableRows]);

  // ---------- Publicar ----------
  function openPublishPreview(p: Product) {
    const attrs: DraftAttr[] = [
      { id: 'BRAND', value_name: 'Genérica' },
      { id: 'MODEL', value_name: 'Prueba' },
    ];
    const d: DraftPublish = {
      sku: p.sku,
      title: p.name || `SKU ${p.sku}`,
      price: p.price || 9900,
      available_quantity: p.stockml || 1,
      category_id: getMeliCategory(p.categoria_id ?? null), // FIJO para ML
      pictures: [],
      attributes: attrs,
      condition: 'new',
      listing_type_id: 'gold_special',
      currency_id: 'CLP',
      buying_mode: 'buy_it_now',
    };
    setDraft(d);
    setDraftCatName(""); // nombre visible (lo llenará el buscador si el usuario cambia)
    setDraftError(null);
    setShowPreview(true);
    setCatQuery(""); 
    setCatOpts([]);

  }

  async function confirmPublish() {
    if (!draft) return;
    setDraftError(null);
    if (!draft.title.trim()) return setDraftError('Título requerido');
    if (!draft.pictures.length) return setDraftError('Debes subir al menos una imagen');

    // forzar categoría válida MLC*
    const safeDraft: DraftPublish = {
  ...draft,
  category_id: draft.category_id.startsWith('ML') ? draft.category_id : 'MLC3530',
};


    try {
      setDraftSending(true);
      const { data, error } = await supabase.functions.invoke('meli-post', { body: safeDraft });
      if (error || !(data as any)?.ok) {
        const msg = error?.message || (data as any)?.error || 'Error publicando';
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
      setShowPreview(false);
      await handleSyncAll();
      alert('Publicado en Mercado Libre');
    } catch (e: any) {
      setDraftError(e?.message || 'No se pudo publicar');
    } finally {
      setDraftSending(false);
    }
  }

  // Subir imagen a Storage (pública)
  async function uploadFileToStorage(file: File): Promise<string> {
    const bucket = 'ml-images';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const safeSku = (draft?.sku || 'SKU').replace(/[^a-zA-Z0-9-_]/g, '_');
    const path = `sku/${safeSku}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'image/jpeg',
      });
    if (upErr) throw new Error('No se pudo subir la imagen');

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('No se pudo obtener la URL pública');

    return data.publicUrl;
  }

  const handleRowAction = async (p: Product) => {
    try {
      setRowBusy(p.sku);
      if (!connected) throw new Error('Mercado Libre desconectado');
      if (isSkuPublished(p.sku)) {
        await handleSyncAll();
        alert('Estado sincronizado');
      } else {
        openPublishPreview(p);
      }
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setRowBusy(null);
    }
  };

  if (loading) return <div className="text-center py-12 text-neutral-500">Cargando productos…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className={`p-3 bg-${config.color}-100 text-${config.color}-600 rounded-lg`}>{config.icon}</div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">{config.title}</h2>
            <p className="text-sm text-neutral-600">{config.description}</p>
          </div>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          <span>{syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</span>
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase">Estado</h3>
            {connected ? <CheckCircle className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
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
              <p className="text-xs text-neutral-500 mt-1">Conecta tu cuenta para continuar.</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">Productos</h3>
          <p className="text-2xl font-bold">{totalLinked}/{tableRows.length}</p>
          <p className="text-sm text-neutral-500 mt-1">publicados / visibles</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">Stock ML Total</h3>
          <p className="text-2xl font-bold">{totalStock}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-3">Acciones</h3>
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
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-neutral-900">Productos en {config.title}</h3>
          <span className="text-sm text-neutral-600">Última sync: {formatDate(lastSync)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left  py-3 px-4 text-sm font-semibold">Producto</th>
                <th className="text-left  py-3 px-4 text-sm font-semibold">SKU</th>
                <th className="text-center py-3 px-4 text-sm font-semibold">Precio</th>
                <th className="text-center py-3 px-4 text-sm font-semibold">Stock ML</th>
                <th className="text-center py-3 px-4 text-sm font-semibold">Publicación ML</th>
                <th className="text-center py-3 px-4 text-sm font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((product) => {
                const published = isSkuPublished(product.sku);
                const activeItemId = firstActiveItemId(product.sku);
                return (
                  <tr key={product.id} className="border-b hover:bg-neutral-50">
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-sm text-neutral-500">{product.categoria_nombre || '—'}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <code className="text-sm bg-neutral-100 px-2 py-1 rounded">{product.sku}</code>
                    </td>
                    <td className="py-4 px-4 text-center font-semibold">
                      {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(product.price || 0)}
                    </td>
                    <td className="py-4 px-4 text-center font-bold">{product.stockml}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {published && activeItemId ? (
                          <a
                            className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1"
                            href={`https://articulo.mercadolibre.cl/${activeItemId}`}
                            target="_blank"
                            rel="noreferrer"
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
                            ${isSkuPublished(product.sku) ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}
                            text-white disabled:opacity-50`}
                          title={isSkuPublished(product.sku) ? 'Refrescar estado desde ML' : 'Publicar en ML'}
                        >
                          {rowBusy === product.sku ? (
                            <RefreshCw size={16} className="animate-spin" />
                          ) : isSkuPublished(product.sku) ? (
                            <Repeat size={16} />
                          ) : (
                            <Upload size={16} />
                          )}
                          <span>{isSkuPublished(product.sku) ? 'Refrescar ML' : 'Publicar en ML'}</span>
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

      {/* Modal de previsualización */}
      {showPreview && draft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold">Previsualizar publicación</h3>
              <button onClick={() => setShowPreview(false)} className="p-1 rounded hover:bg-neutral-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Formulario */}
              <div className="space-y-3">
                <label className="text-sm text-neutral-600">Título</label>
                <input
                  className="w-full border rounded-xl p-3"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600">Precio</label>
                    <input
                      className="w-full border rounded-xl p-3"
                      type="number"
                      value={draft.price}
                      onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Cantidad</label>
                    <input
                      className="w-full border rounded-xl p-3"
                      type="number"
                      value={draft.available_quantity}
                      onChange={(e) => setDraft({ ...draft, available_quantity: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                {/* Categoría bloqueada para evitar conflictos */}
               <label className="text-sm text-neutral-600">Categoría</label>
                <div className="relative">
                  <input
                    className="w-full border rounded-xl p-3 pr-24"
                    placeholder="Buscar categoría de Mercado Libre..."
                    value={catQuery}
                    onChange={(e) => setCatQuery(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                    {catLoading ? "Buscando..." : "MLC"}
                  </span>

                  {/* Dropdown de sugerencias */}
                  {catOpts.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg max-h-56 overflow-auto shadow">
                      {catOpts.map(opt => (
                        <button
                          type="button"
                          key={opt.category_id + opt.domain_name}
                          onClick={() => {
                            // fija categoría válida de ML
                            setDraft(d => d ? { ...d, category_id: opt.category_id } : d);
                            setDraftCatName(`${opt.category_name}`);
                            setCatQuery(`${opt.category_name}`);
                            setCatOpts([]);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-50"
                        >
                          <div className="text-sm font-medium">{opt.category_name}</div>
                          <div className="text-xs text-neutral-500">{opt.domain_name} · {opt.category_id}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {draft?.category_id || '—'} · valor asignado para Mercado Libre
                </p>


                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600">Marca (BRAND)</label>
                    <input
                      className="w-full border rounded-xl p-3"
                      value={draft.attributes.find((a) => a.id === 'BRAND')?.value_name || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        const attrs = draft.attributes.slice();
                        const i = attrs.findIndex((a) => a.id === 'BRAND');
                        if (i >= 0) attrs[i] = { id: 'BRAND', value_name: v };
                        else attrs.push({ id: 'BRAND', value_name: v });
                        setDraft({ ...draft, attributes: attrs });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Modelo (MODEL)</label>
                    <input
                      className="w-full border rounded-xl p-3"
                      value={draft.attributes.find((a) => a.id === 'MODEL')?.value_name || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        const attrs = draft.attributes.slice();
                        const i = attrs.findIndex((a) => a.id === 'MODEL');
                        if (i >= 0) attrs[i] = { id: 'MODEL', value_name: v };
                        else attrs.push({ id: 'MODEL', value_name: v });
                        setDraft({ ...draft, attributes: attrs });
                      }}
                    />
                  </div>
                </div>

                {draftError && <p className="text-sm text-red-600">{draftError}</p>}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={confirmPublish}
                    disabled={draftSending}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg disabled:opacity-50"
                  >
                    {draftSending ? 'Publicando…' : 'Publicar ahora'}
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 rounded-lg border hover:bg-neutral-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>

              {/* Vista previa + dropzone */}
              <div className="border rounded-xl p-4">
                <p className="text-xs text-neutral-500 mb-2">Imágenes</p>

                <div
                  className={`bg-neutral-100 h-40 flex items-center justify-center relative rounded-md border-2 ${
                    isDragging ? 'border-amber-500 border-dashed bg-amber-50' : 'border-transparent'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    try {
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      if (!file.type.startsWith('image/')) throw new Error('Solo se permiten imágenes');
                      const url = await uploadFileToStorage(file);
                      setDraft((d) => (d ? { ...d, pictures: [url, ...d.pictures] } : d));
                    } catch (err: any) {
                      setDraftError(err?.message || 'No se pudo cargar la imagen');
                    }
                  }}
                >
                  <img
                    src={
                      draft.pictures[0] ||
                      'https://http2.mlstatic.com/D_NQ_NP_2X_000000-MLC0000000000_000000-F.jpg'
                    }
                    alt="preview"
                    className="h-full object-contain"
                  />
                  {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-amber-700">
                      Suelta la imagen para subirla
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async () => {
                      try {
                        const input = fileInputRef.current;
                        const file = input?.files?.[0];
                        if (!file) return;
                        const url = await uploadFileToStorage(file);
                        setDraft((d) => (d ? { ...d, pictures: [url, ...d.pictures] } : d));
                        if (input) input.value = '';
                      } catch (err: any) {
                        setDraftError(err?.message || 'No se pudo cargar la imagen');
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg border hover:bg-neutral-50 text-sm"
                  >
                    Cargar imagen
                  </button>
                </div>

                {/* miniaturas */}
                {draft.pictures.length > 0 && (
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    {draft.pictures.map((url, i) => (
                      <div key={url + i} className="relative group">
                        <img src={url} className="h-20 w-full object-cover rounded-md border" />
                        <button
                          title="Eliminar"
                          onClick={() =>
                            setDraft((d) =>
                              d ? { ...d, pictures: d.pictures.filter((_, idx) => idx !== i) } : d
                            )
                          }
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-white/80 rounded-full p-1 shadow"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 space-y-1 mt-4 border rounded-lg">
                  <div className="text-sm text-neutral-500">{draft.category_id} · valor asignado para Mercado Libre</div>
                  <div className="font-semibold">{draft.title}</div>
                  <div className="text-lg font-bold">
                    {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(draft.price || 0)}
                  </div>
                  <div className="text-sm text-neutral-600">
                    Stock: {draft.available_quantity} · {draft.condition === 'new' ? 'Nuevo' : 'Usado'}
                  </div>
                  <div className="text-xs text-neutral-500">
                    Atributos: {draft.attributes.map((a) => `${a.id}=${a.value_name}`).join(', ')}
                  </div>
                </div>

                <p className="text-xs text-neutral-500 mt-3">
                  El resultado final puede variar según validaciones de Mercado Libre.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelView;
