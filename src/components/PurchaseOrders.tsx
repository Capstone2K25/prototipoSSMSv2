import { useState } from 'react';
import { FileText, Upload, Download, Plus, CheckCircle, Clock, Package as PackageIcon, Minus } from 'lucide-react';
import { mockB2BOrders, B2BOrder, mockProducts } from '../data/mockData';

export const PurchaseOrders = () => {
  const [orders, setOrders] = useState<B2BOrder[]>(mockB2BOrders);
  const [showLoadOrderModal, setShowLoadOrderModal] = useState(false);
  const [productStock, setProductStock] = useState(mockProducts);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusConfig = (status: B2BOrder['status']) => {
    const configs = {
      draft: {
        label: 'Borrador',
        color: 'text-neutral-700',
        bg: 'bg-neutral-100',
        icon: <FileText size={14} />
      },
      pending: {
        label: 'Pendiente',
        color: 'text-orange-700',
        bg: 'bg-orange-50',
        icon: <Clock size={14} />
      },
      confirmed: {
        label: 'Confirmada',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        icon: <CheckCircle size={14} />
      },
      completed: {
        label: 'Completada',
        color: 'text-green-700',
        bg: 'bg-green-50',
        icon: <PackageIcon size={14} />
      }
    };
    return configs[status];
  };

  const generateBlankOrder = () => {
    const orderTemplate = {
      id: `B2B-${String(orders.length + 1).padStart(3, '0')}`,
      clientName: '[Nombre del Cliente]',
      clientRUT: '[RUT]',
      status: 'draft' as const,
      items: productStock.map(product => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        description: product.description,
        quantity: 0,
        unitPrice: product.price,
        total: 0
      })),
      subtotal: 0,
      date: new Date().toISOString().split('T')[0],
      notes: ''
    };

    const csvContent = [
      ['ORDEN DE COMPRA B2B - OldTree'],
      ['ID Orden', orderTemplate.id],
      ['Fecha', orderTemplate.date],
      [''],
      ['Cliente:', orderTemplate.clientName],
      ['RUT:', orderTemplate.clientRUT],
      [''],
      ['SKU', 'Producto', 'Descripción', 'Precio Unit.', 'Cantidad', 'Total'],
      ...orderTemplate.items.map(item => [
        item.sku,
        item.productName,
        item.description,
        item.unitPrice,
        '',
        ''
      ]),
      [''],
      ['SUBTOTAL', '', '', '', '', ''],
      [''],
      ['Notas:']
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `OC_Blank_${orderTemplate.id}_${orderTemplate.date}.csv`;
    link.click();

    alert('✅ Orden en blanco generada exitosamente.\nEl cliente debe completar las cantidades y devolverla.');
  };

  const handleLoadOrder = () => {
    setShowLoadOrderModal(true);
  };

  const simulateLoadOrder = () => {
    const newOrder: B2BOrder = {
      id: `B2B-${String(orders.length + 1).padStart(3, '0')}`,
      clientName: 'Nueva Tienda Demo',
      clientRUT: '78.456.123-9',
      status: 'pending',
      items: [
        {
          productId: '1',
          productName: 'Hoodie OldTree Classic Black',
          sku: 'OT-HD-001',
          description: 'Hoodie negro con logo bordado',
          quantity: 5,
          unitPrice: 42990,
          total: 214950
        },
        {
          productId: '8',
          productName: 'Buzo Crewneck Forest',
          sku: 'OT-SW-008',
          description: 'Buzo cuello redondo verde bosque',
          quantity: 3,
          unitPrice: 36990,
          total: 110970
        }
      ],
      subtotal: 325920,
      date: new Date().toISOString().split('T')[0],
      notes: 'Orden simulada cargada desde Excel'
    };

    setOrders([...orders, newOrder]);
    setShowLoadOrderModal(false);
    alert('✅ Orden cargada exitosamente. Ahora puedes confirmarla y actualizar el stock.');
  };

  const confirmOrderAndUpdateStock = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const updatedStock = [...productStock];
    let lowStockWarnings: string[] = [];

    order.items.forEach(item => {
      const productIndex = updatedStock.findIndex(p => p.id === item.productId);
      if (productIndex !== -1) {
        const newStock = updatedStock[productIndex].stockMadre - item.quantity;
        updatedStock[productIndex] = {
          ...updatedStock[productIndex],
          stockMadre: Math.max(0, newStock)
        };

        if (newStock < 20) {
          lowStockWarnings.push(`${item.productName} (${item.sku}): ${newStock} unidades restantes`);
        }
      }
    });

    setProductStock(updatedStock);

    const updatedOrders = orders.map(o =>
      o.id === orderId ? { ...o, status: 'completed' as const } : o
    );
    setOrders(updatedOrders);

    let message = `✅ Orden ${orderId} confirmada y stock actualizado exitosamente.\n\n`;
    message += `Stock descontado:\n`;
    order.items.forEach(item => {
      message += `- ${item.quantity} x ${item.productName}\n`;
    });

    if (lowStockWarnings.length > 0) {
      message += `\n⚠️ ALERTAS DE STOCK BAJO:\n${lowStockWarnings.join('\n')}`;
    }

    alert(message);
  };

  const exportOrder = (order: B2BOrder) => {
    const csvContent = [
      ['ORDEN DE COMPRA B2B - OldTree'],
      ['ID Orden', order.id],
      ['Cliente', order.clientName],
      ['RUT', order.clientRUT],
      ['Fecha', order.date],
      ['Estado', getStatusConfig(order.status).label],
      [''],
      ['SKU', 'Producto', 'Descripción', 'Cantidad', 'Precio Unit.', 'Total'],
      ...order.items.map(item => [
        item.sku,
        item.productName,
        item.description,
        item.quantity,
        item.unitPrice,
        item.total
      ]),
      [''],
      ['SUBTOTAL', '', '', '', '', order.subtotal],
      [''],
      ['Notas:', order.notes || 'Sin notas']
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `OC_${order.id}_${order.date}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Canal B2B - Órdenes de Compra</h2>
            <p className="text-sm text-neutral-600">Gestión de ventas mayoristas a otras empresas</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={generateBlankOrder}
            className="flex items-center space-x-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <Plus size={18} />
            <span>Generar OC en Blanco</span>
          </button>
          <button
            onClick={handleLoadOrder}
            className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
          >
            <Upload size={18} />
            <span>Cargar OC del Cliente</span>
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">ℹ️ ¿Cómo funciona el Canal B2B?</h3>
        <ol className="text-sm text-blue-800 space-y-1 ml-4 list-decimal">
          <li>Generas una orden en blanco con todos los productos disponibles</li>
          <li>El cliente completa las cantidades que desea adquirir</li>
          <li>Cargas la orden completada en el sistema</li>
          <li>Confirmas la orden y el stock se descuenta automáticamente del Stock Madre</li>
        </ol>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">Total Órdenes</h3>
          <p className="text-3xl font-bold text-neutral-900">{orders.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">Pendientes</h3>
          <p className="text-3xl font-bold text-orange-600">
            {orders.filter(o => o.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">Confirmadas</h3>
          <p className="text-3xl font-bold text-blue-600">
            {orders.filter(o => o.status === 'confirmed').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">Monto Total</h3>
          <p className="text-2xl font-bold text-green-700">
            {formatPrice(orders.reduce((sum, o) => sum + o.subtotal, 0))}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {orders.map(order => {
          const statusConfig = getStatusConfig(order.status);
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-50 border-b border-neutral-200 p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <code className="text-lg font-bold bg-neutral-900 text-white px-3 py-1 rounded">
                        {order.id}
                      </code>
                      <span className={`${statusConfig.bg} ${statusConfig.color} px-3 py-1 rounded-full text-sm font-semibold flex items-center space-x-1`}>
                        {statusConfig.icon}
                        <span>{statusConfig.label}</span>
                      </span>
                    </div>
                    <div className="text-neutral-700">
                      <p className="font-semibold text-lg">{order.clientName}</p>
                      <p className="text-sm">RUT: {order.clientRUT}</p>
                      <p className="text-sm">Fecha: {formatDate(order.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-neutral-600 mb-1">Subtotal</p>
                    <p className="text-2xl font-bold text-green-700">{formatPrice(order.subtotal)}</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <h4 className="font-semibold text-neutral-900 mb-4">Productos en la orden:</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left py-2 px-3 text-sm font-semibold text-neutral-700">SKU</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-neutral-700">Producto</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-neutral-700">Descripción</th>
                        <th className="text-center py-2 px-3 text-sm font-semibold text-neutral-700">Cantidad</th>
                        <th className="text-center py-2 px-3 text-sm font-semibold text-neutral-700">Precio Unit.</th>
                        <th className="text-center py-2 px-3 text-sm font-semibold text-neutral-700">Total</th>
                        {order.status === 'completed' && (
                          <th className="text-center py-2 px-3 text-sm font-semibold text-neutral-700">Impacto Stock</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, index) => (
                        <tr key={index} className="border-b border-neutral-100">
                          <td className="py-3 px-3">
                            <code className="text-xs bg-neutral-100 px-2 py-1 rounded">{item.sku}</code>
                          </td>
                          <td className="py-3 px-3 font-semibold text-neutral-900">{item.productName}</td>
                          <td className="py-3 px-3 text-sm text-neutral-600">{item.description}</td>
                          <td className="py-3 px-3 text-center font-bold text-neutral-900">{item.quantity}</td>
                          <td className="py-3 px-3 text-center text-neutral-700">{formatPrice(item.unitPrice)}</td>
                          <td className="py-3 px-3 text-center font-bold text-green-700">{formatPrice(item.total)}</td>
                          {order.status === 'completed' && (
                            <td className="py-3 px-3 text-center">
                              <span className="text-red-600 font-semibold flex items-center justify-center space-x-1">
                                <Minus size={14} />
                                <span>{item.quantity}</span>
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {order.notes && (
                  <div className="mt-4 p-3 bg-neutral-50 rounded-lg">
                    <p className="text-sm font-semibold text-neutral-700">Notas:</p>
                    <p className="text-sm text-neutral-600">{order.notes}</p>
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 mt-6">
                  <button
                    onClick={() => exportOrder(order)}
                    className="flex items-center space-x-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
                  >
                    <Download size={16} />
                    <span>Exportar</span>
                  </button>
                  {(order.status === 'pending' || order.status === 'confirmed') && (
                    <button
                      onClick={() => confirmOrderAndUpdateStock(order.id)}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
                    >
                      <CheckCircle size={16} />
                      <span>Confirmar y Actualizar Stock</span>
                    </button>
                  )}
                  {order.status === 'completed' && (
                    <span className="text-green-700 font-semibold flex items-center space-x-2">
                      <CheckCircle size={16} />
                      <span>Stock actualizado</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showLoadOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Cargar Orden del Cliente</h3>
            <p className="text-neutral-600 mb-6">
              En producción, aquí podrías cargar un archivo Excel/CSV con las cantidades completadas por el cliente.
              Por ahora, simularemos la carga de una orden de ejemplo.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowLoadOrderModal(false)}
                className="px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={simulateLoadOrder}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
              >
                Simular Carga
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
