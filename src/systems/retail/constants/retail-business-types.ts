// =============================================================================
//  NexGain Retail (System 3) — business types and their preset product
//  categories. The ONE place to add or change retail business types. Sign-up,
//  the Stock section and the dashboards all read this.
// =============================================================================
//
//  Only shops and brands that sell physical products and track stock belong
//  here. Service businesses (System 1), booking businesses (System 2) and
//  restaurants / cafes (a future system) are never listed.
//
//  Each type has:
//    - categories: the preset product categories the owner starts with (they
//      can rename, add or delete them).
//    - variants: which sizes the Add Product screen suggests ('clothing' = XS
//      to XXL, 'shoes' = shoe sizes, 'none' = no sizes, e.g. a bookshop).
//
//  To add a type: add a block to RETAIL_TYPES. Its id must never change once
//  businesses use it (it's saved in retail_settings.business_type).
import type { SymbolViewProps } from 'expo-symbols';

type IconName = SymbolViewProps['name'];
export type VariantStyle = 'clothing' | 'shoes' | 'none';

export type RetailBusinessType = {
  id: string;
  name: string;
  /** A short example shown under the name. */
  hint: string;
  icon: IconName;
  categories: string[];
  variants: VariantStyle;
  /** "Other retail": the owner types their own kind of shop. */
  other?: boolean;
};

const icon = (ios: string, android: string): IconName => ({ ios, android, web: android }) as IconName;

