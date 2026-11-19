// NexGain Retail: the AI stock watchdog (reorder advice, best and slow
// sellers), supplier orders (totals, what's on order, the email) and sales
// revenue. FAKE products, sales and suppliers only.
import { describe, expect, it, jest } from '@jest/globals';

import { onOrder, orderEmail, orderProblem, orderTotal, type PurchaseOrder } from '@/systems/retail/data/orders';
import { bestSellers, reorderAdvice, reorderBySupplier, salesValue, slowSellers, unitsSold } from '@/systems/retail/data/reorder';
import { retailRevenueEntries } from '@/systems/retail/data/retail-revenue';
import { salesAsMovements, salesByPerson, salesTotals, type Sale } from '@/systems/retail/data/sales';
import { findStaffBarcode, searchStaffProducts, staffStock, type StaffProduct } from '@/systems/retail/data/staff-catalogue';
import { isConnected, type Movement, type Product, type StockLevels, type Supplier } from '@/systems/retail/data/stock';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2030-06-30T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const hoodie: Product = {
  id: 'hoodie',
  name: 'Classic Hoodie',
  sku: 'HOOD-001',
  categoryId: null,
  brand: '',
  description: '',
  supplierId: 'apparel',
  costPrice: 20,
  sellPrice: 79,
  gstIncluded: true,
  lowStockLevel: 5,
  storeId: null,
  photos: [],
  archived: false,
  createdAt: daysAgo(200),
  variants: [
    { id: 'h-s', productId: 'hoodie', size: 'S', colour: '', sku: '', barcode: 'NX1', barcodeGenerated: true, sort: 0 },
    { id: 'h-m', productId: 'hoodie', size: 'M', colour: '', sku: '', barcode: 'NX2', barcodeGenerated: true, sort: 1 },
    { id: 'h-l', productId: 'hoodie', size: 'L', colour: '', sku: '', barcode: 'NX3', barcodeGenerated: true, sort: 2 },
  ],
};
const cap: Product = { ...hoodie, id: 'cap', name: 'Logo Cap', sku: 'CAP-001', supplierId: null, lowStockLevel: 2, variants: [{ ...hoodie.variants[0], id: 'cap-1', productId: 'cap', size: '', barcode: 'NX9' }] };
const apparel: Supplier = { id: 'apparel', name: 'Apparel Manufacturing Co.', contactName: 'Sam Lee', phone: '', email: 'orders@apparel.example', website: '', notes: '', leadTimeDays: 10 };

const levels: StockLevels = new Map([
  ['h-s', new Map([['', 3]])],
  ['h-m', new Map([['', 40]])],
  ['h-l', new Map([['', 30]])],
  ['cap-1', new Map([['', 20]])],
]);

let n = 0;
const move = (variantId: string, kind: Movement['kind'], change: number, days: number, unitPrice: number | null = 79): Movement => ({
  id: `m${n++}`,
  variantId,
  storeId: null,
  kind,
  change,
  quantityAfter: 0,
  unitPrice,
  unitCost: null,
  note: '',
  actorName: 'Jordan',
  createdAt: daysAgo(days),
});
// Medium sells 2 a day for 4 weeks (56); large sold 1 then had it returned; small not selling.
const movements: Movement[] = [
  ...Array.from({ length: 28 }, (_, i) => move('h-m', 'sold', -2, i + 0.5)),
  move('h-l', 'sold', -1, 3),
  move('h-l', 'returned', 1, 2),
  move('cap-1', 'sold', -1, 100, 25),
];

