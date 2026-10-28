import { CATALOG } from '../public/catalog.js';

// Aisle order matches a typical store walk: produce first, frozen and household last.
export const AISLES = [
  'Produce',
  'Bakery',
  'Deli',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry',
  'Snacks',
  'Drinks',
  'Frozen',
  'Household',
  'Personal Care',
  'Baby & Pet',
  'Other',
];

// First match wins. Keys are lower-case fragments matched against the item name.
const KEYWORDS = [
  ['Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'berry', 'berries', 'strawberr', 'blueberr', 'melon', 'avocado', 'tomato', 'onion', 'garlic', 'potato', 'carrot', 'celery', 'lettuce', 'spinach', 'kale', 'salad', 'pepper', 'cucumber', 'zucchini', 'squash', 'broccoli', 'cauliflower', 'mushroom', 'cilantro', 'parsley', 'basil', 'herb', 'ginger', 'pear', 'peach', 'plum', 'mango', 'pineapple', 'corn', 'green bean', 'cabbage', 'sweet potato', 'jalape']],
  ['Bakery', ['bread', 'bagel', 'bun', 'roll', 'tortilla', 'pita', 'croissant', 'muffin', 'cake', 'pie', 'donut', 'baguette']],
  ['Deli', ['deli', 'lunch meat', 'sliced turkey', 'sliced ham', 'salami', 'prosciutto', 'hummus', 'rotisserie']],
  ['Meat & Seafood', ['chicken', 'beef', 'steak', 'ground', 'pork', 'bacon', 'sausage', 'turkey', 'lamb', 'fish', 'salmon', 'shrimp', 'tuna', 'cod', 'tilapia', 'crab', 'hot dog', 'brat']],
  ['Dairy & Eggs', ['milk', 'egg', 'cheese', 'butter', 'yogurt', 'cream', 'half and half', 'half & half', 'cottage', 'sour cream', 'creamer', 'oat milk', 'almond milk']],
  ['Frozen', ['frozen', 'ice cream', 'popsicle', 'pizza', 'waffle', 'fries', 'tater']],
  ['Drinks', ['water', 'soda', 'coke', 'pepsi', 'sprite', 'juice', 'coffee', 'tea', 'beer', 'wine', 'seltzer', 'sparkling', 'gatorade', 'lemonade', 'kombucha', 'energy drink']],
  ['Snacks', ['chip', 'cracker', 'pretzel', 'popcorn', 'cookie', 'candy', 'chocolate', 'granola bar', 'trail mix', 'nuts', 'almond', 'cashew', 'peanut', 'jerky', 'gum']],
  ['Household', ['paper towel', 'toilet paper', 'tissue', 'napkin', 'trash bag', 'garbage bag', 'dish soap', 'detergent', 'laundry', 'bleach', 'sponge', 'foil', 'plastic wrap', 'ziploc', 'bag', 'cleaner', 'wipes', 'light bulb', 'batter']],
  ['Personal Care', ['shampoo', 'conditioner', 'soap', 'body wash', 'toothpaste', 'toothbrush', 'floss', 'deodorant', 'razor', 'lotion', 'sunscreen', 'tampon', 'pad', 'vitamin', 'advil', 'tylenol', 'ibuprofen', 'band-aid', 'bandaid']],
  ['Baby & Pet', ['diaper', 'formula', 'baby', 'dog', 'cat', 'pet', 'litter', 'kibble']],
  ['Pantry', ['rice', 'pasta', 'noodle', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'cereal', 'oat', 'bean', 'lentil', 'soup', 'broth', 'stock', 'canned', 'peanut butter', 'jelly', 'jam', 'honey', 'syrup', 'spice', 'seasoning', 'baking', 'vanilla', 'coconut', 'tomato paste', 'salsa', 'chickpea', 'quinoa', 'taco', 'ramen']],
];

const CATALOG_AISLE = new Map(CATALOG.map(([n, , a]) => [n.toLowerCase(), a]));

export function guessAisle(name) {
  const n = String(name || '').toLowerCase().trim();
  const exact = CATALOG_AISLE.get(n) || CATALOG_AISLE.get(n.replace(/s$/, '')) || CATALOG_AISLE.get(n + 's');
  if (exact) return exact;
  for (const [aisle, words] of KEYWORDS) {
    for (const w of words) {
      if (n.includes(w)) return aisle;
    }
  }
  return 'Other';
}

export function isAisle(a) {
  return AISLES.includes(a);
}
