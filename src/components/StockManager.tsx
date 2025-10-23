// src/components/StockManager.tsx
import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { Plus, Pencil, Trash2, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { emitAlert } from '../state/alertsBus';
import { wooCreateProductLocal, wooDeleteProductLocal, wooPushStockLocal, wooUpdateProductLocal } from '../data/woo';

type LookupCat = { id: number; name: string };
type LookupVar = { id: number; name: string };
type LookupCol = { id: number; name: string };
type LookupTal = { id: number; tipo: 'alfanumerica' | 'numerica'; etiqueta: string; orden: number | null };

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number;
  // FKs
  categoria_id: number | null;
  variante_id: number | null;
  color_id: number | null;
  talla_id: number | null;
  // stocks
  stockb2b: number;
  stockweb: number;
  stockml: number;
  // Derivados para UI
  categoria_nombre?: string;
  variante_nombre?: string;
  color_nombre?: string;
  talla_etiqueta?: string;
};

type SortField =
  | 'name' | 'sku' | 'price'
  | 'stockb2b' | 'stockweb' | 'stockml'
  | 'categoria_nombre' | 'variante_nombre' | 'color_nombre' | 'talla_etiqueta';
type SortOrder = 'asc' | 'desc';

const toInt = (s: unknown) => {
  const n = parseInt(String(s ?? '').replace(/\s+/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

// SKU helper: SKU- + 2 dígitos por cada ID (00 si null)
const pad2 = (n: number | null | undefined) => String(n ?? 0).padStart(2, '0');
const buildSku = (c: number | null | undefined, v: number | null | undefined, col: number | null | undefined, t: number | null | undefined) =>
  `SKU-${pad2(c)}${pad2(v)}${pad2(col)}${pad2(t)}`;

export const StockManager = () => {
  // datos
  const [products, setProducts] = useState<Product[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);

  // lookups desde BD
  const [cats, setCats] = useState<LookupCat[]>([]);
  const [vars, setVars] = useState<LookupVar[]>([]);
  const [cols, setCols] = useState<LookupCol[]>([]);
  const [tallas, setTallas] = useState<LookupTal[]>([]);

  // filtros / búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | number>('all');

  // orden
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // paginación
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // estados UI
  const [loading, setLoading] = useState(true);
  const [tableBusy, setTableBusy] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isExistingSKU, setIsExistingSKU] = useState<boolean>(false);

  // selección múltiple
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // abort
  const abortRef = useRef<AbortController | null>(null);

  // debounce búsqueda
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // toast
  const toastAndLog = (msg: string, type: 'info' | 'error' | 'sync' = 'info') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'sync') toast.success(msg);
    else toast(msg, { icon: 'ℹ️' });
    emitAlert({ type, message: msg, channel: 'stock' });
  };

  // cargar lookups (una vez)
  const loadLookups = async () => {
    const [{ data: dc }, { data: dv }, { data: dco }, { data: dt }] = await Promise.all([
      supabase.from('categorias').select('id_categoria, nombre_categoria').order('nombre_categoria', { ascending: true }),
      supabase.from('variantes').select('id_variante, nombre_variante').order('nombre_variante', { ascending: true }),
      supabase.from('colores').select('id_color, nombre_color').order('nombre_color', { ascending: true }),
      supabase.from('tallas').select('id_talla, tipo, etiqueta, valor_numerico').order('tipo', { ascending: true }).order('valor_numerico', { ascending: true, nullsFirst: true }).order('etiqueta', { ascending: true }),
    ]);

    setCats((dc ?? []).map(r => ({ id: r.id_categoria, name: r.nombre_categoria })));
    setVars((dv ?? []).map(r => ({ id: r.id_variante, name: r.nombre_variante })));
    setCols((dco ?? []).map(r => ({ id: r.id_color, name: r.nombre_color })));
    setTallas((dt ?? []).map(r => ({ id: r.id_talla, tipo: r.tipo, etiqueta: r.etiqueta, orden: r.valor_numerico })));
  };

  // diccionarios para resolver nombres
  const catById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c.name])), [cats]);
  const varById = useMemo(() => Object.fromEntries(vars.map(v => [v.id, v.name])), [vars]);
  const colById = useMemo(() => Object.fromEntries(cols.map(c => [c.id, c.name])), [cols]);
  const talById = useMemo(() => Object.fromEntries(tallas.map(t => [t.id, t.etiqueta])), [tallas]);

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
        .select('id, name, sku, price, categoria_id, variante_id, color_id, talla_id, stockb2b, stockweb, stockml', { count: 'exact' });

      // filtro categoría (por id)
      if (categoryFilter !== 'all') {
        query = query.eq('categoria_id', categoryFilter);
      }

      // búsqueda por nombre o sku
      if (debouncedSearch) {
        const term = debouncedSearch.replace(/%/g, '').toLowerCase();
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }

      // orden server-side solo donde aplique
      const serverSortable: Array<SortField> = ['name', 'sku', 'price', 'stockb2b', 'stockweb', 'stockml'];
      if (serverSortable.includes(sortField)) {
        query = query.order(sortField as any, { ascending: sortOrder === 'asc', nullsFirst: true });
      } else {
        // fallback: ordenar por id para luego ordenar en memoria
        query = query.order('id', { ascending: true });
      }

      // paginación
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      // mapear + resolver nombres
      let mapped: Product[] = (data || []).map((p: any) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        categoria_id: p.categoria_id ?? null,
        variante_id: p.variante_id ?? null,
        color_id: p.color_id ?? null,
        talla_id: p.talla_id ?? null,
        stockb2b: Number(p.stockb2b) || 0,
        stockweb: Number(p.stockweb) || 0,
        stockml: Number(p.stockml) || 0,
        categoria_nombre: p.categoria_id ? catById[p.categoria_id] : '',
        variante_nombre: p.variante_id ? varById[p.variante_id] : '',
        color_nombre: p.color_id ? colById[p.color_id] : '',
        talla_etiqueta: p.talla_id ? talById[p.talla_id] : '',
      }));

      // orden client-side si el campo es derivado
      if (!serverSortable.includes(sortField)) {
        const dir = sortOrder === 'asc' ? 1 : -1;
        mapped = [...mapped].sort((a, b) => {
          const av = (a as any)[sortField] ?? '';
          const bv = (b as any)[sortField] ?? '';
          return String(av).localeCompare(String(bv), 'es', { numeric: true }) * dir;
        });
      }

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

  // carga inicial
  useEffect(() => { loadLookups(); }, []);

  useEffect(() => {
    if (cats.length && vars.length && cols.length && tallas.length) {
      fetchProducts();
    }
    const interval = setInterval(() => fetchProducts({ silent: true, keepSelection: true }), 100000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.length, vars.length, cols.length, tallas.length]);

  // refresca los nombres de categoría/variante/color/talla cuando llegan los lookups
  useEffect(() => {
    if (products.length === 0) return;
    setProducts(prev =>
      prev.map(p => ({
        ...p,
        categoria_nombre: p.categoria_id ? catById[p.categoria_id] : '',
        variante_nombre:  p.variante_id  ? varById[p.variante_id]   : '',
        color_nombre:     p.color_id     ? colById[p.color_id]      : '',
        talla_etiqueta:   p.talla_id     ? talById[p.talla_id]      : '',
      }))
    );
  }, [catById, varById, colById, talById]);


  // refetch en cambios
  useEffect(() => { setPage(1); }, [categoryFilter, debouncedSearch, pageSize]);
  useEffect(() => { fetchProducts({ silent: true }); }, [sortField, sortOrder, page, pageSize, categoryFilter, debouncedSearch]); // eslint-disable-line

  // orden
  const handleSort = (field: SortField) => {
    const nextOrder: SortOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(nextOrder);
  };

  // totales
  const stockTotal = (p: Product) => (p.stockb2b || 0) + (p.stockweb || 0) + (p.stockml || 0);

  // util UI
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);

  const getStockStatus = (stock: number) => {
    if (stock < 10) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Crítico' };
    if (stock < 20) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Bajo' };
    return { color: 'text-green-700', bg: 'bg-green-50', label: 'Normal' };
  };

  // selección
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };
  const allSelectedOnPage = useMemo(
    () => products.length > 0 && selectedIds.length === products.length && products.every(p => selectedIds.includes(p.id)),
    [products, selectedIds]
  );
  const toggleSelectAll = () => {
    if (allSelectedOnPage) setSelectedIds([]);
    else setSelectedIds(products.map((p) => p.id));
  };

  // eliminar
  const deleteSelected = async () => {
    if (selectedIds.length === 0) return toast.error('No hay productos seleccionados.');
    if (!confirm(`¿Eliminar ${selectedIds.length} producto(s) en BD y Woo?`)) return;

    const selectedProducts = products.filter(p => selectedIds.includes(p.id));
    const skus = selectedProducts.map(p => String(p.sku));

    const results = await Promise.allSettled(skus.map(sku => wooDeleteProductLocal(sku)));
    const okWoo = results.filter(r => r.status === 'fulfilled').length;
    const failWoo = results.length - okWoo;
    if (failWoo > 0) console.warn('Woo delete falló en', failWoo, 'elementos', results);

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

    const remaining = totalRows - selectedIds.length;
    const lastPage = Math.max(1, Math.ceil(remaining / pageSize));
    setSelectedIds([]);
    if (page > lastPage) setPage(lastPage);
    else fetchProducts({ silent: true });
  };

  // buscar SKU
  const handleSKUBlur = async () => {
    const sku = editingProduct?.sku?.toString()?.trim();
    if (!sku) return;

    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, name, sku, price, categoria_id, variante_id, color_id, talla_id, stockb2b, stockweb, stockml')
        .eq('sku', sku)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setIsExistingSKU(true);
        setEditingProduct({
          id: Number(data.id),
          name: data.name,
          sku: data.sku,
          price: Number(data.price) || 0,
          categoria_id: data.categoria_id,
          variante_id: data.variante_id,
          color_id: data.color_id,
          talla_id: data.talla_id,
          _originalstockb2b: Number(data.stockb2b) || 0,
          _originalstockweb: Number(data.stockweb) || 0,
          _originalstockml:  Number(data.stockml)  || 0,
          stockb2b: '',
          stockweb: '',
          stockml:  '',
        });
        toastAndLog(`SKU encontrado: ${data.name} — puedes editar nombre, precio y stock`, 'info');
      } else {
        setIsExistingSKU(false);
        setEditingProduct((prev: any) => ({
          ...prev,
          stockb2b: '',
          stockweb: '',
          stockml:  ''
        }));
        toastAndLog(`SKU no encontrado: ${sku} — completa para crear`, 'info');
      }
    } catch (err) {
      console.error('Error buscando SKU:', err);
      toastAndLog('Error al buscar SKU.', 'error');
    }
  };

  // guardar
  const saveProduct = async () => {
    if (!editingProduct?.sku) return toast.error('El SKU es obligatorio.');

    try {
      if (isExistingSKU) {
        // EDITAR: deltas
        const origB2B = Number(editingProduct._originalstockb2b || 0);
        const origWeb = Number(editingProduct._originalstockweb || 0);
        const origMl  = Number(editingProduct._originalstockml  || 0);

        const deltaB2B = toInt(editingProduct.stockb2b);
        const deltaWeb = toInt(editingProduct.stockweb);
        const deltaMl  = toInt(editingProduct.stockml);

        if (deltaB2B === 0 && deltaWeb === 0 && deltaMl === 0 && !editingProduct?.name && !editingProduct?.price) {
          return toast.error('No ingresaste cambios.');
        }

        const nuevos = {
          stockb2b: origB2B + deltaB2B,
          stockweb: origWeb + deltaWeb,
          stockml:  origMl  + deltaMl,
        };

        if (nuevos.stockb2b < 0 || nuevos.stockweb < 0 || nuevos.stockml < 0) {
          return toast.error('El stock no puede quedar negativo.');
        }

        // 1) Actualiza stocks en BD
        let res;
        if (editingProduct?.id) {
          res = await supabase.from('productos').update(nuevos).eq('id', Number(editingProduct.id)).select().maybeSingle();
        } else {
          res = await supabase.from('productos').update(nuevos).eq('sku', editingProduct.sku.toString().trim()).select().maybeSingle();
        }

        const { data, error } = res;
        if (error) {
          console.error('Error al actualizar stock:', error);
          return toastAndLog(error.message || 'Error al actualizar stock.', 'error');
        }
        if (!data) return toastAndLog('No se actualizó ninguna fila (SKU o ID no encontrado).', 'error');

        // 2) Actualiza detalles + stock absoluto web en Woo (y refleja nombre/precio en BD si la función los toca también)
        try {
          const currentName = (data?.name ?? '').trim();
          const currentPrice = Number(data?.price ?? 0);

          const desiredName = String(editingProduct?.name ?? currentName).trim();
          const desiredPrice = toInt(editingProduct?.price ?? currentPrice);

          const payload: {
            skuLocal: string;
            name?: string;
            price?: number;
            absoluteStockWeb?: number;
          } = { skuLocal: String(editingProduct.sku) };

          let hasChanges = false;

          if (desiredName && desiredName !== currentName) {
            payload.name = desiredName;
            hasChanges = true;
          }
          if (Number.isFinite(desiredPrice) && desiredPrice !== currentPrice) {
            payload.price = desiredPrice;
            hasChanges = true;
          }

          // siempre mandamos el stock web absoluto para alinear Woo
          payload.absoluteStockWeb = Number(nuevos.stockweb);
          hasChanges = true;

          if (hasChanges) {
            await wooUpdateProductLocal(payload);
          }
        } catch (e) {
          console.error("Actualizar detalles en Woo/BD falló:", e);
          toastAndLog("Stocks guardados en BD, pero el update de Woo falló.", "error");
        }

        const name = (editingProduct?.name || data.name || '(sin nombre)').toString();
        const sku  = editingProduct?.sku  || data.sku;
        const totalAntes   = origB2B + origWeb + origMl;
        const totalDespues = nuevos.stockb2b + nuevos.stockweb + nuevos.stockml;

        toastAndLog(
          `Actualizado: ${name} (SKU ${sku}) • B2B ${origB2B}→${nuevos.stockb2b} | Web ${origWeb}→${nuevos.stockweb} | ML ${origMl}→${nuevos.stockml} • Total ${totalAntes}→${totalDespues}`,
          'sync'
        );
      } else {
        // CREAR
        const name = (editingProduct.name || '').toString().trim();
        const price = toInt(editingProduct.price);
        const categoria_id = Number(editingProduct.categoria_id || 0) || null;
        const variante_id  = Number(editingProduct.variante_id  || 0) || null;
        const color_id     = Number(editingProduct.color_id     || 0) || null;
        const talla_id     = Number(editingProduct.talla_id     || 0) || null;

        // SKU SIEMPRE desde las opciones, no desde el input:
        const sku = buildSku(categoria_id, variante_id, color_id, talla_id);

        if (!name || !price || !categoria_id || !variante_id || !color_id || !talla_id) {
          return toast.error('Completa nombre, precio, categoría, variante, color y talla.');
        }

        const sB2B = Math.max(0, toInt(editingProduct.stockb2b));
        const sWeb = Math.max(0, toInt(editingProduct.stockweb));
        const sML  = Math.max(0, toInt(editingProduct.stockml));

        const newProd = { name, sku, price, categoria_id, variante_id, color_id, talla_id, stockb2b: sB2B, stockweb: sWeb, stockml: sML };

        const { error } = await supabase.from('productos').insert(newProd);
        if (error) {
          console.error('Error al crear producto:', error);
          return toastAndLog(error.message || 'Error al crear producto.', 'error');
        }

        try {
          const resWoo = await wooCreateProductLocal({
            skuLocal: sku,
            name,
            price,
            initialStockWeb: sWeb,
          });
          await wooPushStockLocal(sku, sWeb);
          toastAndLog(`Producto creado y sincronizado con Woo: ${name} (SKU Woo ${resWoo.skuWoo})`, 'sync');
        } catch (e) {
          console.error("Crear/Sync en Woo falló:", e);
          toastAndLog("Producto creado en BD. No se pudo crear/actualizar en Woo.", "error");
        }

        const total = sB2B + sWeb + sML;
        toastAndLog(
          `Producto creado: ${newProd.name} (SKU ${newProd.sku}) • B2B ${sB2B} | Web ${sWeb} | ML ${sML} • Total ${total}`,
          'sync'
        );
      }
    } catch (err) {
      console.error('Error en saveProduct:', err);
      toastAndLog('Error en la operación.', 'error');
    } finally {
      setShowModal(false);
      setEditingProduct(null);
      setIsExistingSKU(false);
      fetchProducts({ silent: true });
    }
  };

  // helpers UI modal
  const selectedCatName = useMemo(() => {
    const id = Number(editingProduct?.categoria_id || 0);
    return cats.find(c => c.id === id)?.name || '';
  }, [editingProduct?.categoria_id, cats]);

  const tallaOptions = useMemo(() => {
    const esPantalon = selectedCatName.toLowerCase() === 'pantalones';
    return tallas
      .filter(t => esPantalon ? t.tipo === 'numerica' : t.tipo === 'alfanumerica')
      .sort((a,b) => {
        // num: por valor_numerico; alfa: XS,S,M...
        if (a.tipo === 'numerica' && b.tipo === 'numerica') {
          return (a.orden ?? 0) - (b.orden ?? 0);
        }
        const order = ['XS','S','M','L','XL','XXL','3XL'];
        return order.indexOf(a.etiqueta) - order.indexOf(b.etiqueta);
      });
  }, [tallas, selectedCatName]);

  // cuando cambian FKs, autoconstruir SKU si el usuario no lo tocó manualmente
  useEffect(() => {
    if (!showModal || !editingProduct) return;

    // SKU solo auto para "agregar" (isExistingSKU === false)
    if (!isExistingSKU) {
      const autoSku = buildSku(
        Number(editingProduct?.categoria_id || 0),
        Number(editingProduct?.variante_id  || 0),
        Number(editingProduct?.color_id     || 0),
        Number(editingProduct?.talla_id     || 0),
      );
      setEditingProduct((prev: any) => ({ ...prev, sku: autoSku }));
    }
  }, [
    showModal,
    isExistingSKU,
    editingProduct?.categoria_id,
    editingProduct?.variante_id,
    editingProduct?.color_id,
    editingProduct?.talla_id,
  ]);

  // paginación
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const showingFrom = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(totalRows, page * pageSize);
  const goFirst = () => setPage(1);
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));
  const goLast = () => setPage(totalPages);

  if (loading) return <div className="text-center py-12 text-neutral-500">Cargando datos...</div>;

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
              variante_id: '',
              color_id: '',
              talla_id: '',
              stockb2b: '',
              stockweb: '',
              stockml: ''
            });
            setIsExistingSKU(false);
            setShowModal(true);
          }} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2">
            <Plus size={16} /> Agregar
          </button>
        </div>
      </div>

      {/* Acciones eliminar */}
      {selectedIds.length > 0 && (
        <div>
          <button onClick={deleteSelected} className="bg-red-600 text-white px-4 py-2 rounded flex items-center gap-2">
            <Trash2 size={16} /> Eliminar seleccionados ({selectedIds.length})
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border rounded shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-100">
            <tr>
              <th className="py-3 px-4 text-center">
                <input
                  type="checkbox"
                  checked={allSelectedOnPage}
                  onChange={toggleSelectAll}
                />
              </th>

              {[
                { label: 'Nombre', key: 'name' as SortField, align: 'text-left' },
                { label: 'SKU', key: 'sku' as SortField, align: 'text-left' },
                { label: 'Categoría', key: 'categoria_nombre' as SortField, align: 'text-center' },
                { label: 'Variante', key: 'variante_nombre' as SortField, align: 'text-center' },       
                { label: 'Talla', key: 'talla_etiqueta' as SortField, align: 'text-center' },
                { label: 'Color', key: 'color_nombre' as SortField, align: 'text-center' },
                { label: 'Precio', key: 'price' as SortField, align: 'text-center' },
                { label: 'B2B', key: 'stockb2b' as SortField, align: 'text-center' },
                { label: 'Web', key: 'stockweb' as SortField, align: 'text-center' },
                { label: 'ML', key: 'stockml' as SortField, align: 'text-center' },
              ].map(({ label, key, align }) => (
                <th
                  key={key}
                  className={`py-3 px-4 ${align} cursor-pointer select-none`}
                  onClick={() => handleSort(key)}
                  title="Click para ordenar"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{label}</span>
                    {sortField === key && <span className="text-neutral-500">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                  </div>
                </th>
              ))}

              <th className="py-3 px-4 text-center">Total</th>
              <th className="py-3 px-4 text-center">Editar</th>
            </tr>
          </thead>

          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b hover:bg-neutral-50">
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                </td>

                <td className="py-3 px-4">{p.name}</td>
                <td className="py-3 px-4"><code className="bg-neutral-100 px-2 py-1 rounded">{p.sku}</code></td>
                <td className="py-3 px-4 text-center">{p.categoria_nombre || '—'}</td>
                <td className="py-3 px-4 text-center">{p.variante_nombre || '—'}</td>
                <td className="py-3 px-4 text-center">{p.talla_etiqueta || '—'}</td>
                <td className="py-3 px-4 text-center">{p.color_nombre || '—'}</td>
                <td className="py-3 px-4 text-center">{formatPrice(Number(p.price))}</td>

                <td className="py-3 px-4 text-center">
                  {(() => { const s = getStockStatus(p.stockb2b ?? 0);
                    return <span className={`${s.color} font-semibold`}>{p.stockb2b ?? 0} <span className="text-xs ml-1">({s.label})</span></span>;
                  })()}
                </td>
                <td className="py-3 px-4 text-center">
                  {(() => { const s = getStockStatus(p.stockweb ?? 0);
                    return <span className={`${s.color} font-semibold`}>{p.stockweb ?? 0} <span className="text-xs ml-1">({s.label})</span></span>;
                  })()}
                </td>
                <td className="py-3 px-4 text-center">
                  {(() => { const s = getStockStatus(p.stockml ?? 0);
                    return <span className={`${s.color} font-semibold`}>{p.stockml ?? 0} <span className="text-xs ml-1">({s.label})</span></span>;
                  })()}
                </td>

                <td className="py-3 px-4 text-center font-semibold">{stockTotal(p)}</td>

                <td className="py-3 px-4 text-center">
                  <button onClick={() => {
                    setEditingProduct({
                      ...p,
                      _originalstockb2b: Number(p.stockb2b || 0),
                      _originalstockweb: Number(p.stockweb || 0),
                      _originalstockml:  Number(p.stockml  || 0),
                      stockb2b: '',
                      stockweb: '',
                      stockml:  '',
                    });
                    setIsExistingSKU(true);
                    setShowModal(true);
                  }} className="text-blue-600 hover:text-blue-800">
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {products.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-8 text-neutral-500">No se encontraron productos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-neutral-600">
          Mostrando <strong>{showingFrom}</strong>–<strong>{showingTo}</strong> de <strong>{totalRows}</strong> resultados
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
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg relative p-6">
            <button
              className="absolute top-3 right-3 text-neutral-500"
              onClick={() => {
                setShowModal(false);
                setEditingProduct(null);
                setIsExistingSKU(false);
              }}
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-semibold mb-3">
              {isExistingSKU ? 'Actualizar producto' : 'Agregar producto nuevo'}
            </h3>

            {/* SKU */}
            <div className="mb-3">
              <label className="block text-sm text-neutral-600 mb-1">SKU</label>

              {/* Agregar: SKU bloqueado y auto-generado */}
              {!isExistingSKU && (
                <input
                  type="text"
                  value={editingProduct?.sku || ''}
                  readOnly
                  className="w-full border rounded px-3 py-2 bg-neutral-100 text-neutral-700"
                  title="El SKU se genera automáticamente según Categoría, Variante, Color y Talla"
                />
              )}

              {/* Editar: SKU solo lectura */}
              {isExistingSKU && (
                <input
                  type="text"
                  value={editingProduct?.sku || ''}
                  readOnly
                  className="w-full border rounded px-3 py-2 bg-neutral-100 text-neutral-700"
                />
              )}

              {!isExistingSKU && (
                <p className="text-[11px] text-neutral-500 mt-1">
                  Se genera como <code>SKU-XXYYZZTT</code> según tus selecciones.
                </p>
              )}
            </div>

            {isExistingSKU ? (
              <>
                {/* Nombre editable */}
                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editingProduct?.name || ''}
                    onChange={(e) =>
                      setEditingProduct((prev: any) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                {/* Precio editable */}
                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Precio</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={
                      editingProduct?.price === 0 || editingProduct?.price
                        ? String(editingProduct.price)
                        : ''
                    }
                    onBeforeInput={(e) => {
                      const el = e.currentTarget as HTMLInputElement;
                      const start = el.selectionStart ?? el.value.length;
                      const end = el.selectionEnd ?? el.value.length;
                      const data = (e as unknown as InputEvent).data ?? '';
                      const proposed = el.value.slice(0, start) + data + el.value.slice(end);
                      if (!/^\d*$/.test(proposed)) e.preventDefault();
                    }}
                    onPaste={(e) => {
                      const t = e.clipboardData?.getData('text') ?? '';
                      if (!/^\d*$/.test(t)) e.preventDefault();
                    }}
                    onChange={(e) =>
                      setEditingProduct((prev: any) => ({
                        ...prev,
                        price: e.target.value.replace(/[^\d]/g, ''),
                      }))
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                {/* Deltas de stock */}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {/* B2B */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Sumar a <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 text-[10px]">B2B</span>
                    </label>
                    <div className="text-xs text-neutral-500 mb-1">
                      Actual: <strong>{editingProduct?._originalstockb2b ?? 0}</strong>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingProduct?.stockb2b ?? ''}
                      onBeforeInput={(e) => {
                        const el = e.currentTarget;
                        const start = el.selectionStart ?? el.value.length;
                        const end = el.selectionEnd ?? el.value.length;
                        const data = (e as any).data ?? '';
                        const proposed = el.value.slice(0, start) + data + el.value.slice(end);
                        if (!/^(-?\d*)$/.test(proposed)) e.preventDefault();
                        if (data === '-' && start !== 0) e.preventDefault();
                        if (data?.includes('-') && el.value.includes('-') && start === 0) e.preventDefault();
                      }}
                      onPaste={(e) => {
                        const paste = (e.clipboardData || (window as any).clipboardData).getData('text');
                        if (!/^(-?\d*)$/.test(paste)) e.preventDefault();
                      }}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockb2b: e.target.value })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="Ej: -2 o 5"
                    />
                  </div>

                  {/* Web */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Sumar a <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px]">Web</span>
                    </label>
                    <div className="text-xs text-neutral-500 mb-1">
                      Actual: <strong>{editingProduct?._originalstockweb ?? 0}</strong>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingProduct?.stockweb ?? ''}
                      onBeforeInput={(e) => {
                        const el = e.currentTarget;
                        const start = el.selectionStart ?? el.value.length;
                        const end = el.selectionEnd ?? el.value.length;
                        const data = (e as any).data ?? '';
                        const proposed = el.value.slice(0, start) + data + el.value.slice(end);
                        if (!/^(-?\d*)$/.test(proposed)) e.preventDefault();
                        if (data === '-' && start !== 0) e.preventDefault();
                        if (data?.includes('-') && el.value.includes('-') && start === 0) e.preventDefault();
                      }}
                      onPaste={(e) => {
                        const paste = (e.clipboardData || (window as any).clipboardData).getData('text');
                        if (!/^(-?\d*)$/.test(paste)) e.preventDefault();
                      }}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockweb: e.target.value })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="Ej: -1 o 3"
                    />
                  </div>

                  {/* ML */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Sumar a <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">ML</span>
                    </label>
                    <div className="text-xs text-neutral-500 mb-1">
                      Actual: <strong>{editingProduct?._originalstockml ?? 0}</strong>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingProduct?.stockml ?? ''}
                      onBeforeInput={(e) => {
                        const el = e.currentTarget;
                        const start = el.selectionStart ?? el.value.length;
                        const end = el.selectionEnd ?? el.value.length;
                        const data = (e as any).data ?? '';
                        const proposed = el.value.slice(0, start) + data + el.value.slice(end);
                        if (!/^(-?\d*)$/.test(proposed)) e.preventDefault();
                        if (data === '-' && start !== 0) e.preventDefault();
                        if (data?.includes('-') && el.value.includes('-') && start === 0) e.preventDefault();
                      }}
                      onPaste={(e) => {
                        const paste = (e.clipboardData || (window as any).clipboardData).getData('text');
                        if (!/^(-?\d*)$/.test(paste)) e.preventDefault();
                      }}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockml: e.target.value })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="Ej: -3 o 2"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Crear producto */}
                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editingProduct?.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Precio</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editingProduct?.price ?? ''}
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
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                {/* Dropdowns normalizados */}
                <div className="grid grid-cols-2 gap-3">
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

                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Variante</label>
                    <select
                      value={editingProduct?.variante_id ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, variante_id: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">Seleccionar variante</option>
                      {vars.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Color</label>
                    <select
                      value={editingProduct?.color_id ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, color_id: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">Seleccionar color</option>
                      {cols.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Talla</label>
                    <select
                      value={editingProduct?.talla_id ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, talla_id: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full border rounded px-3 py-2"
                      disabled={!editingProduct?.categoria_id}
                    >
                      <option value="">{editingProduct?.categoria_id ? 'Seleccionar talla' : 'Selecciona categoría primero'}</option>
                      {tallaOptions.map(t => (<option key={t.id} value={t.id}>{t.etiqueta}</option>))}
                    </select>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      {selectedCatName.toLowerCase() === 'pantalones'
                        ? 'Mostrando tallas numéricas'
                        : 'Mostrando tallas alfanuméricas'}
                    </p>
                  </div>
                </div>

                {/* Stocks iniciales */}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Stock inicial <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 text-[10px]">B2B</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingProduct?.stockb2b ?? ''}
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
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockb2b: e.target.value })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Stock inicial <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px]">Web</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingProduct?.stockweb ?? ''}
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
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockweb: e.target.value })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Stock inicial <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">ML</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingProduct?.stockml ?? ''}
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
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockml: e.target.value })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="0"
                    />
                  </div>
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
