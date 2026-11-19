// NexGain Retail: the stock "watchdog" in the app. The maths lives in
// supabase/functions/_shared/ai/retail-stock.ts, shared with the AI Assistant
// and the daily health check so they always agree; this file fits it to the
// app's stock levels (per store).
//   - how fast each size / colour sells, days of stock left,
//   - when it's time to reorder and how many (allowing for the supplier's
//     delivery time and stock already on order),
//   - best sellers and slow-moving stock.
import type { Movement, Product, StockLevels, Supplier } from '@/systems/retail/data/stock';
import { variantStock } from '@/systems/retail/data/stock';

import { reorderAdviceFor, slowSellersFor } from '../../../../supabase/functions/_shared/ai/retail-stock';

export {
  bestSellers,
  COVER_DAYS,
  reorderBySupplier,
  SALES_WINDOW_DAYS,
  salesValue,
  SLOW_DAYS,
  unitsSold,
  type ProductSales,
  type SlowStock,
  type SupplierReorder,
  type VariantAdvice,
} from '../../../../supabase/functions/_shared/ai/retail-stock';

/** The advice for every size / colour of every product on the stock list. */
export function reorderAdvice(products: Product[], levels: StockLevels, movements: Movement[], suppliers: Supplier[], onOrder: Map<string, number>, now = new Date()) {
  return reorderAdviceFor(products, (id) => variantStock(levels, id), movements, suppliers, onOrder, now);
}

/** Slow-moving stock: no sales for 60 days (and in the shop at least that long), most money tied up first. */
export function slowSellers(products: Product[], levels: StockLevels, movements: Movement[], now = new Date()) {
  return slowSellersFor(products, (id) => variantStock(levels, id), movements, now);
}
