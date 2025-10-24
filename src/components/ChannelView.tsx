// src/components/ChannelView.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
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
  price: number;
  categoria_id: number | null;
  categoria_nombre: string | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
  talla_id?: number | null; // 👈 solo guardamos la referencia a la talla
};

type CategoryOption = { id: string; name: string; domain_name?: string };

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
  category_id: string; // MLC* fijo
  pictures: string[];
  attributes: DraftAttr[];
  condition: string;
  listing_type_id: string;
  currency_id: string;
  buying_mode: string;
};

type LookupTal = { id: number; etiqueta: string; tipo: 'alfanumerica' | 'numerica'; orden: number | null };

// -------- Agrupación por familia (name + categoria + tipo talla)
type FamRow = {
  name: string;
  categoria_id: number | null;
  categoria_nombre: string | null;
  tipo: 'alfanumerica' | 'numerica';
  byTalla: Record<number, Product>; // talla_id -> product
};

const ALFA_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

export const ChannelView = ({ channel }: ChannelViewProps) => {

  

  const [products, setProducts] = useState<Product[]>([]);
  const [tallas, setTallas] = useState<LookupTal[]>([]);
  const [mlLinks, setMlLinks] = useState<Record<string, MLLink[]>>({});
  const [health, setHealth] = useState<Health | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Modal de publicación
  const [showPreview, setShowPreview] = useState(false);
  const [draft, setDraft] = useState<DraftPublish | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSending, setDraftSending] = useState(false);

  // Estados de talla / size grid (requeridos por ML Moda)
  const [sizeGridId, setSizeGridId] = useState<string>('');
  const [sizeGridRowId, setSizeGridRowId] = useState<string>('');
  const [sizeValue, setSizeValue] = useState<string>('');

  // Cat. ML buscador
