import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { Plus, Pencil, Trash2, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { emitAlert } from '../state/alertsBus';
import { wooCreateProductLocal, wooDeleteProductLocal, wooPushStockLocal } from '../data/woo';

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number | string;
  categoria?: string | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
};

type SortField = 'name' | 'sku' | 'categoria' | 'price' | 'stockb2b' | 'stockweb' | 'stockml';
type SortOrder = 'asc' | 'desc';

// ---------- Helpers numéricos ----------
const toInt = (s: unknown) => {
  const n = parseInt(String(s ?? '').replace(/\s+/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

export const StockManager = () => {
  // Categorías (puedes cargar de BD si quieres)
  const CATEGORIES = ['Ropa','Pantalones','Shorts','Poleras','Polerones','Gorros','Accesorios','Chaquetas','Poleras manga larga'];

  // Datos
  const [products, setProducts] = useState<Product[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);

  // Filtro / búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Orden
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Paginación
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Estados UI
  const [loading, setLoading] = useState(true);   // primera carga
  const [tableBusy, setTableBusy] = useState(false); // paginación/orden/búsqueda "silenciosa"
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isExistingSKU, setIsExistingSKU] = useState<boolean>(false);

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Abort para evitar carreras
  const abortRef = useRef<AbortController | null>(null);

  // Debounce búsqueda
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ---------- Toast + persistencia en alerts ----------
  const toastAndLog = (msg: string, type: 'info' | 'error' | 'sync' = 'info') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'sync') toast.success(msg);
    else toast(msg, { icon: 'ℹ️' });
    emitAlert({ type, message: msg, channel: 'stock' });
  };

  // ---------- Query a Supabase con filtros/orden/paginación ----------
  const fetchProducts = async (opts?: { silent?: boolean; keepSelection?: boolean }) => {
    const { silent = false, keepSelection = false } = opts || {};
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!silent && products.length === 0) setLoading(true);
      setTableBusy(true);

      // base select con conteo exacto
      let query = supabase
        .from('productos')
        .select('id, name, sku, price, categoria, stockb2b, stockweb, stockml', { count: 'exact' });

      // Filtro por categoría
      if (categoryFilter !== 'all') {
        query = query.eq('categoria', categoryFilter);
      }

      // Búsqueda por nombre o SKU
      if (debouncedSearch) {
        const term = debouncedSearch.replace(/%/g, '').toLowerCase();
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }

      // Orden
      query = query.order(sortField, { ascending: sortOrder === 'asc', nullsFirst: true });

      // Paginación (1-based page)
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const mapped: Product[] = (data || []).map((p: any) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        categoria: p.categoria ?? '',
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

  // Carga inicial
  useEffect(() => {
    fetchProducts();
    // Auto refresh (silencioso)
    const interval = setInterval(() => fetchProducts({ silent: true, keepSelection: true }), 100000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch cuando cambian filtros/orden/paginación
  useEffect(() => {
    setPage(1);
  }, [categoryFilter, debouncedSearch, pageSize]);

  useEffect(() => {
    fetchProducts({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField, sortOrder, page, pageSize, categoryFilter, debouncedSearch]);

  // ---------- Orden ----------
  const handleSort = (field: SortField) => {
    const nextOrder: SortOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(nextOrder);
  };

  // ---------- Filtrado local ----------
  const stockTotal = (p: Product) => (p.stockb2b || 0) + (p.stockweb || 0) + (p.stockml || 0);

  // ---------- Utilidades UI ----------
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);

  const getStockStatus = (stock: number) => {
    if (stock < 10) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Crítico' };
    if (stock < 20) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Bajo' };
    return { color: 'text-green-700', bg: 'bg-green-50', label: 'Normal' };
  };

  // ---------- Selección ----------
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

  // ---------- Eliminar seleccionados ----------
  const deleteSelected = async () => {
  if (selectedIds.length === 0) return toast.error('No hay productos seleccionados.');
  if (!confirm(`¿Eliminar ${selectedIds.length} producto(s) en BD y Woo?`)) return;

  // Productos seleccionados (para tener los SKUs)
  const selectedProducts = products.filter(p => selectedIds.includes(p.id));
  const skus = selectedProducts.map(p => String(p.sku));

  // 1) Borrado en Woo (best-effort, en paralelo)
  const results = await Promise.allSettled(
    skus.map(sku => wooDeleteProductLocal(sku))
  );

  const okWoo = results.filter(r => r.status === 'fulfilled').length;
  const failWoo = results.length - okWoo;

  if (failWoo > 0) {
    console.warn('Woo delete falló en', failWoo, 'elementos', results);
  }

  // 2) Borrado en Supabase
  const { error } = await supabase.from('productos').delete().in('id', selectedIds);
  if (error) {
    console.error(error);
    toastAndLog(error.message || 'Error al eliminar productos en BD.', 'error');
    return;
  }

  // Alertas + toasts
  selectedProducts.forEach(p =>
    emitAlert({ type: 'error', message: `Producto eliminado: ${p.name} (SKU ${p.sku})`, channel: 'stock' })
  );
  toast.success(`Eliminados ${selectedIds.length} en BD. Woo: ${okWoo} ok / ${failWoo} fallo(s).`);

  // 3) Ajuste de paginación y refresco
  const remaining = totalRows - selectedIds.length;
  const lastPage = Math.max(1, Math.ceil(remaining / pageSize));
  setSelectedIds([]);
  if (page > lastPage) setPage(lastPage);
  else fetchProducts({ silent: true });
};

  // ---------- Buscar SKU al salir del input ----------
  const handleSKUBlur = async () => {
    const sku = editingProduct?.sku?.toString()?.trim();
    if (!sku) return;

    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, name, sku, price, categoria, stockb2b, stockweb, stockml')
        .eq('sku', sku)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // SKU existente -> deltas como string (permiten "-")
        setIsExistingSKU(true);
        setEditingProduct({
          id: Number(data.id),
          name: data.name,
          sku: data.sku,
          price: Number(data.price) || 0,
          categoria: data.categoria ?? '',
          _originalstockb2b: Number(data.stockb2b) || 0,
          _originalstockweb: Number(data.stockweb) || 0,
          _originalstockml:  Number(data.stockml)  || 0,
          stockb2b: '',
          stockweb: '',
          stockml:  '',
        });
        toastAndLog(`SKU encontrado: ${data.name} (SKU ${data.sku}) — solo suma/resta de stock habilitada`, 'info');
      } else {
        setIsExistingSKU(false);
        setEditingProduct((prev: any) => ({
          ...prev,
          stockb2b: '',
          stockweb: '',
          stockml:  ''
        }));
        toastAndLog(`SKU no encontrado: ${sku} — completa los datos para crear nuevo producto`, 'info');
      }
    } catch (err) {
      console.error('Error buscando SKU:', err);
      toastAndLog('Error al buscar SKU.', 'error');
    }
  };

  // ---------- Guardar (insert/update) ----------
  const saveProduct = async () => {
  if (!editingProduct?.sku) return toast.error('El SKU es obligatorio.');

  try {
    if (isExistingSKU) {
      // -------- EDITAR: deltas (permiten negativos)
      const origB2B = Number(editingProduct._originalstockb2b || 0);
      const origWeb = Number(editingProduct._originalstockweb || 0);
      const origMl  = Number(editingProduct._originalstockml  || 0);

      const deltaB2B = toInt(editingProduct.stockb2b);
      const deltaWeb = toInt(editingProduct.stockweb);
      const deltaMl  = toInt(editingProduct.stockml);

      if (deltaB2B === 0 && deltaWeb === 0 && deltaMl === 0) {
        return toast.error('No ingresaste ningún cambio de stock.');
      }

      const nuevos = {
        stockb2b: origB2B + deltaB2B,
        stockweb: origWeb + deltaWeb,
        stockml:  origMl  + deltaMl,
      };

      if (nuevos.stockb2b < 0 || nuevos.stockweb < 0 || nuevos.stockml < 0) {
        return toast.error('El stock no puede quedar negativo.');
      }

      let res;
      if (editingProduct?.id) {
        res = await supabase
          .from('productos')
          .update(nuevos)
          .eq('id', Number(editingProduct.id))
          .select()
          .maybeSingle();
      } else {
        res = await supabase
          .from('productos')
          .update(nuevos)
          .eq('sku', editingProduct.sku.toString().trim())
          .select()
          .maybeSingle();
      }

      const { data, error } = res;
      if (error) {
        console.error('Error al actualizar stock:', error);
        return toastAndLog(error.message || 'Error al actualizar stock.', 'error');
      }
      if (!data) return toastAndLog('No se actualizó ninguna fila (SKU o ID no encontrado).', 'error');

      // 🔗 Empuja a Woo el stock absoluto del canal Web
      try {
        await wooPushStockLocal(String(editingProduct.sku), Number(nuevos.stockweb));
      } catch (e) {
        console.error("WC push error:", e);
        toastAndLog("Guardado en BD, pero falló la sync con Woo.", "error");
      }

      const name = editingProduct?.name || data.name || '(sin nombre)';
      const sku  = editingProduct?.sku  || data.sku;
      const totalAntes   = origB2B + origWeb + origMl;
      const totalDespues = nuevos.stockb2b + nuevos.stockweb + nuevos.stockml;

      toastAndLog(
        `Stock actualizado: ${name} (SKU ${sku}) • B2B ${origB2B}→${nuevos.stockb2b} | Web ${origWeb}→${nuevos.stockweb} | ML ${origMl}→${nuevos.stockml} • Total ${totalAntes}→${totalDespues}`,
        'sync'
      );

    } else {
      // -------- CREAR: stocks iniciales (solo no-negativos)
      const name = (editingProduct.name || '').toString().trim();
      const price = toInt(editingProduct.price);
      const categoria = (editingProduct.categoria || '').toString().trim();
      const sku = editingProduct.sku.toString().trim();

      if (!name || !sku || !categoria || !price) {
        return toast.error('Completa nombre, SKU, precio y categoría.');
      }

      const sB2B = Math.max(0, toInt(editingProduct.stockb2b));
      const sWeb = Math.max(0, toInt(editingProduct.stockweb));
      const sML  = Math.max(0, toInt(editingProduct.stockml));

      const newProd = { name, sku, price, categoria, stockb2b: sB2B, stockweb: sWeb, stockml: sML };

      // 1) Inserta en tu BD
      const { error } = await supabase.from('productos').insert(newProd);
      if (error) {
        console.error('Error al crear producto:', error);
        return toastAndLog(error.message || 'Error al crear producto.', 'error');
      }

      // 2) Crea/asegura en Woo + mapea wc_links + setea stock inicial
      try {
        const resWoo = await wooCreateProductLocal({
          skuLocal: sku,          // SKU local
          name,                   // nombre
          price,                  // precio
          initialStockWeb: sWeb,  // stock web inicial
          // skuWoo: "SKU-DISTINTO-EN-WOO" // opcional si Woo usa otro SKU
        });

        // 3) Consistencia: empuja 1 vez el stock Web a Woo
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


  // ---------- Abrir modales ----------
  const openAddModal = () => {
    setEditingProduct({ sku: '', name: '', price: '', categoria: '', stockb2b: '', stockweb: '', stockml: '' });
    setIsExistingSKU(false);
    setShowModal(true);
  };
  const openEditModal = (p: Product) => {
    setEditingProduct({
      ...p,
      _originalstockb2b: Number(p.stockb2b || 0),
      _originalstockweb: Number(p.stockweb || 0),
      _originalstockml:  Number(p.stockml  || 0),
      // deltas como string
      stockb2b: '',
      stockweb: '',
      stockml:  '',
    });
    setIsExistingSKU(true);
    setShowModal(true);
  };

  // ---------- Paginación helpers ----------
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
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="all">Todas las categorías</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <button onClick={openAddModal} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2">
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
                { label: 'Categoría', key: 'categoria' as SortField, align: 'text-center' },
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
                <td className="py-3 px-4 text-center">{p.categoria}</td>
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
                  <button onClick={() => openEditModal(p)} className="text-blue-600 hover:text-blue-800">
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {products.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-neutral-500">No se encontraron productos</td>
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
              {isExistingSKU ? 'Actualizar stock por SKU' : 'Agregar producto nuevo'}
            </h3>

            {/* SKU */}
            <div className="mb-3">
              <label className="block text-sm text-neutral-600 mb-1">SKU (obligatorio)</label>
              <input
                type="text"
                value={editingProduct?.sku || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                onBlur={handleSKUBlur}
                className="w-full border rounded px-3 py-2"
              />
            </div>

            {isExistingSKU ? (
              <>
                {/* Datos solo lectura */}
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Nombre:</strong> {editingProduct?.name}
                </div>
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Precio:</strong> {formatPrice(Number(editingProduct?.price || 0))}
                </div>
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Categoría:</strong> {editingProduct?.categoria || '—'}
                </div>

                {/* Deltas con "-" permitido */}
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
                      aria-label="Cantidad a sumar al stock B2B"
                      title="Cantidad a sumar al stock B2B (puede ser negativa para restar)"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">Usa valores positivos para sumar y negativos para restar.</p>
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
                      aria-label="Cantidad a sumar al stock Web"
                      title="Cantidad a sumar al stock Web (puede ser negativa para restar)"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">Suma o resta stock publicado en tu sitio.</p>
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
                      aria-label="Cantidad a sumar al stock ML"
                      title="Cantidad a sumar al stock ML (puede ser negativa para restar)"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">Stock en Mercado Libre.</p>
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

                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Categoría</label>
                  <select
                    value={editingProduct?.categoria ?? ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, categoria: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Seleccionar categoría</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Stocks iniciales no-negativos */}
                <div className="grid grid-cols-3 gap-3">
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
                      aria-label="Stock inicial B2B"
                      title="Stock inicial para canal B2B"
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
                      aria-label="Stock inicial Web"
                      title="Stock inicial para canal Web"
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
                      aria-label="Stock inicial ML"
                      title="Stock inicial para canal Mercado Libre"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={saveProduct} className="bg-green-600 text-white px-4 py-2 rounded">
                {isExistingSKU ? 'Actualizar stock' : 'Guardar producto'}
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