export const RETAIL_TYPES: RetailBusinessType[] = [
  {
    id: 'clothing-brand',
    name: 'Clothing Brand',
    hint: 'Your own label, sold online or in stores',
    icon: icon('tshirt.fill', 'checkroom'),
    categories: ['T-Shirts', 'Hoodies', 'Shorts', 'Jackets', 'Pants', 'Hats', 'Accessories'],
    variants: 'clothing',
  },
  {
    id: 'clothing-boutique',
    name: 'Clothing Boutique',
    hint: 'A shop selling clothing from different brands',
    icon: icon('handbag.fill', 'shopping_bag'),
    categories: ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Knitwear', 'Shoes', 'Accessories'],
    variants: 'clothing',
  },
  {
    id: 'shoe-store',
    name: 'Shoe Store',
    hint: 'Sneakers, boots, heels and more',
    icon: icon('shoeprints.fill', 'steps'),
    categories: ['Sneakers', 'Boots', 'Heels', 'Flats', 'Sandals', 'Kids Shoes', 'Socks', 'Shoe Care'],
    variants: 'shoes',
  },
  {
    id: 'general-retail',
    name: 'General Retail Store',
    hint: 'A variety store, convenience store or general shop',
    icon: icon('cart.fill', 'shopping_cart'),
    categories: ['Household', 'Food & Drinks', 'Personal Care', 'Stationery', 'Electronics', 'Seasonal'],
    variants: 'none',
  },
  {
    id: 'pharmacy',
    name: 'Chemist / Pharmacy',
    hint: 'Medicines, vitamins and health products',
    icon: icon('cross.case.fill', 'local_pharmacy'),
    categories: ['Medicine', 'Vitamins', 'Skincare', 'Personal Care', 'Baby', 'First Aid', 'Beauty'],
    variants: 'none',
  },
  {
    id: 'beauty-cosmetics',
    name: 'Beauty & Cosmetics Store',
    hint: 'Makeup, skincare, haircare and fragrance',
    icon: icon('sparkles', 'auto_awesome'),
    categories: ['Makeup', 'Skincare', 'Haircare', 'Fragrance', 'Nails', 'Tools & Brushes', 'Gift Sets'],
    variants: 'none',
  },
  {
    id: 'gift-shop',
    name: 'Gift Shop',
    hint: 'Gifts, cards, candles and keepsakes',
    icon: icon('gift.fill', 'redeem'),
    categories: ['Cards & Wrapping', 'Candles', 'Homewares', 'Toys & Games', 'Jewellery', 'Stationery', 'Gift Sets'],
    variants: 'none',
  },
  {
    id: 'homewares',
    name: 'Homewares',
    hint: 'Kitchen, bedding, bath and decor',
    icon: icon('house.fill', 'chair'),
    categories: ['Kitchen & Dining', 'Bedding', 'Bath', 'Decor', 'Candles & Fragrance', 'Furniture', 'Outdoor'],
    variants: 'none',
  },
  {
    id: 'sporting-goods',
    name: 'Sporting Goods',
    hint: 'Sports gear, fitness equipment and activewear',
    icon: icon('sportscourt.fill', 'sports_tennis'),
    categories: ['Footwear', 'Apparel', 'Fitness Equipment', 'Team Sports', 'Outdoor & Camping', 'Cycling', 'Water Sports', 'Accessories'],
    variants: 'clothing',
  },
  {
    id: 'jewellery-accessories',
    name: 'Jewellery & Accessories',
    hint: 'Jewellery, watches, bags and sunglasses',
    icon: icon('crown.fill', 'diamond'),
    categories: ['Necklaces', 'Earrings', 'Rings', 'Bracelets', 'Watches', 'Bags', 'Sunglasses', 'Hair Accessories'],
    variants: 'none',
  },
  {
    id: 'bookshop',
    name: 'Bookshop',
    hint: 'New or second-hand books',
    icon: icon('books.vertical.fill', 'menu_book'),
    categories: ['Fiction', 'Non-Fiction', 'Kids & Young Adult', 'Cookbooks', 'Magazines', 'Stationery', 'Gifts'],
    variants: 'none',
  },
  {
    id: 'electronics',
    name: 'Electronics Store',
    hint: 'Phones, computers, audio and gaming',
    icon: icon('desktopcomputer', 'devices'),
    categories: ['Phones', 'Computers & Tablets', 'Audio', 'TV & Home Theatre', 'Gaming', 'Cables & Chargers', 'Accessories'],
    variants: 'none',
  },
  {
    id: 'toy-store',
    name: 'Toy Store',
    hint: 'Toys, games and puzzles',
    icon: icon('teddybear.fill', 'toys'),
    categories: ['Baby & Toddler', 'Games & Puzzles', 'Building & Construction', 'Dolls & Figures', 'Outdoor Toys', 'Arts & Crafts', 'Educational'],
    variants: 'none',
  },
  {
    id: 'own-product',
    name: 'I Sell My Own Product',
    hint: 'e.g. a hair gel, skincare or candle brand',
    icon: icon('shippingbox.fill', 'inventory_2'),
    categories: ['Products', 'Bundles & Sets', 'Accessories', 'Samples'],
    variants: 'none',
  },
  {
    id: 'other-retail',
    name: 'Other Retail',
    hint: 'Another kind of shop that sells products',
    icon: icon('ellipsis.circle.fill', 'more_horiz'),
    categories: ['Products', 'Accessories'],
    variants: 'none',
    other: true,
  },
];

export const findRetailType = (id: string | null | undefined) => RETAIL_TYPES.find((t) => t.id === id) ?? null;

/** Sizes the Add Product screen suggests for this kind of shop. */
export const PRESET_SIZES: Record<VariantStyle, string[]> = {
  clothing: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  shoes: ['5', '6', '7', '8', '9', '10', '11', '12', '13'],
  none: [],
};

export type CategoryDraft = { key: string; name: string };

/** The preset categories for a business type, ready to edit at sign-up. */
export function presetCategories(typeId: string | null): CategoryDraft[] {
  return (findRetailType(typeId)?.categories ?? []).map((name, i) => ({ key: `${typeId}:${i}`, name }));
}

/**
 * Cleans the owner's category list before saving: trims names, drops empty
 * ones and repeats (ignoring capitals), and keeps names to 60 characters.
 */
export function cleanCategories(list: { name: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    const name = c.name.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}