const [catQuery, setCatQuery] = useState('');
const [catOpts, setCatOpts] = useState<CategoryOption[]>([]);
const [catLoading, setCatLoading] = useState(false);
const [draftCatName, setDraftCatName] = useState<string>(''); // etiqueta mostrada


  // ------- Config -------
  const channelConfig = {
    wordpress: { title: 'WordPress', icon: <Globe size={24} />, color: 'blue', stockKey: 'stockweb' as const, description: 'Gestión de inventario en tienda online' },
    mercadolibre: { title: 'Mercado Libre', icon: <ShoppingCart size={24} />, color: 'yellow', stockKey: 'stockml' as const, description: 'Sincronización con marketplace' },
  };
  const config = channelConfig[channel];

  // Mapeo categorías propias -> ML Chile
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
  const expiresInMin = useMemo(
    () => (!health?.expires_at_ms || !health.now_ms ? null : Math.floor((health.expires_at_ms - health.now_ms) / 60000)),
    [health]
  );

  // ---------- Loaders ----------
  async function fetchHealth() {
    const { data, error } = await supabase.functions.invoke('meli-health');
    if (error) setHealth({ connected: false });
    else setHealth(data as Health);
  }

  async function fetchTallas() {
    const { data, error } = await supabase
      .from('tallas')
      .select('id_talla, tipo, etiqueta, valor_numerico')
      .order('tipo')
      .order('valor_numerico', { ascending: true, nullsFirst: true })
      .order('etiqueta');
    if (error) {
      console.error('Error tallas', error);
      setTallas([]);
      return;
    }
    setTallas((data || []).map((t: any) => ({
      id: Number(t.id_talla),
      etiqueta: t.etiqueta as string,
      tipo: t.tipo as 'alfanumerica' | 'numerica',
      orden: t.valor_numerico ?? null,
    })));
  }

  async function fetchProducts() {
    // Traemos cada SKU con su talla para poder agrupar por familia
    const { data, error } = await supabase
      .from('productos')
      .select('id, name, sku, price, stockb2b, stockweb, stockml, categoria_id, categorias(nombre_categoria), talla_id')
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
        price: Number(p.price) || 0,
        categoria_id: p.categoria_id ?? null,
        categoria_nombre: p.categorias?.nombre_categoria || null,
        stockb2b: Number(p.stockb2b) || 0,
        stockweb: Number(p.stockweb) || 0,
        stockml: Number(p.stockml) || 0,
        talla_id: p.talla_id ?? null,
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

  // Buscar categorías de ML (debounce)
  useEffect(() => {
  const q = catQuery.trim();
  if (!showPreview) return;

  if (!q || q.length < 2) { // evita ruido
    setCatOpts([]);
    return;
  }

  const t = setTimeout(async () => {
    try {
      setCatLoading(true);
      const { data, error } = await supabase.functions.invoke('meli-categories', { body: { q } });

      // Admite distintos formatos de respuesta
      const raw = (data?.results || data?.categories || []) as any[];
      const opts: CategoryOption[] = raw
        .map((r: any) => ({
          id: r.category_id || r.id,
          name: r.category_name || r.name,
          domain_name: r.domain_name || r.path?.[0]?.name || '',
        }))
        .filter(o => typeof o.id === 'string' && o.id.startsWith('ML'));

      if (!error) setCatOpts(opts);
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
      await Promise.all([fetchTallas(), fetchProducts(), fetchMlLinks(), fetchHealth()]);
      setLoading(false);
    })();
    const interval = setInterval(() => void fetchHealth(), 1000 * 60 * 3);
    return () => clearInterval(interval);
  }, []);

  // Bloqueo global de drag mientras está abierto el modal
  useEffect(() => {
    const prevent = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (showPreview) {
      window.addEventListener('dragover', prevent);
      window.addEventListener('drop', prevent);
    }
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, [showPreview]);

  // ---------- Derivados ----------
  const key = config.stockKey;

  const isSkuPublished = (sku: string) =>
    (mlLinks[sku] || []).some((l) => l.meli_status === 'active' || l.meli_status === 'paused');

  const firstActiveItemId = (sku: string) =>
    (mlLinks[sku] || []).find((l) => l.meli_status === 'active' || l.meli_status === 'paused')?.meli_item_id || null;

  // Armar familias (resolvemos tipo de talla mirando la tabla 'tallas')
  const tallasById = useMemo(() => {
    const m = new Map<number, LookupTal>();
    for (const t of tallas) m.set(t.id, t);
    return m;
  }, [tallas]);

  const fams: FamRow[] = useMemo(() => {
    const map = new Map<string, FamRow>();
    for (const p of products) {
      const tipo: 'alfanumerica' | 'numerica' =
        tallasById.get(p.talla_id || -1)?.tipo || 'alfanumerica';
      const famKey = `${p.name}::${p.categoria_id ?? 0}::${tipo}`;
      if (!map.has(famKey)) {
        map.set(famKey, {
          name: p.name,
          categoria_id: p.categoria_id ?? null,
          categoria_nombre: p.categoria_nombre ?? null,
          tipo,
          byTalla: {},
        });
      }
      if (p.talla_id) {
        map.get(famKey)!.byTalla[p.talla_id] = p;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, tallasById]);

  // Todas las tallas por tipo (para construir columnas de la matriz)
  const tallasByTipo = useMemo(
    () => ({
      alfanumerica: tallas
        .filter((t) => t.tipo === 'alfanumerica')
        .sort((a, b) => ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta)),
      numerica: tallas
        .filter((t) => t.tipo === 'numerica')
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    }),
    [tallas]
  );

  const columnsForFam = (fam: FamRow) =>
    fam.tipo === 'numerica' ? tallasByTipo.numerica : tallasByTipo.alfanumerica;

  const totalStockML = useMemo(
    () => products.reduce((sum, p) => sum + ((p as any)[key] as number || 0), 0),
    [products, key]
  );

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
    setDraftCatName('');
    setDraftError(null);
    setShowPreview(true);
    setCatQuery('');
    setCatOpts([]);

    // Reset talla/grid
    setSizeGridId('');
    setSizeGridRowId('');
    setSizeValue('');

    // Completar SIZE / GRID desde función si hay mapeo
    (async () => {
      try {
        if (!p.talla_id) return;
        const { data, error } = await supabase.functions.invoke('meli-size-resolve', {
          body: { categoria_ml_id: d.category_id, talla_id: p.talla_id },
        });
        if (!error && data?.ok) {
          setSizeValue(data.size);
          setSizeGridId(data.size_grid_id);
          setSizeGridRowId(data.size_grid_row_id);
          setDraftError(null);
        } else if (data?.error === 'missing_mapping') {
          setDraftError('Falta configurar guía de tallas para esta talla/categoría (revisar meli_size_map).');
        }
      } catch {}
    })();
  }

  async function confirmPublish() {
    if (!draft) return;
    setDraftError(null);
    if (!draft.title.trim()) return setDraftError('Título requerido');
    if (!draft.pictures.length) return setDraftError('Debes subir al menos una imagen');

    // Inyección de atributos de talla/guía si existen
    const safeDraft: DraftPublish = {
      ...draft,
      category_id: draft.category_id.startsWith('ML') ? draft.category_id : 'MLC3530',
    };

    const attributes = [...safeDraft.attributes];
    if (sizeValue) {
      const i = attributes.findIndex((a) => a.id === 'SIZE');
      if (i >= 0) attributes[i] = { id: 'SIZE', value_name: sizeValue };
      else attributes.push({ id: 'SIZE', value_name: sizeValue });
    }
    if (sizeGridId && sizeGridRowId) {
      const ig = attributes.findIndex((a) => a.id === 'SIZE_GRID_ID');
      const ir = attributes.findIndex((a) => a.id === 'SIZE_GRID_ROW_ID');
      if (ig >= 0) attributes[ig] = { id: 'SIZE_GRID_ID', value_name: sizeGridId };
      else attributes.push({ id: 'SIZE_GRID_ID', value_name: sizeGridId });
      if (ir >= 0) attributes[ir] = { id: 'SIZE_GRID_ROW_ID', value_name: sizeGridRowId };
      else attributes.push({ id: 'SIZE_GRID_ROW_ID', value_name: sizeGridRowId });
    }
    safeDraft.attributes = attributes;

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

  const handleCellAction = async (p: Product) => {
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">Productos con stock ML</h3>
          <p className="text-2xl font-bold">{fams.length}</p>
          <p className="text-sm text-neutral-500 mt-1">agrupadas por nombre + categoría</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">Stock ML Total</h3>
          <p className="text-2xl font-bold">{totalStockML}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades</p>
        </div>
      </div>

      {/* Tabla agrupada por familia con matriz de tallas */}
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
                <th className="text-left  py-3 px-4 text-sm font-semibold">Tallas (Stock ML / Publicación)</th>
                <th className="text-center py-3 px-4 text-sm font-semibold">Total ML</th>
              </tr>
            </thead>
            <tbody>
              {fams.map((fam, idx) => {
                const cols = columnsForFam(fam);
                const totalFam = cols.reduce((acc, t) => acc + (fam.byTalla[t.id]?.stockml || 0), 0);

                return (
                  <tr key={fam.name + idx} className="border-b align-top">
                    {/* Columna nombre/categoría */}
                    <td className="py-4 px-4 w-64">
                      <div className="font-semibold">{fam.name}</div>
                      <div className="text-sm text-neutral-500">{fam.categoria_nombre || '—'}</div>
                    </td>

                    {/* Matriz de tallas */}
                    <td className="py-4 px-4">
                      <div className="overflow-x-auto" style={{ minWidth: 420 }}>
                        <div
                          className="grid gap-y-2 gap-x-2 items-center"
                          style={{ gridTemplateColumns: `120px repeat(${cols.length}, minmax(84px, 1fr))` }}
                        >
                          {/* Encabezados tallas */}
                          <div></div>
                          {cols.map((t) => (
                            <div key={t.id} className="text-center text-xs text-neutral-700 font-medium">
                              {t.etiqueta}
                            </div>
                          ))}

                          {/* Fila: Stock ML */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700">Stock ML</span>
                          </div>
                          {cols.map((t) => {
                            const p = fam.byTalla[t.id];
                            const val = p?.stockml ?? 0;
                            const cls = val === 0 ? 'text-red-600' : val < 5 ? 'text-orange-600' : 'text-green-700';
                            return (
                              <div key={t.id} className="text-center">
                                <span className={`font-semibold ${cls}`}>{val}</span>
                              </div>
                            );
                          })}

                          {/* Fila: Publicación / Acción */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 text-neutral-700">Publicación</span>
                          </div>
                          {cols.map((t) => {
                            const p = fam.byTalla[t.id];
                            if (!p) return <div key={t.id} className="text-center text-neutral-400">—</div>;
                            const published = isSkuPublished(p.sku);
                            const activeItemId = firstActiveItemId(p.sku);
                            return (
                              <div key={t.id} className="text-center">
                                {published && activeItemId ? (
                                  <a
                                    className="bg-green-50 text-green-700 text-[11px] font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1"
                                    href={`https://articulo.mercadolibre.cl/${activeItemId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <LinkIcon size={12} />
                                    <span>Publicado</span>
                                  </a>
                                ) : (
                                  <button
                                    onClick={() => handleCellAction(p)}
                                    disabled={!connected || rowBusy === p.sku}
                                    className={`text-[11px] font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1 text-white
                                      ${published ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}
                                      disabled:opacity-50`}
                                    title={published ? 'Refrescar ML' : 'Publicar en ML'}
                                  >
                                    {rowBusy === p.sku ? (
                                      <RefreshCw size={12} className="animate-spin" />
                                    ) : published ? (
                                      <Repeat size={12} />
                                    ) : (
                                      <Upload size={12} />
                                    )}
                                    <span>{published ? 'Refrescar' : 'Publicar'}</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>

                    {/* Total por familia */}
                    <td className="py-4 px-4 text-center font-bold">{totalFam}</td>
                  </tr>
                );
              })}

              {fams.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-neutral-500">
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

                {/* Categoría ML (buscador) */}
                <label className="text-sm text-neutral-600">Categoría</label>
<div className="relative">
  <input
    className="w-full border rounded-xl p-3 pr-24"
    placeholder="Buscar categoría de Mercado Libre..."
    value={catQuery}
    onChange={(e) => setCatQuery(e.target.value)}
  />
  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
    {catLoading ? 'Buscando...' : 'MLC'}
  </span>

  {catOpts.length > 0 && (
    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg max-h-56 overflow-auto shadow">
      {catOpts.map((opt) => (
        <button
          type="button"
          key={opt.id}
          onClick={async () => {
            // setea categoría en el borrador y etiqueta visible
            setDraft((d) => (d ? { ...d, category_id: opt.id } : d));
            setDraftCatName(opt.name);
            setCatQuery(opt.name);
            setCatOpts([]);

            // si tenías talla precargada, re-resuelve SIZE/SIZE_GRID con la nueva categoría
            try {
              if (draft && draft.sku) {
                // limpiamos grid previo
                setSizeGridId('');
                setSizeGridRowId('');

                // si tenías el producto seleccionado en el modal, recupéralo por sku
                const p = products.find(pp => pp.sku === draft.sku);
                if (p?.talla_id) {
                  const { data } = await supabase.functions.invoke('meli-size-resolve', {
                    body: { categoria_ml_id: opt.id, talla_id: p.talla_id }
                  });
                  if (data?.ok) {
                    setSizeValue(data.size);
                    setSizeGridId(data.size_grid_id);
                    setSizeGridRowId(data.size_grid_row_id);
                    setDraftError(null);
                  }
                }
              }
            } catch {}
          }}
          className="w-full text-left px-3 py-2 hover:bg-neutral-50"
        >
          <div className="text-sm font-medium">{opt.name}</div>
          <div className="text-xs text-neutral-500">{opt.domain_name || 'Mercado Libre'} · {opt.id}</div>
        </button>
      ))}
    </div>
  )}
</div>
<p className="text-xs text-neutral-500 mt-1">
  {(draftCatName || draft?.category_id || '—')} · valor asignado para Mercado Libre
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
                  <button onClick={() => setShowPreview(false)} className="px-4 py-2 rounded-lg border hover:bg-neutral-50">
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
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounter.current++;
                    setIsDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounter.current = Math.max(0, dragCounter.current - 1);
                    if (dragCounter.current === 0) setIsDragging(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounter.current = 0;
                    setIsDragging(false);
                    try {
                      const file = e.dataTransfer?.files?.[0];
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

                {draft.pictures.length > 0 && (
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    {draft.pictures.map((url, i) => (
                      <div key={url + i} className="relative group">
                        <img src={url} className="h-20 w-full object-cover rounded-md border" />
                        <button
                          title="Eliminar"
                          onClick={() =>
                            setDraft((d) => (d ? { ...d, pictures: d.pictures.filter((_, idx) => idx !== i) } : d))
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

                <p className="text-xs text-neutral-500 mt-3">El resultado final puede variar según validaciones de Mercado Libre.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelView;