describe('sales', () => {
  it('counts units sold minus returns over the last 4 weeks', () => {
    const sold = unitsSold(movements, new Date(daysAgo(28)));
    expect(sold.get('h-m')).toBe(56);
    expect(sold.get('h-l')).toBe(0);
    expect(sold.get('cap-1')).toBeUndefined();
    expect(salesValue(movements, new Date(daysAgo(28)))).toBe(56 * 79);
  });

  it('turns sales into revenue (returns taken off)', () => {
    const sales: Sale[] = [
      { id: 's1', variantId: 'h-m', productId: 'hoodie', itemName: 'Classic Hoodie · M', quantity: 2, unitPrice: 79, total: 158, gst: 14.36, storeId: null, employeeId: 'e1', soldBy: 'Mia', soldAt: daysAgo(1) },
      { id: 's2', variantId: 'h-m', productId: 'hoodie', itemName: 'Classic Hoodie · M', quantity: -1, unitPrice: 79, total: -79, gst: -7.18, storeId: null, employeeId: null, soldBy: 'Jordan', soldAt: daysAgo(0.5) },
    ];
    const entries = retailRevenueEntries(sales);
    expect(entries.map((e) => e.amount)).toEqual([-79, 158]);
    expect(entries[0]).toMatchObject({ source: 'sale', category: 'Return', subtitle: 'Returned 1 · Jordan' });
    expect(entries[1]).toMatchObject({ category: 'Sale', title: 'Classic Hoodie · M', subtitle: '2 sold · Mia' });
  });

  it('adds up sales, GST, items and returns, and sales by person', () => {
    const sales: Sale[] = [
      { id: 'a', variantId: 'h-m', productId: 'hoodie', itemName: 'Hoodie', quantity: 2, unitPrice: 55, total: 110, gst: 10, storeId: null, employeeId: 'e1', soldBy: 'Mia', soldAt: daysAgo(2) },
      { id: 'b', variantId: 'h-s', productId: 'hoodie', itemName: 'Hoodie', quantity: 1, unitPrice: 55, total: 55, gst: 5, storeId: null, employeeId: null, soldBy: 'Jordan', soldAt: daysAgo(3) },
      { id: 'c', variantId: 'h-s', productId: 'hoodie', itemName: 'Hoodie', quantity: -1, unitPrice: 55, total: -55, gst: -5, storeId: null, employeeId: 'e1', soldBy: 'Mia', soldAt: daysAgo(1) },
      { id: 'd', variantId: 'h-s', productId: 'hoodie', itemName: 'Hoodie', quantity: 1, unitPrice: 55, total: 55, gst: 5, storeId: null, employeeId: null, soldBy: 'Jordan', soldAt: daysAgo(90) },
    ];
    const start = new Date(daysAgo(30));
    expect(salesTotals(sales, start, NOW)).toEqual({ total: 110, gst: 10, exGst: 100, items: 3, returned: 1 });
    expect(salesByPerson(sales, start, NOW)).toEqual([
      { name: 'Mia', total: 55, items: 1 },
      { name: 'Jordan', total: 55, items: 1 },
    ]);
    // The AI reads sales as stock history lines.
    const asMoves = salesAsMovements(sales);
    expect(asMoves.map((m) => [m.kind, m.change])).toEqual([
      ['sold', -2],
      ['sold', -1],
      ['returned', 1],
      ['sold', -1],
    ]);
    expect(unitsSold(asMoves, start).get('h-s')).toBe(0);
  });
});

describe('reorder advice', () => {
  const advice = reorderAdvice([hoodie, cap], levels, movements, [apparel], new Map(), NOW);
  const of = (id: string) => advice.find((a) => a.variantId === id)!;

  it('reorders what is at or below its reorder point', () => {
    expect(of('h-s')).toMatchObject({ needsReorder: true, stock: 3, perDay: 0, daysLeft: null });
    // Not selling: enough to sit at twice the reorder point.
    expect(of('h-s').recommended).toBe(10 - 3);
    expect(of('h-s').reason).toMatch(/reorder point/);
  });

  it('reorders what will run out before a delivery could arrive, enough for delivery time + 4 weeks', () => {
    // 2 a day, 40 left = 20 days; delivery takes 10 days + 7 spare = 17... 40/2 = 20 > 17, so not yet.
    expect(of('h-m').needsReorder).toBe(false);
    const fewer: StockLevels = new Map(levels).set('h-m', new Map([['', 30]]));
    const a = reorderAdvice([hoodie], fewer, movements, [apparel], new Map(), NOW).find((x) => x.variantId === 'h-m')!;
    expect(a).toMatchObject({ needsReorder: true, daysLeft: 15, leadTimeDays: 10 });
    // 2/day × (10 + 28) = 76, + reorder point 5 = 81, minus 30 in stock = 51.
    expect(a.recommended).toBe(51);
    expect(a.reason).toMatch(/runs out in about 15 days/);
  });

  it('counts stock already on order', () => {
    const a = reorderAdvice([hoodie], levels, movements, [apparel], new Map([['h-s', 10]]), NOW).find((x) => x.variantId === 'h-s')!;
    expect(a.needsReorder).toBe(false);
    expect(a.recommended).toBe(0);
  });

  it('leaves well-stocked items alone and groups the rest by supplier', () => {
    expect(of('h-l').needsReorder).toBe(false);
    expect(of('cap-1').needsReorder).toBe(false);
    expect(reorderBySupplier(advice, [hoodie, cap])).toEqual([{ supplierId: 'apparel', items: [of('h-s')] }]);
  });
});

