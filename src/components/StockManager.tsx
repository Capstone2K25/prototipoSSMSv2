import { useEffect, useRef, useState, startTransition } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { emitAlert } from '../state/alertsBus';

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number;
  categoria?: string | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
};

type SortField = 'name' | 'sku' | 'categoria' | 'price' | 'stockb2b' | 'stockweb' | 'stockml';
type SortOrder = 'asc' | 'desc';

export const StockManager = () => {
  const CATEGORIES = ['Ropa','Pantalones','Shorts','Poleras','Polerones','Gorros','Accesorios','Chaquetas','Poleras manga larga'];

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isExistingSKU, setIsExistingSKU] = useState<boolean>(false);

  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const abortRef = useRef<AbortController | null>(null);

  const toastAndLog = (msg: string, type: 'info' | 'error' | 'sync' = 'info') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'sync') toast.success(msg);
    else toast(msg, { icon: 'ℹ️' });
    emitAlert({ type, message: msg, channel: 'stock' });
  };

  const fetchProducts = async (
    field: SortField = sortField,
    order: SortOrder = sortOrder,
    opts: { silent?: boolean } = {}
  ) => {
    const { silent = false } = opts;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!silent) setLoading(true);
      if (silent) setSorting(true);

      const { data, error } = await supabase
        .from('productos')
        .select('id, name, sku, price, categoria, stockb2b, stockweb, stockml')
        .order(field, { ascending: order === 'asc' });

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
        setLastUpdate(new Date().toLocaleTimeString());
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Error al obtener productos:', err);
      toastAndLog('No se pudieron cargar productos.', 'error');
    } finally {
      if (!silent) setLoading(false);
      if (silent) setSorting(false);
    }
  };

  useEffect(() => {
    fetchProducts(sortField, sortOrder, { silent: false });
    const interval = setInterval(() => fetchProducts(sortField, sortOrder, { silent: true }), 100000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSort = (field: SortField) => {
    const nextOrder: SortOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(nextOrder);
    void fetchProducts(field, nextOrder, { silent: true });
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' ||
      (product.categoria || '').toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);

  const getStockStatus = (stock: number) => {
    if (stock < 10) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Crítico' };
    if (stock < 20) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Bajo' };
    return { color: 'text-green-700', bg: 'bg-green-50', label: 'Normal' };
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) setSelectedIds([]);
    else setSelectedIds(filteredProducts.map((p) => p.id));
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return toast.error('No hay productos seleccionados.');
    if (!confirm(`¿Eliminar ${selectedIds.length} producto(s)?`)) return;

    const selectedProducts = products.filter((p) => selectedIds.includes(p.id));
    const { error } = await supabase.from('productos').delete().in('id', selectedIds);
    if (error) {
      console.error(error);
      toastAndLog(error.message || 'Error al eliminar productos.', 'error');
    } else {
      selectedProducts.forEach((p) =>
        emitAlert({ type: 'error', message: `Producto eliminado: ${p.name} (SKU ${p.sku})`, channel: 'stock' })
      );
      toast.success('Productos eliminados correctamente.');
      setSelectedIds([]);
      fetchProducts(sortField, sortOrder, { silent: true });
    }
  };

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
        setIsExistingSKU(true);
        setEditingProduct({
          id: Number(data.id),
          name: data.name,
          sku: data.sku,
          price: Number(data.price) || 0,
          categoria: data.categoria ?? '',
          _originalstockb2b: Number(data.stockb2b) || 0,
          _originalstockweb: Number(data.stockweb) || 0,
          _originalstockml: Number(data.stockml) || 0,
          stockb2b: 0,
          stockweb: 0,
          stockml: 0,
        });
        toastAndLog(`SKU encontrado: ${data.name} (SKU ${data.sku}) — solo suma de stock habilitada`, 'info');
      } else {
        setIsExistingSKU(false);
        setEditingProduct((prev: any) => ({ ...prev, stockb2b: 0, stockweb: 0, stockml: 0 }));
        toastAndLog(`SKU no encontrado: ${sku} — completa los datos para crear nuevo producto`, 'info');
      }
    } catch (err) {
      console.error('Error buscando SKU:', err);
      toastAndLog('Error al buscar SKU.', 'error');
    }
  };

  const saveProduct = async () => {
    if (!editingProduct?.sku) return toast.error('El SKU es obligatorio.');

    try {
      if (isExistingSKU) {
        const origB2B = Number(editingProduct._originalstockb2b || 0);
        const origWeb = Number(editingProduct._originalstockweb || 0);
        const origMl = Number(editingProduct._originalstockml || 0);

        const deltaB2B = Number(editingProduct.stockb2b || 0);
        const deltaWeb = Number(editingProduct.stockweb || 0);
        const deltaMl = Number(editingProduct.stockml || 0);

        if (deltaB2B === 0 && deltaWeb === 0 && deltaMl === 0) {
          return toast.error('No ingresaste ningún cambio de stock.');
        }

        const nuevos = {
          stockb2b: origB2B + deltaB2B,
          stockweb: origWeb + deltaWeb,
          stockml: origMl + deltaMl,
        };

        if (nuevos.stockb2b < 0 || nuevos.stockweb < 0 || nuevos.stockml < 0) {
          return toast.error('El stock no puede quedar negativo.');
        }

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

        const name = editingProduct?.name || data.name || '(sin nombre)';
        const sku = editingProduct?.sku || data.sku;
        const totalAntes = origB2B + origWeb + origMl;
        const totalDespues = nuevos.stockb2b + nuevos.stockweb + nuevos.stockml;

        toastAndLog(
          `Stock actualizado: ${name} (SKU ${sku}) • B2B ${origB2B}→${nuevos.stockb2b} | Web ${origWeb}→${nuevos.stockweb} | ML ${origMl}→${nuevos.stockml} • Total ${totalAntes}→${totalDespues}`,
          'sync'
        );
      } else {
        const name = (editingProduct.name || '').toString().trim();
        const price = Number(editingProduct.price || 0);
        const categoria = (editingProduct.categoria || '').toString().trim();

        if (!name || !editingProduct.sku || !categoria || !price) {
          return toast.error('Completa nombre, SKU, precio y categoría.');
        }

        const newProd = {
          name,
          sku: editingProduct.sku.toString().trim(),
          price,
          categoria,
          stockb2b: Number(editingProduct.stockb2b || 0),
          stockweb: Number(editingProduct.stockweb || 0),
          stockml: Number(editingProduct.stockml || 0),
        };

        const { error } = await supabase.from('productos').insert(newProd);
        if (error) {
          console.error('Error al crear producto:', error);
          return toastAndLog(error.message || 'Error al crear producto.', 'error');
        }

        const total = newProd.stockb2b + newProd.stockweb + newProd.stockml;
        toastAndLog(`Producto creado: ${newProd.name} (SKU ${newProd.sku}) • B2B ${newProd.stockb2b} | Web ${newProd.stockweb} | ML ${newProd.stockml} • Total ${total}`, 'sync');
      }
    } catch (err) {
      console.error('Error en saveProduct:', err);
      toastAndLog('Error en la operación.', 'error');
    } finally {
      setShowModal(false);
      setEditingProduct(null);
      setIsExistingSKU(false);
      fetchProducts(sortField, sortOrder, { silent: true });
    }
  };

  const openAddModal = () => {
    setEditingProduct({ sku: '', stockb2b: 0, stockweb: 0, stockml: 0, categoria: '' });
    setIsExistingSKU(false);
    setShowModal(true);
  };
  const openEditModal = (p: Product) => {
    setEditingProduct({
      ...p,
      _originalstockb2b: Number(p.stockb2b || 0),
      _originalstockweb: Number(p.stockweb || 0),
      _originalstockml: Number(p.stockml || 0),
      stockb2b: 0,
      stockweb: 0,
      stockml: 0,
    });
    setIsExistingSKU(true);
    setShowModal(true);
  };

  if (loading) return <div className="text-center py-12 text-neutral-500">Cargando datos...</div>;

  const stockTotal = (p: Product) => (p.stockb2b || 0) + (p.stockweb || 0) + (p.stockml || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Inventario</h2>
          <p className="text-sm text-neutral-600">
            Última sync: {lastUpdate} {sorting && <span className="ml-2 text-xs text-neutral-400">(ordenando…)</span>}
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
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border rounded px-3 py-2">
            <option value="all">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
                  checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
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
                <th key={key} className={`py-3 px-4 ${align} cursor-pointer select-none`} onClick={() => handleSort(key)}>
                  <div className="inline-flex items-center gap-1">
                    <span>{label}</span>
                    {sortField === key && <span className="text-neutral-500">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                    {sortField === key && sorting && <span className="text-neutral-400 text-xs ml-1">…</span>}
                  </div>
                </th>
              ))}

              <th className="py-3 px-4 text-center">Total</th>
              <th className="py-3 px-4 text-center">Editar</th>
            </tr>
          </thead>

          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className="border-b hover:bg-neutral-50">
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                </td>

                <td className="py-3 px-4">{p.name}</td>
                <td className="py-3 px-4"><code className="bg-neutral-100 px-2 py-1 rounded">{p.sku}</code></td>
                <td className="py-3 px-4 text-center">{p.categoria}</td>
                <td className="py-3 px-4 text-center">{formatPrice(p.price)}</td>

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

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-neutral-500">No se encontraron productos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg relative p-6">
            <button className="absolute top-3 right-3 text-neutral-500"
              onClick={() => { setShowModal(false); setEditingProduct(null); setIsExistingSKU(false); }}>
              <X size={18} />
            </button>

            <h3 className="text-lg font-semibold mb-3">{isExistingSKU ? 'Actualizar stock por SKU' : 'Agregar producto nuevo'}</h3>

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
                <div className="mb-2 text-sm text-neutral-600"><strong>Nombre:</strong> {editingProduct?.name}</div>
                <div className="mb-2 text-sm text-neutral-600"><strong>Precio:</strong> {formatPrice(Number(editingProduct?.price || 0))}</div>
                <div className="mb-2 text-sm text-neutral-600"><strong>Categoría:</strong> {editingProduct?.categoria || '—'}</div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Actual: {editingProduct?._originalstockb2b ?? 0}</div>
                    <input type="number" value={editingProduct?.stockb2b ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockb2b: Number(e.target.value) })}
                      className="w-full border rounded px-2 py-2" placeholder="Agregar B2B" />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Actual: {editingProduct?._originalstockweb ?? 0}</div>
                    <input type="number" value={editingProduct?.stockweb ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockweb: Number(e.target.value) })}
                      className="w-full border rounded px-2 py-2" placeholder="Agregar Web" />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Actual: {editingProduct?._originalstockml ?? 0}</div>
                    <input type="number" value={editingProduct?.stockml ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockml: Number(e.target.value) })}
                      className="w-full border rounded px-2 py-2" placeholder="Agregar ML" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Nombre</label>
                  <input type="text" value={editingProduct?.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full border rounded px-3 py-2" />
                </div>

                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Precio</label>
                  <input type="number" value={editingProduct?.price ?? ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                    className="w-full border rounded px-3 py-2" />
                </div>

                <div className="mb-3">
                  <label className="block text-sm text-neutral-600 mb-1">Categoría</label>
                  <select value={editingProduct?.categoria ?? ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, categoria: e.target.value })}
                    className="w-full border rounded px-3 py-2">
                    <option value="">Seleccionar categoría</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={editingProduct?.stockb2b ?? 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockb2b: Number(e.target.value) })}
                    className="w-full border rounded px-2 py-2" placeholder="Stock B2B" />
                  <input type="number" value={editingProduct?.stockweb ?? 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockweb: Number(e.target.value) })}
                    className="w-full border rounded px-2 py-2" placeholder="Stock Web" />
                  <input type="number" value={editingProduct?.stockml ?? 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockml: Number(e.target.value) })}
                    className="w-full border rounded px-2 py-2" placeholder="Stock ML" />
                </div>
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={saveProduct} className="bg-green-600 text-white px-4 py-2 rounded">
                {isExistingSKU ? 'Actualizar stock' : 'Guardar producto'}
              </button>
              <button onClick={() => { setShowModal(false); setEditingProduct(null); setIsExistingSKU(false); }} className="border px-4 py-2 rounded">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
