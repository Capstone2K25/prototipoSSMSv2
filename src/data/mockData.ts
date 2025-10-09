export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  stockMadre: number;
  stockWeb: number;
  stockML: number;
  price: number;
  category: string;
  rotation: number;
}

export interface B2BOrderItem {
  productId: string;
  productName: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface B2BOrder {
  id: string;
  clientName: string;
  clientRUT: string;
  status: 'draft' | 'pending' | 'confirmed' | 'completed';
  items: B2BOrderItem[];
  subtotal: number;
  date: string;
  notes?: string;
}

export interface Alert {
  id: string;
  type: 'low-stock' | 'error' | 'sync' | 'info' | 'b2b';
  message: string;
  date: string;
  channel?: string;
  read: boolean;
}

export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Hoodie OldTree Classic Black',
    sku: 'OT-HD-001',
    description: 'Hoodie negro con logo bordado, algodón premium 100%',
    stockMadre: 45,
    stockWeb: 12,
    stockML: 8,
    price: 42990,
    category: 'Hoodies',
    rotation: 87
  },
  {
    id: '2',
    name: 'Camiseta Oversized Moss Green',
    sku: 'OT-TS-002',
    description: 'Camiseta oversize verde musgo, corte amplio, 100% algodón',
    stockMadre: 89,
    stockWeb: 25,
    stockML: 15,
    price: 24990,
    category: 'Camisetas',
    rotation: 95
  },
  {
    id: '3',
    name: 'Jogger Cargo Street Black',
    sku: 'OT-JG-003',
    description: 'Jogger tipo cargo negro, múltiples bolsillos, ajuste cómodo',
    stockMadre: 34,
    stockWeb: 8,
    stockML: 5,
    price: 38990,
    category: 'Pantalones',
    rotation: 72
  },
  {
    id: '4',
    name: 'Gorro Beanie OldTree Logo',
    sku: 'OT-AC-004',
    description: 'Beanie tejido con logo bordado, talla única',
    stockMadre: 120,
    stockWeb: 30,
    stockML: 20,
    price: 12990,
    category: 'Accesorios',
    rotation: 65
  },
  {
    id: '5',
    name: 'Chaqueta Bomber Olive',
    sku: 'OT-JK-005',
    description: 'Chaqueta bomber verde oliva, forro interior, cierre frontal',
    stockMadre: 18,
    stockWeb: 4,
    stockML: 2,
    price: 54990,
    category: 'Chaquetas',
    rotation: 56
  },
  {
    id: '6',
    name: 'Polera Logo Vintage White',
    sku: 'OT-TS-006',
    description: 'Polera blanca con logo vintage, corte regular',
    stockMadre: 67,
    stockWeb: 18,
    stockML: 12,
    price: 19990,
    category: 'Camisetas',
    rotation: 81
  },
  {
    id: '7',
    name: 'Short Cargo Sand',
    sku: 'OT-SH-007',
    description: 'Short cargo color arena, estilo street, múltiples bolsillos',
    stockMadre: 5,
    stockWeb: 1,
    stockML: 0,
    price: 28990,
    category: 'Shorts',
    rotation: 44
  },
  {
    id: '8',
    name: 'Buzo Crewneck Forest',
    sku: 'OT-SW-008',
    description: 'Buzo cuello redondo verde bosque, algodón grueso',
    stockMadre: 52,
    stockWeb: 14,
    stockML: 9,
    price: 36990,
    category: 'Buzos',
    rotation: 78
  }
];

export const mockB2BOrders: B2BOrder[] = [
  {
    id: 'B2B-001',
    clientName: 'Boutique Urban Style',
    clientRUT: '76.123.456-7',
    status: 'confirmed',
    items: [
      {
        productId: '2',
        productName: 'Camiseta Oversized Moss Green',
        sku: 'OT-TS-002',
        description: 'Camiseta oversize verde musgo, corte amplio',
        quantity: 20,
        unitPrice: 24990,
        total: 499800
      },
      {
        productId: '4',
        productName: 'Gorro Beanie OldTree Logo',
        sku: 'OT-AC-004',
        description: 'Beanie tejido con logo bordado',
        quantity: 15,
        unitPrice: 12990,
        total: 194850
      }
    ],
    subtotal: 694650,
    date: '2025-10-03',
    notes: 'Entrega en local de Providencia'
  },
  {
    id: 'B2B-002',
    clientName: 'Streetwear Valparaíso',
    clientRUT: '77.987.654-3',
    status: 'pending',
    items: [
      {
        productId: '1',
        productName: 'Hoodie OldTree Classic Black',
        sku: 'OT-HD-001',
        description: 'Hoodie negro con logo bordado',
        quantity: 10,
        unitPrice: 42990,
        total: 429900
      },
      {
        productId: '3',
        productName: 'Jogger Cargo Street Black',
        sku: 'OT-JG-003',
        description: 'Jogger tipo cargo negro, múltiples bolsillos',
        quantity: 8,
        unitPrice: 38990,
        total: 311920
      }
    ],
    subtotal: 741820,
    date: '2025-10-04',
    notes: 'Cliente solicita factura electrónica'
  },
  {
    id: 'B2B-003',
    clientName: 'Fashion Store Concepción',
    clientRUT: '76.555.888-2',
    status: 'completed',
    items: [
      {
        productId: '6',
        productName: 'Polera Logo Vintage White',
        sku: 'OT-TS-006',
        description: 'Polera blanca con logo vintage',
        quantity: 25,
        unitPrice: 19990,
        total: 499750
      }
    ],
    subtotal: 499750,
    date: '2025-09-28',
    notes: 'Orden completada y stock descontado'
  }
];

export const mockAlerts: Alert[] = [
  {
    id: 'ALT-001',
    type: 'low-stock',
    message: 'Stock crítico: Short Cargo Sand (SKU: OT-SH-007) - Solo 5 unidades en Stock Madre',
    date: '2025-10-05 09:15',
    read: false
  },
  {
    id: 'ALT-002',
    type: 'sync',
    message: 'Sincronización exitosa con Mercado Libre - 127 productos actualizados',
    date: '2025-10-05 08:30',
    channel: 'Mercado Libre',
    read: false
  },
  {
    id: 'ALT-003',
    type: 'low-stock',
    message: 'Stock bajo: Chaqueta Bomber Olive (SKU: OT-JK-005) - 18 unidades restantes',
    date: '2025-10-04 16:45',
    read: true
  },
  {
    id: 'ALT-004',
    type: 'error',
    message: 'Error de conexión con WordPress - Reintentando automáticamente',
    date: '2025-10-04 14:20',
    channel: 'WordPress',
    read: true
  },
  {
    id: 'ALT-005',
    type: 'b2b',
    message: 'Nueva orden B2B recibida: B2B-002 - Streetwear Valparaíso por $741.820',
    date: '2025-10-04 11:00',
    channel: 'B2B',
    read: true
  }
];

export const getTopRotationProducts = () => {
  return mockProducts
    .sort((a, b) => b.rotation - a.rotation)
    .slice(0, 5);
};

export const getTotalStockByChannel = () => {
  return {
    madre: mockProducts.reduce((sum, p) => sum + p.stockMadre, 0),
    web: mockProducts.reduce((sum, p) => sum + p.stockWeb, 0),
    ml: mockProducts.reduce((sum, p) => sum + p.stockML, 0)
  };
};

export const getUnreadAlertsCount = () => {
  return mockAlerts.filter(a => !a.read).length;
};

export const getLowStockProducts = () => {
  return mockProducts.filter(p => p.stockMadre < 20);
};
