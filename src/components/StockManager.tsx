// src/components/StockManager.tsx
import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { Plus, Pencil, Trash2, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { emitAlert } from '../state/alertsBus';
import { wooCreateProductLocal, wooDeleteProductLocal, wooPushStockLocal } from '../data/woo';

type LookupCat = { id: number; name: string };
type LookupTal = { id: number; tipo: 'alfanumerica' | 'numerica'; etiqueta: string; orden: number | null };

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number;
  categoria_id: number | null;
  talla_id: number | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
};

type SortOrder = 'asc' | 'desc';
type Channel = 'B2B' | 'Web' | 'ML';

type FamKey = string; // `${name}::${categoria_id}::${tipo}`
type FamRow = {
  name: string;
  categoria_id: number | null;
  tipo: 'alfanumerica' | 'numerica';
  byTalla: Record<number, Product>; // talla_id -> producto
};

type EditFamilyState = {
  name: string;
  // en el type EditFamilyState:
basePrice: number; // nuevo

  categoria_id: number | null;
  tipo: 'alfanumerica' | 'numerica';
  cols: LookupTal[]; // columnas (tallas)
  values: Record<number, { // key = id_talla
    id?: number;          // id de producto si existe
    b2b: number;
    web: number;
    ml: number;
  }>;
};

