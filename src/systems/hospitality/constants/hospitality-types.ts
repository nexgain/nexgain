// NexGain Hospitality (System 3): the food & drink business types shown in
// owner sign-up, and the starter menu layout each one gets. The starter menu
// is only the categories (sections); the owner renames, adds or deletes them
// in sign-up or later on the Menu page, and adds their own items and prices.
import type { SymbolViewProps } from 'expo-symbols';

type IconName = SymbolViewProps['name'];

export type HospitalityType = {
  id: string;
  name: string;
  icon: IconName;
  /** Starter menu categories, in menu order. */
  menu: string[];
  /** "Other food business": the owner types their own type. */
  other?: boolean;
};

export const HOSPITALITY_GROUP = 'Hospitality / Food & Drink';

export const HOSPITALITY_TYPES: HospitalityType[] = [
  {
    id: 'restaurant',
    name: 'Restaurant',
    icon: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
    menu: ['Entrées', 'Mains', 'Sides', 'Desserts', 'Kids', 'Drinks'],
  },
  {
    id: 'cafe',
    name: 'Cafe',
    icon: { ios: 'cup.and.saucer.fill', android: 'local_cafe', web: 'local_cafe' },
    menu: ['Coffee', 'Breakfast', 'Lunch', 'Cakes & Pastries', 'Cold Drinks'],
  },
  {
    id: 'bar',
    name: 'Bar / Pub',
    icon: { ios: 'wineglass.fill', android: 'local_bar', web: 'local_bar' },
    menu: ['Beer', 'Wine', 'Spirits', 'Cocktails', 'Bar Food'],
  },
  {
    id: 'bakery',
    name: 'Bakery',
    icon: { ios: 'birthday.cake.fill', android: 'bakery_dining', web: 'bakery_dining' },
    menu: ['Bread', 'Pastries', 'Pies', 'Cakes', 'Sandwiches', 'Drinks'],
  },
  {
    id: 'takeaway',
    name: 'Takeaway / Fast food',
    icon: { ios: 'takeoutbag.and.cup.and.straw.fill', android: 'fastfood', web: 'fastfood' },
    menu: ['Burgers', 'Chips & Sides', 'Wraps', 'Meal Deals', 'Drinks'],
  },
  {
    id: 'pizzeria',
    name: 'Pizzeria',
    icon: { ios: 'flame.fill', android: 'local_pizza', web: 'local_pizza' },
    menu: ['Pizzas', 'Pasta', 'Sides', 'Desserts', 'Drinks'],
  },
  {
    id: 'food-truck',
    name: 'Food truck / Coffee cart',
    icon: { ios: 'box.truck.fill', android: 'local_shipping', web: 'local_shipping' },
    menu: ['Coffee', 'Food', 'Snacks', 'Cold Drinks'],
  },
  {
    id: 'catering',
    name: 'Catering',
    icon: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
    menu: ['Platters', 'Finger Food', 'Mains', 'Desserts', 'Drinks'],
  },
  {
    id: 'dessert',
    name: 'Dessert / Gelato / Juice bar',
    icon: { ios: 'snowflake', android: 'icecream', web: 'icecream' },
    menu: ['Gelato', 'Desserts', 'Juices', 'Smoothies', 'Shakes'],
  },
  {
    id: 'other-food',
    name: 'Other food business',
    icon: { ios: 'takeoutbag.and.cup.and.straw', android: 'storefront', web: 'storefront' },
    menu: ['Food', 'Drinks', 'Specials'],
    other: true,
  },
];

export function findHospitalityType(id: string | null | undefined) {
  return HOSPITALITY_TYPES.find((t) => t.id === id) ?? null;
}

/** The starter categories, cleaned up: trimmed, no blanks, no repeats (ignoring case). */
export function cleanCategories(names: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().slice(0, 60);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
