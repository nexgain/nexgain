// NexGain Retail: the FREE AI Assistant on the phone. Turns the shop's stock,
// sales, suppliers and orders (already loaded in the app) into the shape the
// retail lookups use, and plugs the stock and sales answers into the chat
// (supabase/functions/_shared/ai/retail-answer.ts). Nothing is sent to an AI
// company and nothing costs money.
import { useEffect } from 'react';

import { setExtraAnswers } from '@/data/ai-chat';
import { businessStore } from '@/data/business';
import { businessUsesGst } from '@/data/super-rules';
import { ordersStore, onOrder } from '@/systems/retail/data/orders';
import { categoriesStore, storesStore, type ProductCategory, type StoreLocation } from '@/systems/retail/data/retail';
import { salesStore, type Sale } from '@/systems/retail/data/sales';
import { movementsStore, productsStore, stockLevelsStore, suppliersStore, type Movement, type Product, type StockLevels, type Supplier } from '@/systems/retail/data/stock';

import { answerRetailQuestion, retailNotUnderstood } from '../../../../supabase/functions/_shared/ai/retail-answer';
import type { RetailData } from '../../../../supabase/functions/_shared/ai/retail-insights';

export type RetailParts = {
  products: Product[];
  levels: StockLevels;
  sales: Sale[];
  movements: Movement[];
  suppliers: Supplier[];
  categories: ProductCategory[];
  stores: StoreLocation[];
  onOrder: Map<string, number>;
  usesGst: boolean;
  timeZone: string;
};

/** The shop's data in the shape the retail lookups use. */
export function toRetailData(x: RetailParts): RetailData {
  const categoryName = new Map(x.categories.map((c) => [c.id, c.name]));
  const storeName = new Map(x.stores.map((s) => [s.id, s.name]));
  const stock: Record<string, number> = {};
  const storeStock: Record<string, Record<string, number>> = {};
  for (const [variantId, byStore] of x.levels) {
    for (const [key, q] of byStore) {
      stock[variantId] = (stock[variantId] ?? 0) + q;
      if (x.stores.length > 1) {
        const where = key ? (storeName.get(key) ?? 'Old store') : 'No store';
        storeStock[variantId] = { ...(storeStock[variantId] ?? {}), [where]: q };
      }
    }
  }
  return {
    products: x.products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      brand: p.brand,
      category: p.categoryId ? (categoryName.get(p.categoryId) ?? '') : '',
      supplierId: p.supplierId,
      costPrice: p.costPrice,
      sellPrice: p.sellPrice,
      gstIncluded: p.gstIncluded,
      lowStockLevel: p.lowStockLevel,
      createdAt: p.createdAt,
      archived: p.archived,
      variants: p.variants.map((v) => ({ id: v.id, size: v.size, colour: v.colour, sku: v.sku, barcode: v.barcode })),
    })),
    stock,
    storeStock,
    sales: x.sales.map((s) => ({ variantId: s.variantId, productId: s.productId, itemName: s.itemName, quantity: s.quantity, total: s.total, soldAt: s.soldAt, soldBy: s.soldBy })),
    changes: x.movements
      .filter((m) => m.kind === 'sold' || m.kind === 'received' || m.kind === 'stocktake')
      .map((m) => ({ variantId: m.variantId, kind: m.kind, change: m.change, quantityAfter: m.quantityAfter, unitCost: m.unitCost, createdAt: m.createdAt })),
    suppliers: x.suppliers.map((s) => ({ id: s.id, name: s.name, leadTimeDays: s.leadTimeDays })),
    onOrder: Object.fromEntries(x.onOrder),
    usesGst: x.usesGst,
    timeZone: x.timeZone,
  };
}

/** The data as it is in the app right now. */
function appRetailData(): RetailData {
  const business = businessStore.get();
  return toRetailData({
    products: productsStore.get(),
    levels: stockLevelsStore.get(),
    sales: salesStore.get(),
    movements: movementsStore.get(),
    suppliers: suppliersStore.get(),
    categories: categoriesStore.get(),
    stores: storesStore.get(),
    onOrder: onOrder(ordersStore.get()),
    usesGst: businessUsesGst(business),
    timeZone: business?.timezone || 'Australia/Brisbane',
  });
}

/** Turns on the free stock and sales answers while the retail owner screens are open. */
export function useRetailAnswers() {
  useEffect(() => {
    setExtraAnswers({ first: (q, now) => answerRetailQuestion(appRetailData(), q, now), notUnderstood: retailNotUnderstood });
    return () => setExtraAnswers(null);
  }, []);
}