describe('best and slow sellers', () => {
  it('ranks best sellers by units sold in 4 weeks', () => {
    expect(bestSellers([hoodie, cap], movements, NOW)).toEqual([{ productId: 'hoodie', units: 56 }]);
  });

  it('finds stock that hasn’t sold for 60 days (but not new stock)', () => {
    expect(slowSellers([hoodie, cap], levels, movements, NOW)).toEqual([{ productId: 'cap', stock: 20, value: 400, daysSinceSale: 100 }]);
    expect(slowSellers([{ ...cap, createdAt: daysAgo(10) }], levels, [], NOW)).toEqual([]);
  });
});

describe('supplier orders', () => {
  const order: PurchaseOrder = {
    id: 'o1',
    number: 'PO-0007',
    supplierId: 'apparel',
    status: 'sent',
    storeId: null,
    deliveryAddress: 'Warehouse – 12 Industry Rd, Brisbane',
    requestedDate: '2030-07-12',
    notes: 'Please include the invoice.',
    sentAt: null,
    deliveredAt: null,
    createdAt: daysAgo(1),
    lines: [
      { variantId: 'h-s', quantity: 20, unitCost: 20 },
      { variantId: 'h-m', quantity: 20, unitCost: 20 },
      { variantId: 'cap-1', quantity: 5, unitCost: null },
    ],
  };

  it('adds up the total and what’s on order', () => {
    expect(orderTotal(order.lines)).toBe(800);
    expect(onOrder([order]).get('h-s')).toBe(20);
    expect(onOrder([{ ...order, status: 'draft' }, { ...order, status: 'delivered' }]).size).toBe(0);
  });

  it('writes the email to the supplier', () => {
    const email = orderEmail(order, [hoodie, cap], apparel, 'Urban Threads');
    expect(email.to).toBe('orders@apparel.example');
    expect(email.subject).toBe('Order PO-0007 from Urban Threads');
    expect(email.body).toContain('Hi Sam,');
    expect(email.body).toContain('• Classic Hoodie – S (HOOD-001) × 20 @ $20.00');
    expect(email.body).toContain('• Logo Cap (CAP-001) × 5');
    expect(email.body).toContain('Order total: $800.00');
    expect(email.body).toContain('Deliver to: Warehouse – 12 Industry Rd, Brisbane');
    expect(email.body).toContain('Notes: Please include the invoice.');
    expect(email.body.trim().endsWith('Urban Threads')).toBe(true);
  });

  it('needs a supplier and items', () => {
    expect(orderProblem({ supplierId: null, lines: order.lines })).toMatch(/Choose who/);
    expect(orderProblem({ supplierId: 'apparel', lines: [] })).toMatch(/at least one/);
    expect(orderProblem({ supplierId: 'apparel', lines: order.lines })).toBeNull();
  });

  it('calls a supplier connected when they have an email', () => {
    expect(isConnected(apparel)).toBe(true);
    expect(isConnected({ email: '' })).toBe(false);
    expect(isConnected({ email: 'not an email' })).toBe(false);
  });
});

describe('staff Scanner', () => {
  const staff: StaffProduct[] = [
    {
      id: 'hoodie',
      name: 'Classic Hoodie',
      sku: 'HOOD-001',
      brand: '',
      category: 'Hoodies',
      sellPrice: 79,
      gstIncluded: true,
      lowStockLevel: 5,
      photo: null,
      variants: [
        { id: 'h-s', size: 'S', colour: '', sku: '', barcode: 'NX1', stock: { '': 3 } },
        { id: 'h-m', size: 'M', colour: '', sku: 'H-M', barcode: '9312345678901', stock: { 'store-a': 4, 'store-b': 6 } },
      ],
    },
  ];

  it('finds the exact size from a barcode or SKU', () => {
    expect(findStaffBarcode(staff, '9312345678901')?.variant.id).toBe('h-m');
    expect(findStaffBarcode(staff, 'h-m')?.variant.id).toBe('h-m');
    expect(findStaffBarcode(staff, 'HOOD-001')?.variant.id).toBe('h-s');
    expect(findStaffBarcode(staff, 'nope')).toBeNull();
  });

  it('adds up stock across stores and searches', () => {
    expect(staffStock(staff[0].variants[1])).toBe(10);
    expect(staffStock(staff[0].variants[1], 'store-a')).toBe(4);
    expect(searchStaffProducts(staff, 'hood')).toHaveLength(1);
    expect(searchStaffProducts(staff, 'jeans')).toHaveLength(0);
  });
});
