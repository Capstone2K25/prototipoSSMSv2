import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number;
  categoria?: string | null;
  stockmadre: number;
  stockweb: number;
  stockml: number;
};

export const StockManager = () => {
  // Lista explícita de categorías (la que pediste)
  const CATEGORIES = [
    'Ropa',
    'Pantalones',
    'Shorts',
    'Poleras',
    'Polerones',
    'Gorros',
    'Accesorios',
    'Chaquetas',
    'Poleras manga larga',
  ];

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isExistingSKU, setIsExistingSKU] = useState<boolean>(false);

  // ---------- FETCH PRODUCTS ----------
  const fetchProducts = async () => {
    try {
      setLoading(true);

      // Traer productos sin join a otra tabla (usamos campo 'categoria' en productos)
      const { data: productosData, error: productosError } = await supabase
        .from('productos')
        .select('id, name, sku, price, categoria, stockmadre, stockweb, stockml')
        .order('id', { ascending: true });

      if (productosError) throw productosError;

      const mappedProducts: Product[] = (productosData || []).map((p: any) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        categoria: p.categoria ?? '',
        stockmadre: Number(p.stockmadre) || 0,
        stockweb: Number(p.stockweb) || 0,
        stockml: Number(p.stockml) || 0,
      }));

      setProducts(mappedProducts);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error al obtener productos:', err);
      toast.error('No se pudieron cargar productos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    const interval = setInterval(fetchProducts, 100000);
    return () => clearInterval(interval);
  }, []);

  // ---------- FILTRADO ----------
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' ||
      (product.categoria || '').toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  // ---------- FORMAT y STOCK STATUS ----------
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);

  const getStockStatus = (stock: number) => {
    if (stock < 10) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Crítico' };
    if (stock < 20) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Bajo' };
    return { color: 'text-green-700', bg: 'bg-green-50', label: 'Normal' };
  };

  // ---------- SELECCIONES ----------
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) setSelectedIds([]);
    else setSelectedIds(filteredProducts.map((p) => p.id));
  };

  // ---------- ELIMINAR SELECCIONADOS ----------
  const deleteSelected = async () => {
    if (selectedIds.length === 0) return toast.error('No hay productos seleccionados.');
    if (!confirm(`¿Eliminar ${selectedIds.length} producto(s)?`)) return;

    const { error } = await supabase.from('productos').delete().in('id', selectedIds);
    if (error) {
      console.error(error);
      toast.error(error.message || 'Error al eliminar productos.');
    } else {
      toast.success('Productos eliminados correctamente.');
      setSelectedIds([]);
      fetchProducts();
    }
  };

  // ---------- MANEJO SKU (onBlur) ----------
  const handleSKUBlur = async () => {
    const sku = editingProduct?.sku?.toString()?.trim();
    if (!sku) return;

    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, name, sku, price, categoria, stockmadre, stockweb, stockml')
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
          _originalstockmadre: Number(data.stockmadre) || 0,
          _originalstockweb: Number(data.stockweb) || 0,
          _originalstockml: Number(data.stockml) || 0,
          stockmadre: 0,
          stockweb: 0,
          stockml: 0,
        });
        toast('SKU encontrado — solo suma de stock habilitada', { icon: 'ℹ️' });
      } else {
        setIsExistingSKU(false);
        setEditingProduct((prev: any) => ({
          ...prev,
          stockmadre: 0,
          stockweb: 0,
          stockml: 0,
        }));
        toast('SKU no encontrado — completa los datos para crear nuevo producto', { icon: '⚡' });
      }
    } catch (err) {
      console.error('Error buscando SKU:', err);
      toast.error('Error al buscar SKU.');
    }
  };

  // ---------- GUARDAR (INSERT / UPDATE STOCK) ----------
 const saveProduct = async () => {
  if (!editingProduct?.sku) {
    return toast.error('El SKU es obligatorio.');
  }

  try {
    if (isExistingSKU) {
      // valores originales guardados al abrir modal
      const origMadre = Number(editingProduct._originalstockmadre || 0);
      const origWeb = Number(editingProduct._originalstockweb || 0);
      const origMl = Number(editingProduct._originalstockml || 0);

      // cantidades a modificar (pueden ser positivas o negativas)
      const deltaMadre = Number(editingProduct.stockmadre || 0);
      const deltaWeb = Number(editingProduct.stockweb || 0);
      const deltaMl = Number(editingProduct.stockml || 0);

      // si todo está en 0, nada que hacer
      if (deltaMadre === 0 && deltaWeb === 0 && deltaMl === 0) {
        return toast.error('No ingresaste ningún cambio de stock.');
      }

      // nuevos valores totales
      const nuevos = {
        stockmadre: origMadre + deltaMadre,
        stockweb: origWeb + deltaWeb,
        stockml: origMl + deltaMl,
      };

      // impedir negativos (opcional)
      if (nuevos.stockmadre < 0 || nuevos.stockweb < 0 || nuevos.stockml < 0) {
        return toast.error('El stock no puede quedar negativo.');
      }

      console.log('Actualizando producto (delta):', {
        id: editingProduct.id,
        sku: editingProduct.sku,
        cambios: { deltaMadre, deltaWeb, deltaMl },
        nuevos,
      });

      // actualizar por ID si existe, sino por SKU
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

      console.log('Resultado UPDATE:', res);

      const { data, error } = res;

      if (error) {
        console.error('Error al actualizar stock:', error);
        return toast.error(error.message || 'Error al actualizar stock.');
      }

      if (!data) {
        return toast.error('No se actualizó ninguna fila (SKU o ID no encontrado).');
      }

      toast.success('Stock actualizado correctamente.');
    } else {
      // Insertar nuevo producto
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
        stockmadre: Number(editingProduct.stockmadre || 0),
        stockweb: Number(editingProduct.stockweb || 0),
        stockml: Number(editingProduct.stockml || 0),
      };

      console.log('Insertando producto:', newProd);

      const { data, error } = await supabase.from('productos').insert(newProd).select().maybeSingle();

      if (error) {
        console.error('Error al crear producto:', error);
        return toast.error(error.message || 'Error al crear producto.');
      }

      toast.success('Producto agregado correctamente.');
    }
  } catch (err) {
    console.error('Error en saveProduct:', err);
    toast.error('Error en la operación.');
  } finally {
    setShowModal(false);
    setEditingProduct(null);
    setIsExistingSKU(false);
    fetchProducts();
  }
};



  // ---------- MODAL ABRIR ----------
  const openAddModal = () => {
    setEditingProduct({ sku: '', stockmadre: 0, stockweb: 0, stockml: 0, categoria: '' });
    setIsExistingSKU(false);
    setShowModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct({
      ...p,
      _originalstockmadre: Number(p.stockmadre || 0),
      _originalstockweb: Number(p.stockweb || 0),
      _originalstockml: Number(p.stockml || 0),
      stockmadre: 0,
      stockweb: 0,
      stockml: 0,
    });
    setIsExistingSKU(true);
    setShowModal(true);
  };

  if (loading) return <div className="text-center py-12 text-neutral-500">Cargando datos...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Inventario</h2>
          <p className="text-sm text-neutral-600">Última sync: {lastUpdate}</p>
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
              <option key={c} value={c}>
                {c}
              </option>
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
                  checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="py-3 px-4 text-left">Nombre</th>
              <th className="py-3 px-4 text-left">SKU</th>
              <th className="py-3 px-4 text-center">Categoría</th>
              <th className="py-3 px-4 text-center">Precio</th>
              <th className="py-3 px-4 text-center">Madre</th>
              <th className="py-3 px-4 text-center">Web</th>
              <th className="py-3 px-4 text-center">ML</th>
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
                <td className="py-3 px-4">
                  <code className="bg-neutral-100 px-2 py-1 rounded">{p.sku}</code>
                </td>
                <td className="py-3 px-4 text-center">{p.categoria}</td>
                <td className="py-3 px-4 text-center">{formatPrice(p.price)}</td>
                <td className="py-3 px-4 text-center">
                {(() => {
                  const status = getStockStatus(p.stockmadre ?? 0);
                  return (
                    <span className={`${status.color} font-semibold`}>
                      {p.stockmadre ?? 0} <span className="text-xs ml-1">({status.label})</span>
                    </span>
                  );
                })()}
              </td>

              <td className="py-3 px-4 text-center">
                {(() => {
                  const status = getStockStatus(p.stockweb ?? 0);
                  return (
                    <span className={`${status.color} font-semibold`}>
                      {p.stockweb ?? 0} <span className="text-xs ml-1">({status.label})</span>
                    </span>
                  );
                })()}
              </td>

              <td className="py-3 px-4 text-center">
                {(() => {
                  const status = getStockStatus(p.stockml ?? 0);
                  return (
                    <span className={`${status.color} font-semibold`}>
                      {p.stockml ?? 0} <span className="text-xs ml-1">({status.label})</span>
                    </span>
                  );
                })()}
              </td>

                <td className="py-3 px-4 text-center">
                  <button onClick={() => openEditModal(p)} className="text-blue-600 hover:text-blue-800">
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-neutral-500">
                  No se encontraron productos
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Nombre:</strong> {editingProduct?.name}
                </div>
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Precio:</strong> {formatPrice(Number(editingProduct?.price || 0))}
                </div>
                <div className="mb-2 text-sm text-neutral-600">
                  <strong>Categoría:</strong> {editingProduct?.categoria || '—'}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Actual: {editingProduct?._originalstockmadre ?? 0}</div>
                    <input
                      type="number"
                  
                      value={editingProduct?.stockmadre ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockmadre: Number(e.target.value) })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="Agregar a Madre"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Actual: {editingProduct?._originalstockweb ?? 0}</div>
                    <input
                      type="number"
                      
                      value={editingProduct?.stockweb ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockweb: Number(e.target.value) })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="Agregar a Web"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Actual: {editingProduct?._originalstockml ?? 0}</div>
                    <input
                      type="number"
                     
                      value={editingProduct?.stockml ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stockml: Number(e.target.value) })}
                      className="w-full border rounded px-2 py-2"
                      placeholder="Agregar a ML"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
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
                    type="number"
                    value={editingProduct?.price ?? ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
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
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    
                    value={editingProduct?.stockmadre ?? 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockmadre: Number(e.target.value) })}
                    className="w-full border rounded px-2 py-2"
                    placeholder="Stock Madre"
                  />
                  <input
                    type="number"
                  
                    value={editingProduct?.stockweb ?? 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockweb: Number(e.target.value) })}
                    className="w-full border rounded px-2 py-2"
                    placeholder="Stock Web"
                  />
                  <input
                    type="number"
                  
                    value={editingProduct?.stockml ?? 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockml: Number(e.target.value) })}
                    className="w-full border rounded px-2 py-2"
                    placeholder="Stock ML"
                  />
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