const toInt = (s: unknown) => {
  const n = parseInt(String(s ?? '').replace(/\s+/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const ALFA_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

export const StockManager = () => {
  // datos
  const [products, setProducts] = useState<Product[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);

  // lookups
  const [cats, setCats] = useState<LookupCat[]>([]);
  const [tallas, setTallas] = useState<LookupTal[]>([]);

  // filtros / búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | number>('all');

  // paginación (sobre familias)
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // estados UI
  const [loading, setLoading] = useState(true);
  const [tableBusy, setTableBusy] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null); // se usa SOLO en "agregar"
  const [editingFamily, setEditingFamily] = useState<EditFamilyState | null>(null); // modal matriz
  const [isExistingSKU, setIsExistingSKU] = useState<boolean>(false); // true => modal matriz; false => modal crear

  // selección múltiple (a nivel item/sku). Se mantiene para borrar por lista (opcional)
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // abort
  const abortRef = useRef<AbortController | null>(null);

  // debounce búsqueda
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const toastAndLog = (msg: string, type: 'info' | 'error' | 'sync' = 'info') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'sync') toast.success(msg);
    else toast(msg, { icon: 'ℹ️' });
    emitAlert({ type, message: msg, channel: 'stock' });
  };

  // cargar lookups (primero)
  const loadLookups = async () => {
    const [{ data: dc }, { data: dt }] = await Promise.all([
      supabase.from('categorias').select('id_categoria, nombre_categoria').order('nombre_categoria', { ascending: true }),
      supabase.from('tallas').select('id_talla, tipo, etiqueta, valor_numerico').order('tipo').order('valor_numerico', { ascending: true, nullsFirst: true }).order('etiqueta'),
    ]);
    setCats((dc ?? []).map(r => ({ id: r.id_categoria, name: r.nombre_categoria })));
    setTallas((dt ?? []).map(r => ({ id: r.id_talla, tipo: r.tipo, etiqueta: r.etiqueta, orden: r.valor_numerico })));
  };

  // diccionarios
  const catById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c.name])), [cats]);
  const tallaById = useMemo(
    () => Object.fromEntries(tallas.map(t => [t.id, { etiqueta: t.etiqueta, tipo: t.tipo, orden: t.orden ?? null }])),
    [tallas]
  );

  // query productos
  const fetchProducts = async (opts?: { silent?: boolean; keepSelection?: boolean }) => {
    const { silent = false, keepSelection = false } = opts || {};
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!silent && products.length === 0) setLoading(true);
      setTableBusy(true);

      let query = supabase
        .from('productos')
        .select('id, name, sku, price, categoria_id, talla_id, stockb2b, stockweb, stockml', { count: 'exact' });

      if (categoryFilter !== 'all') {
        query = query.eq('categoria_id', categoryFilter);
      }

      if (debouncedSearch) {
        const term = debouncedSearch.replace(/%/g, '').toLowerCase();
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }

      query = query.order('id', { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;

      const mapped: Product[] = (data || []).map((p: any) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        categoria_id: p.categoria_id ?? null,
        talla_id: p.talla_id ?? null,
        stockb2b: Number(p.stockb2b) || 0,
        stockweb: Number(p.stockweb) || 0,
        stockml: Number(p.stockml) || 0,
      }));

      startTransition(() => {
        setProducts(mapped);
        setTotalRows(count ?? 0);
        setLastUpdate(new Date().toLocaleTimeString());
        if (!keepSelection) setSelectedIds([]);
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Error al obtener productos:', err);
      toastAndLog('No se pudieron cargar productos.', 'error');
    } finally {
      setLoading(false);
      setTableBusy(false);
    }
  };

  // carga inicial: primero lookups, luego productos
  useEffect(() => { loadLookups(); }, []);
  useEffect(() => {
    if (cats.length && tallas.length) fetchProducts();
    const interval = setInterval(() => fetchProducts({ silent: true, keepSelection: true }), 100000);
    return () => { clearInterval(interval); abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.length, tallas.length]);

  // refetch en cambios de filtros
  useEffect(() => { setPage(1); }, [categoryFilter, debouncedSearch, pageSize]);
  useEffect(() => { fetchProducts({ silent: true }); }, [categoryFilter, debouncedSearch]); // eslint-disable-line

  // util
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);

  const getStockStatusClass = (stock: number) => {
    if (stock < 5) return 'text-red-600';
    if (stock < 10) return 'text-orange-600';
    return 'text-green-700';
  };

  // selección por checkbox (a nivel item/sku)
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  // eliminar (opcional)
  const deleteSelected = async () => {
    if (selectedIds.length === 0) return toast.error('No hay productos seleccionados.');
    if (!confirm(`¿Eliminar ${selectedIds.length} producto(s) en BD y Woo?`)) return;

    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    const skus = selectedProducts.map(p => String(p.sku));

    const results = await Promise.allSettled(skus.map(sku => wooDeleteProductLocal(sku)));
    const okWoo = results.filter(r => r.status === 'fulfilled').length;
    const failWoo = results.length - okWoo;

    const { error } = await supabase.from('productos').delete().in('id', selectedIds);
    if (error) {
      console.error(error);
      toastAndLog(error.message || 'Error al eliminar productos en BD.', 'error');
      return;
    }

    selectedProducts.forEach(p =>
      emitAlert({ type: 'error', message: `Producto eliminado: ${p.name} (SKU ${p.sku})`, channel: 'stock' })
    );
    toast.success(`Eliminados ${selectedIds.length} en BD. Woo: ${okWoo} ok / ${failWoo} fallo(s).`);

    setSelectedIds([]);
    fetchProducts({ silent: true });
  };

  // ===== Agrupación por FAMILIA (name + categoria + tipo de talla)
  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return products.filter(p => {
      const matchCat = categoryFilter === 'all' || (p.categoria_id ?? null) === categoryFilter;
      const matchText = !term || (p.name || '').toLowerCase().includes(term) || (p.sku || '').toLowerCase().includes(term);
      return matchCat && matchText;
    });
  }, [products, categoryFilter, debouncedSearch]);

  const fams = useMemo<FamRow[]>(() => {
    const map = new Map<FamKey, FamRow>();
    for (const p of filtered) {
      const t = p.talla_id ? tallaById[p.talla_id] : null;
      const tipo = (t?.tipo ?? 'alfanumerica') as 'alfanumerica'|'numerica';
      const key: FamKey = `${p.name}::${p.categoria_id ?? 0}::${tipo}`;
      if (!map.has(key)) map.set(key, { name: p.name, categoria_id: p.categoria_id ?? null, tipo, byTalla: {} });
      if (p.talla_id) map.get(key)!.byTalla[p.talla_id] = p;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, tallaById]);

  const columnsForFam = (fam: FamRow) => {
    const tallasFam = tallas.filter(t => t.tipo === fam.tipo);
    return fam.tipo === 'numerica'
      ? [...tallasFam].sort((a,b) => (a.orden ?? 0) - (b.orden ?? 0))
      : [...tallasFam].sort((a,b) => ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta));
  };

  // abrir modal de edición MATRIZ por familia
 const openEditFamily = (fam: FamRow) => {
  const cols = columnsForFam(fam);
  const values: EditFamilyState['values'] = {};
  let basePrice = 0;

  cols.forEach(t => {
    const p = fam.byTalla[t.id];
    values[t.id] = {
      id: p?.id,
      b2b: Number(p?.stockb2b ?? 0),
      web: Number(p?.stockweb ?? 0),
      ml:  Number(p?.stockml  ?? 0),
      price: Number(p?.price ?? 0),
    };
    if (p && !basePrice) basePrice = Number(p.price ?? 0);
  });

  setEditingFamily({
    name: fam.name,
    categoria_id: fam.categoria_id,
    tipo: fam.tipo,
    cols,
    values,
    basePrice, // fallback para tallas nuevas
  });
  setIsExistingSKU(true);
  setShowModal(true);
};




  // paginación sobre familias
  const totalFamilies = fams.length;
  const totalPages = Math.max(1, Math.ceil(totalFamilies / pageSize));
  const showingFrom = totalFamilies === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(totalFamilies, page * pageSize);
  const pageFams = useMemo(() => fams.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [fams, page, pageSize]);

  const goFirst = () => setPage(1);
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));
  const goLast = () => setPage(totalPages);

  // ====== Guardar
  const saveProduct = async () => {
    try {
      if (isExistingSKU && editingFamily) {
  const updates: Array<{ id:number; stockb2b:number; stockweb:number; stockml:number; price:number }> = [];
  const creates: Array<{ name:string; price:number; categoria_id:number|null; talla_id:number; stockb2b:number; stockweb:number; stockml:number }> = [];

  for (const t of editingFamily.cols) {
    const v = editingFamily.values[t.id];
    if (!v) continue;

    const b2b = Math.max(0, Number(v.b2b || 0));
    const web = Math.max(0, Number(v.web || 0));
    const ml  = Math.max(0, Number(v.ml  || 0));
    const price = Math.max(0, Number(v.price || editingFamily.basePrice || 0));

    if (v.id) {
      updates.push({ id: v.id, stockb2b: b2b, stockweb: web, stockml: ml, price });
    } else {
      const total = b2b + web + ml;
      if (total > 0) {
        creates.push({
          name: editingFamily.name,
          price,
          categoria_id: editingFamily.categoria_id ?? null,
          talla_id: t.id,
          stockb2b: b2b, stockweb: web, stockml: ml,
        });
      }
    }
  }

  // UPDATE existentes (incluye precio)
  if (updates.length) {
    const res = await Promise.allSettled(
      updates.map(u =>
        supabase.from('productos')
          .update({ stockb2b: u.stockb2b, stockweb: u.stockweb, stockml: u.stockml, price: u.price })
          .eq('id', u.id)
      )
    );
    const failed = res.filter(r => r.status === 'rejected' || (r as any).value?.error).length;
    if (failed) toastAndLog('Algunas tallas no pudieron actualizarse.', 'error');
  }

  // INSERT nuevos (BD genera SKU)
  let createdRows: any[] = [];
  if (creates.length) {
    const { data, error } = await supabase.from('productos').insert(creates).select();
    if (error) { console.error(error); toastAndLog('No se pudieron crear algunas tallas.', 'error'); }
    else createdRows = data || [];
  }

  // Woo best-effort
  try {
    await Promise.allSettled(
      updates.map(u => {
        const p = products.find(pp => pp.id === u.id);
        if (!p?.sku) return Promise.resolve();
        return wooPushStockLocal(String(p.sku), Number(u.stockweb));
      })
    );
    await Promise.allSettled(
      createdRows.map(row =>
        wooCreateProductLocal({
          skuLocal: row.sku,
          name: row.name,
          price: Number(row.price),
          initialStockWeb: Number(row.stockweb || 0),
        }).then(() => wooPushStockLocal(String(row.sku), Number(row.stockweb || 0)))
      )
    );
  } catch {}

  const msg: string[] = [];
  if (updates.length) msg.push(`Actualizadas ${updates.length}`);
  if (creates.length) msg.push(`Creadas ${creates.length}`);
  toastAndLog(msg.join(' · ') || 'Sin cambios', 'sync');
}

 else {
        // crear por matriz
const name = (editingProduct?.name || '').toString().trim();
const categoria_id = Number(editingProduct?.categoria_id || 0) || null;
if (!name || !categoria_id) return toast.error('Completa nombre y categoría.');

const matrix = editingProduct?.matrix || {};
const rows = Object.entries(matrix).map(([tId, v]: any) => {
  const b2b = Math.max(0, Number(v?.b2b || 0));
  const web = Math.max(0, Number(v?.web || 0));
  const ml  = Math.max(0, Number(v?.ml  || 0));
  const total = b2b + web + ml;
  if (total === 0) return null;
  const price = Math.max(0, Number(v?.price || editingProduct?.basePrice || 0));
  return { name, price, categoria_id, talla_id: Number(tId), stockb2b: b2b, stockweb: web, stockml: ml };
}).filter(Boolean) as any[];

if (!rows.length) return toast.error('Ingresa stock en al menos una talla.');

const { data, error } = await supabase.from('productos').insert(rows).select();
if (error || !data) { console.error(error); return toastAndLog('No se pudieron crear los productos.', 'error'); }

// Woo best effort
try {
  await Promise.allSettled(
    data.map((row:any) =>
      wooCreateProductLocal({
        skuLocal: row.sku,
        name: row.name,
        price: Number(row.price || 0),
        initialStockWeb: Number(row.stockweb || 0),
      }).then(() => wooPushStockLocal(String(row.sku), Number(row.stockweb || 0)))
    )
  );
} catch {}

toastAndLog(`Creadas ${rows.length} talla(s).`, 'sync');

      }
    } catch (err) {
      console.error('Error en saveProduct:', err);
      toastAndLog('Error en la operación.', 'error');
    } finally {
      setShowModal(false);
      setEditingProduct(null);
      setEditingFamily(null);
      setIsExistingSKU(false);
      fetchProducts({ silent: true });
    }
  };

    const selectedCatName = useMemo(() => {
    const id = Number(editingProduct?.categoria_id || 0);
    return cats.find(c => c.id === id)?.name || '';
  }, [editingProduct?.categoria_id, cats]);

  const tallaOptions = useMemo(() => {
    // Si quieres mantener la regla de que "Pantalones" usa numéricas:
    const esPantalon = selectedCatName.toLowerCase() === 'pantalones';
    return tallas
      .filter(t => esPantalon ? t.tipo === 'numerica' : t.tipo === 'alfanumerica')
      .sort((a,b) => {
        if (a.tipo === 'numerica' && b.tipo === 'numerica') return (a.orden ?? 0) - (b.orden ?? 0);
        return ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta);
      });
  }, [tallas, selectedCatName]);

  if (loading) return <div className="text-center py-12 text-neutral-500">Cargando datos...</div>;

  // helpers UI
  const channelBadge = (ch: Channel) =>
    ch === 'B2B' ? 'bg-fuchsia-100 text-fuchsia-700'
    : ch === 'Web' ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700';



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Inventario</h2>
          <p className="text-sm text-neutral-600">
            Última sync: {lastUpdate} {tableBusy && <span className="ml-2 text-xs text-neutral-400">(actualizando…)</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="border rounded px-3 py-2"
          >
            <option value="all">Todas las categorías</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button onClick={() => {
            setEditingProduct({
              sku: '',
              name: '',
              price: '',
              categoria_id: '',
              talla_id: '',
              stockb2b: '',
              stockweb: '',
              stockml: ''
            });
            setIsExistingSKU(false);
            setEditingFamily(null);
            setShowModal(true);
          }} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2">
            <Plus size={16} /> Agregar
          </button>
        </div>
      </div>

      {/* Acciones eliminar (opcional) */}
      {selectedIds.length > 0 && (
        <div>
          <button onClick={deleteSelected} className="bg-red-600 text-white px-4 py-2 rounded flex items-center gap-2">
            <Trash2 size={16} /> Eliminar seleccionados ({selectedIds.length})
          </button>
        </div>
      )}

      {/* Tabla MATRIZ por familias */}
      <div className="bg-white border rounded shadow overflow-x-auto text-[15px]">
        <table className="w-full">
          <thead>
  <tr className="border-b bg-neutral-50">
    <th className="text-left py-3 px-4 text-sm font-semibold">Nombre</th>
    <th className="text-center py-3 px-4 text-sm font-semibold">
      <div className="flex flex-col items-center">
        <span>Matriz de tallas</span>
        <span className="text-[11px] text-neutral-500 font-normal">(B2B / Web / ML)</span>
      </div>
    </th>
    <th className="text-center py-3 px-4 text-sm font-semibold align-middle">Total</th>
  </tr>
</thead>

          <tbody>
            {pageFams.map((fam, idx) => {
              const cols = columnsForFam(fam);
              const totalFam = Object.values(fam.byTalla).reduce((acc, p) => acc + (p.stockb2b||0) + (p.stockweb||0) + (p.stockml||0), 0);

              return (
                <tr key={idx} className="border-b align-top">
                  {/* Nombre / categoría / tipo + ✏️ */}
                  <td className="py-3 px-4 w-64">
                    <div className="font-semibold">{fam.name}</div>
                    <div className="text-xs text-neutral-500">{fam.categoria_id ? catById[fam.categoria_id] : ''}</div>
                    <button
                      onClick={() => openEditFamily(fam)}
                      className="mt-2 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                      title="Editar stocks de esta familia"
                    >
                      <Pencil size={16} /> Editar
                    </button>
                    <div>
                      <button
  onClick={async () => {
    if (!confirm(`Eliminar "${fam.name}" y todas sus tallas? Esta acción no se puede deshacer.`)) return;
    const items = Object.values(fam.byTalla);
    const ids = items.map(p => p.id);
    const skus = items.map(p => String(p.sku));

    // Woo (best-effort)
    await Promise.allSettled(skus.map(s => wooDeleteProductLocal(s)));

    // BD
    const { error } = await supabase.from('productos').delete().in('id', ids);
    if (error) {
      console.error(error);
      toastAndLog('No se pudo eliminar el producto.', 'error');
      return;
    }
    toastAndLog(`Producto "${fam.name}" eliminado (${ids.length} talla(s)).`, 'sync');
    fetchProducts({ silent: true });
  }}
  className="mt-1 inline-flex items-center gap-2 text-red-600 hover:text-red-800 text-sm"
  title="Eliminar este producto (todas sus tallas)"
>
  Eliminar
</button>

                    </div>
                  </td>
                  
                  {/* Matriz (solo lectura) en Grid */}
                  <td className="py-3 px-4">
                    <div className="overflow-x-auto" style={{ minWidth: 360 }}>
                      <div
                        className="grid gap-y-2 gap-x-2 items-center"
                        style={{ gridTemplateColumns: `120px repeat(${cols.length}, minmax(72px, 1fr))` }}
                      >
                        {/* encabezados tallas */}
                        <div></div>
                        {cols.map(t => (
                          <div key={t.id} className="text-center text-lg text-neutral-700 font-medium">{t.etiqueta}</div>
                        ))}

                        {/* filas por canal */}
                        {/* B2B */}
                        <div className="text-right pr-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${channelBadge('B2B')}`}>B2B</span>
                        </div>
                        {cols.map(t => {
                          const p = fam.byTalla[t.id];
                          const val = p?.stockb2b ?? 0;
                          const cls = getStockStatusClass(val);
                          return <div key={t.id} className="text-center"><span className={`font-semibold ${cls}`}>{val}</span></div>;
                        })}

                        {/* Web */}
                        <div className="text-right pr-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${channelBadge('Web')}`}>Web</span>
                        </div>
                        {cols.map(t => {
                          const p = fam.byTalla[t.id];
                          const val = p?.stockweb ?? 0;
                          const cls = getStockStatusClass(val);
                          return <div key={t.id} className="text-center"><span className={`font-semibold ${cls}`}>{val}</span></div>;
                        })}

                        {/* ML */}
                        <div className="text-right pr-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${channelBadge('ML')}`}>ML</span>
                        </div>
                        {cols.map(t => {
                          const p = fam.byTalla[t.id];
                          const val = p?.stockml ?? 0;
                          const cls = getStockStatusClass(val);
                          return <div key={t.id} className="text-center"><span className={`font-semibold ${cls}`}>{val}</span></div>;
                        })}
                        {/* TOTAL */}
<div className="text-right pr-2">
  <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 text-neutral-700">Total</span>
</div>
{cols.map(t => {
  const p = fam.byTalla[t.id];
  const total = (p?.stockb2b ?? 0) + (p?.stockweb ?? 0) + (p?.stockml ?? 0);
  const cls = getStockStatusClass(total);
  return <div key={t.id} className="text-center"><span className={`font-semibold ${cls}`}>{total}</span></div>;
})}

{/* PRECIO */}
<div className="text-right pr-2">
  <span className="px-2 py-1 rounded text-sm font-semibold bg-green-100 text-green-700">
    Precio
  </span>
</div>
{cols.map(t => {
  const p = fam.byTalla[t.id];
  const price = Number(p?.price ?? 0);
  return <div key={t.id} className="text-center text-sm">{price ? formatPrice(price) : '—'}</div>;
})}

                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-4 text-center align-middle">
  <div className="text-lg font-bold text-neutral-800">{totalFam}</div>
</td>

                </tr>
              );
            })}

            {pageFams.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-8 text-neutral-500">No se encontraron productos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación de familias */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-neutral-600">
          Mostrando <strong>{showingFrom}</strong>–<strong>{showingTo}</strong> de <strong>{totalFamilies}</strong> familias
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600">Filas por página:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {[10, 20, 30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <div className="flex items-center gap-1 ml-2">
            <button className="border rounded p-1 disabled:opacity-50" onClick={goFirst} disabled={page === 1}>
              <ChevronsLeft size={16} />
            </button>
            <button className="border rounded p-1 disabled:opacity-50" onClick={goPrev} disabled={page === 1}>
              <ChevronLeft size={16} />
            </button>
            <span className="mx-2 text-sm">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            <button className="border rounded p-1 disabled:opacity-50" onClick={goNext} disabled={page === totalPages}>
              <ChevronRight size={16} />
            </button>
            <button className="border rounded p-1 disabled:opacity-50" onClick={goLast} disabled={page === totalPages}>
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl relative p-6">
            <button
              className="absolute top-3 right-3 text-neutral-500"
              onClick={() => {
                setShowModal(false);
                setEditingProduct(null);
                setEditingFamily(null);
                setIsExistingSKU(false);
              }}
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-semibold mb-3">
              {isExistingSKU ? 'Editar stock por tallas' : 'Agregar producto nuevo'}
            </h3>

            {/* MODO EDITAR: MATRIZ */}
            {isExistingSKU && editingFamily && (
              <>
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Producto:</strong> {editingFamily.name}
                </div>
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Categoría:</strong> {editingFamily.categoria_id ? catById[editingFamily.categoria_id] : '—'}
                </div>
                <div className="mb-3 text-sm">
  <label className="block text-neutral-600 mb-1">
    Precio base (se usará al crear tallas nuevas)
  </label>
  <input
    type="text"
    inputMode="numeric"
    className="border rounded px-3 py-2 w-40"
    value={String(editingFamily.basePrice ?? 0)}
    onBeforeInput={(e) => {
      const el = e.currentTarget;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const data = (e as any).data ?? '';
      const proposed = el.value.slice(0, start) + data + el.value.slice(end);
      if (!/^\d*$/.test(proposed)) e.preventDefault();
    }}
    onPaste={(e) => {
      const paste = (e.clipboardData || (window as any).clipboardData).getData('text');
      if (!/^\d*$/.test(paste)) e.preventDefault();
    }}
    onChange={(e) => setEditingFamily(prev => prev ? { ...prev, basePrice: Number(e.target.value || 0) } : prev)}
  />
</div>

                <div className="mb-3 text-[11px] text-neutral-500">Edita el stock <strong>absoluto</strong> por talla y canal.</div>

                <div className="overflow-x-auto" style={{ minWidth: 480 }}>
                  <div
                    className="grid gap-y-2 gap-x-2 items-center"
                    style={{ gridTemplateColumns: `120px repeat(${editingFamily.cols.length}, minmax(72px, 1fr))` }}
                  >
                    <div></div>
                    {editingFamily.cols.map(t => (
                      <div key={t.id} className="text-center text-xs text-neutral-700 font-medium">{t.etiqueta}</div>
                    ))}

                    {(['B2B','Web','ML'] as const).map((label) => (
                      <div className="contents" key={label}>
                        <div className="text-right pr-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${channelBadge(label)}`}>{label}</span>
                        </div>
                        {editingFamily.cols.map(t => {
                          const v = editingFamily.values[t.id];
                          const field = label === 'B2B' ? 'b2b' : label === 'Web' ? 'web' : 'ml';
                          const value = (v as any)?.[field] ?? 0;
                          const disabled = !v?.id; // no existe ese SKU (talla)
                          return (
                            <div key={t.id} className="text-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="w-full border rounded px-2 py-1 text-center"
                                value={disabled ? '' : String(value)}
                                placeholder={disabled ? '—' : '0'}
                                disabled={disabled}
                                onBeforeInput={(e) => {
                                  const el = e.currentTarget;
                                  const start = el.selectionStart ?? el.value.length;
                                  const end = el.selectionEnd ?? el.value.length;
                                  const data = (e as any).data ?? '';
                                  const proposed = el.value.slice(0, start) + data + el.value.slice(end);
                                  if (!/^\d*$/.test(proposed)) e.preventDefault();
                                }}
                                onPaste={(e) => {
                                  const paste = (e.clipboardData || (window as any).clipboardData).getData('text');
                                  if (!/^\d*$/.test(paste)) e.preventDefault();
                                }}
                                onChange={(e) => {
                                  const n = e.target.value === '' ? 0 : Number(e.target.value.replace(/[^\d]/g, ''));
                                  setEditingFamily(prev => {
                                    if (!prev) return prev;
                                    const cur = prev.values[t.id] || { b2b: 0, web: 0, ml: 0 };
                                    return {
                                      ...prev,
                                      values: { ...prev.values, [t.id]: { ...cur, [field]: n } }
                                    };
                                  });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {/* TOTAL (solo lectura) */}
<div className="text-right pr-2">
  <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 text-neutral-700">Total</span>
</div>
{editingFamily.cols.map(t => {
  const v = editingFamily.values[t.id];
  const total = (v?.b2b ?? 0) + (v?.web ?? 0) + (v?.ml ?? 0);
  const cls = getStockStatusClass(total);
  return <div key={t.id} className="text-center"><span className={`font-semibold ${cls}`}>{total}</span></div>;
})}

{/* PRECIO (editable siempre) */}
<div className="text-right pr-2">
  <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 text-neutral-700">Precio</span>
</div>
{editingFamily.cols.map(t => {
  const v = editingFamily.values[t.id];
  const value = Number(v?.price ?? editingFamily.basePrice ?? 0);
  return (
    <div key={t.id} className="text-center">
      <input
        type="text"
        inputMode="numeric"
        className="w-full border rounded px-2 py-1 text-center"
        value={String(value || 0)}
        onBeforeInput={(e) => {
          const el = e.currentTarget;
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? el.value.length;
          const data = (e as any).data ?? '';
          const proposed = el.value.slice(0, start) + data + el.value.slice(end);
          if (!/^\d*$/.test(proposed)) e.preventDefault();
        }}
        onPaste={(e) => {
          const paste = (e.clipboardData || (window as any).clipboardData).getData('text');
          if (!/^\d*$/.test(paste)) e.preventDefault();
        }}
        onChange={(e) => {
          const n = Number((e.target.value || '0').replace(/[^\d]/g, ''));
          setEditingFamily(prev => {
            if (!prev) return prev;
            const cur = prev.values[t.id] || { b2b:0, web:0, ml:0, price:0 };
            return { ...prev, values: { ...prev.values, [t.id]: { ...cur, price: n } } };
          });
        }}
      />
    </div>
  );
})}

                  </div>
                </div>
              </>
            )}

            {/* MODO CREAR */}
            {!isExistingSKU && (
  <>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-sm text-neutral-600 mb-1">Nombre</label>
        <input
          type="text"
          value={editingProduct?.name || ''}
          onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600 mb-1">Categoría</label>
        <select
          value={editingProduct?.categoria_id ?? ''}
          onChange={(e) => setEditingProduct({ ...editingProduct, categoria_id: e.target.value ? Number(e.target.value) : '' })}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Seleccionar categoría</option>
          {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>
    </div>

    <div className="mt-3">
      <label className="block text-sm text-neutral-600 mb-1">Precio base</label>
      <input
        type="text"
        inputMode="numeric"
        className="border rounded px-3 py-2 w-40"
        value={String(editingProduct?.basePrice ?? 0)}
        onBeforeInput={(e) => {
          const el = e.currentTarget; const s = el.selectionStart ?? el.value.length; const en = el.selectionEnd ?? el.value.length;
          const d = (e as any).data ?? ''; const p = el.value.slice(0, s) + d + el.value.slice(en);
          if (!/^\d*$/.test(p)) e.preventDefault();
        }}
        onPaste={(e) => { const t = (e.clipboardData || (window as any).clipboardData).getData('text'); if (!/^\d*$/.test(t)) e.preventDefault(); }}
        onChange={(e) => setEditingProduct({ ...editingProduct, basePrice: Number(e.target.value || 0) })}
      />
    </div>

    {/* MATRIZ CREAR */}
    <div className="mt-4 overflow-x-auto" style={{ minWidth: 480 }}>
      {(() => {
        const catName = cats.find(c => c.id === Number(editingProduct?.categoria_id))?.name?.toLowerCase() || '';
        const tipo: 'alfanumerica' | 'numerica' = catName === 'pantalones' ? 'numerica' : 'alfanumerica';
        const cols = tallas
          .filter(t => t.tipo === tipo)
          .sort((a,b) => tipo === 'numerica'
            ? (a.orden ?? 0) - (b.orden ?? 0)
            : ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta));

        // estado local de la matriz de creación
        if (!editingProduct?.matrix) {
          const init: Record<number, { b2b:number; web:number; ml:number; price:number }> = {};
          cols.forEach(t => { init[t.id] = { b2b:0, web:0, ml:0, price: Number(editingProduct?.basePrice || 0) }; });
          setEditingProduct((p:any) => ({ ...p, matrix: init }));
        }

        const setVal = (tId:number, field:'b2b'|'web'|'ml'|'price', val:string) => {
          const n = Number((val || '0').replace(/[^\d]/g, ''));
          setEditingProduct((p:any) => ({ ...p, matrix: { ...p.matrix, [tId]: { ...p.matrix[tId], [field]: n } } }));
        };

        const gridTemplateColumns = `120px repeat(${cols.length}, minmax(72px, 1fr))`;

        return (
          <div className="grid gap-y-2 gap-x-2 items-center" style={{ gridTemplateColumns }}>
            <div></div>
            {cols.map(t => (
              <div key={t.id} className="text-center text-xs text-neutral-700 font-medium">{t.etiqueta}</div>
            ))}

            {/* B2B */}
            <div className="text-right pr-2">
              <span className="px-2 py-1 rounded text-xs font-semibold bg-fuchsia-100 text-fuchsia-700">B2B</span>
            </div>
            {cols.map(t => (
              <div key={t.id} className="text-center">
                <input type="text" inputMode="numeric" className="w-full border rounded px-2 py-1 text-center"
                  value={String(editingProduct?.matrix?.[t.id]?.b2b ?? 0)}
                  onBeforeInput={(e)=>{const el=e.currentTarget;const s=el.selectionStart??el.value.length;const en=el.selectionEnd??el.value.length;const d=(e as any).data??'';const p=el.value.slice(0,s)+d+el.value.slice(en);if(!/^\d*$/.test(p)) e.preventDefault();}}
                  onPaste={(e)=>{const t=(e.clipboardData||(window as any).clipboardData).getData('text');if(!/^\d*$/.test(t)) e.preventDefault();}}
                  onChange={(e)=>setVal(t.id,'b2b',e.target.value)} />
              </div>
            ))}

            {/* Web */}
            <div className="text-right pr-2">
              <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700">Web</span>
            </div>
            {cols.map(t => (
              <div key={t.id} className="text-center">
                <input type="text" inputMode="numeric" className="w-full border rounded px-2 py-1 text-center"
                  value={String(editingProduct?.matrix?.[t.id]?.web ?? 0)}
                  onBeforeInput={(e)=>{const el=e.currentTarget;const s=el.selectionStart??el.value.length;const en=el.selectionEnd??el.value.length;const d=(e as any).data??'';const p=el.value.slice(0,s)+d+el.value.slice(en);if(!/^\d*$/.test(p)) e.preventDefault();}}
                  onPaste={(e)=>{const t=(e.clipboardData||(window as any).clipboardData).getData('text');if(!/^\d*$/.test(t)) e.preventDefault();}}
                  onChange={(e)=>setVal(t.id,'web',e.target.value)} />
              </div>
            ))}

            {/* ML */}
            <div className="text-right pr-2">
              <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700">ML</span>
            </div>
            {cols.map(t => (
              <div key={t.id} className="text-center">
                <input type="text" inputMode="numeric" className="w-full border rounded px-2 py-1 text-center"
                  value={String(editingProduct?.matrix?.[t.id]?.ml ?? 0)}
                  onBeforeInput={(e)=>{const el=e.currentTarget;const s=el.selectionStart??el.value.length;const en=el.selectionEnd??el.value.length;const d=(e as any).data??'';const p=el.value.slice(0,s)+d+el.value.slice(en);if(!/^\d*$/.test(p)) e.preventDefault();}}
                  onPaste={(e)=>{const t=(e.clipboardData||(window as any).clipboardData).getData('text');if(!/^\d*$/.test(t)) e.preventDefault();}}
                  onChange={(e)=>setVal(t.id,'ml',e.target.value)} />
              </div>
            ))}

            {/* TOTAL (solo lectura) */}
            <div className="text-right pr-2">
              <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 text-neutral-700">Total</span>
            </div>
            {cols.map(t => {
              const v = editingProduct?.matrix?.[t.id] || {b2b:0,web:0,ml:0};
              const total = (v.b2b||0)+(v.web||0)+(v.ml||0);
              const cls = getStockStatusClass(total);
              return <div key={t.id} className="text-center"><span className={`font-semibold ${cls}`}>{total}</span></div>;
            })}

            {/* PRECIO */}
            <div className="text-right pr-2">
              <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 text-neutral-700">Precio</span>
            </div>
            {cols.map(t => (
              <div key={t.id} className="text-center">
                <input type="text" inputMode="numeric" className="w-full border rounded px-2 py-1 text-center"
                  value={String(editingProduct?.matrix?.[t.id]?.price ?? editingProduct?.basePrice ?? 0)}
                  onBeforeInput={(e)=>{const el=e.currentTarget;const s=el.selectionStart??el.value.length;const en=el.selectionEnd??el.value.length;const d=(e as any).data??'';const p=el.value.slice(0,s)+d+el.value.slice(en);if(!/^\d*$/.test(p)) e.preventDefault();}}
                  onPaste={(e)=>{const t=(e.clipboardData||(window as any).clipboardData).getData('text');if(!/^\d*$/.test(t)) e.preventDefault();}}
                  onChange={(e)=>setVal(t.id,'price',e.target.value)} />
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  </>
)}


            <div className="mt-4 flex gap-2">
              <button onClick={saveProduct} className="bg-green-600 text-white px-4 py-2 rounded">
                {isExistingSKU ? 'Guardar cambios' : 'Guardar producto'}
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingProduct(null);
                  setEditingFamily(null);
                  setIsExistingSKU(false);
                }}
                className="border px-4 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
