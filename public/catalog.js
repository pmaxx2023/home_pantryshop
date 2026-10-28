// The pantry: common items with an emoji and an aisle, in store-walk order.
// The wall uses this for one-tap adds. Items the house adds by typing join it over time.

export const CATALOG = [
  // Produce
  ['Bananas', '🍌', 'Produce'], ['Apples', '🍎', 'Produce'], ['Oranges', '🍊', 'Produce'], ['Lemons', '🍋', 'Produce'],
  ['Limes', '🍈', 'Produce'], ['Grapes', '🍇', 'Produce'], ['Strawberries', '🍓', 'Produce'], ['Blueberries', '🫐', 'Produce'],
  ['Avocados', '🥑', 'Produce'], ['Tomatoes', '🍅', 'Produce'], ['Onions', '🧅', 'Produce'], ['Garlic', '🧄', 'Produce'],
  ['Potatoes', '🥔', 'Produce'], ['Sweet potatoes', '🍠', 'Produce'], ['Carrots', '🥕', 'Produce'], ['Celery', '🌿', 'Produce'],
  ['Lettuce', '🥬', 'Produce'], ['Spinach', '🥬', 'Produce'], ['Salad mix', '🥗', 'Produce'], ['Bell peppers', '🫑', 'Produce'],
  ['Cucumbers', '🥒', 'Produce'], ['Broccoli', '🥦', 'Produce'], ['Mushrooms', '🍄', 'Produce'], ['Corn', '🌽', 'Produce'],
  ['Cilantro', '🌿', 'Produce'], ['Ginger', '🫚', 'Produce'], ['Peaches', '🍑', 'Produce'], ['Watermelon', '🍉', 'Produce'],
  ['Pineapple', '🍍', 'Produce'], ['Mango', '🥭', 'Produce'], ['Jalapeños', '🌶️', 'Produce'], ['Green beans', '🫛', 'Produce'],

  // Bakery
  ['Bread', '🍞', 'Bakery'], ['Bagels', '🥯', 'Bakery'], ['Tortillas', '🫓', 'Bakery'], ['Hamburger buns', '🍔', 'Bakery'],
  ['Hot dog buns', '🌭', 'Bakery'], ['English muffins', '🧇', 'Bakery'], ['Croissants', '🥐', 'Bakery'], ['Pita', '🫓', 'Bakery'],

  // Deli
  ['Sliced turkey', '🦃', 'Deli'], ['Sliced ham', '🍖', 'Deli'], ['Salami', '🥩', 'Deli'], ['Hummus', '🫘', 'Deli'],
  ['Rotisserie chicken', '🍗', 'Deli'], ['Sliced cheese', '🧀', 'Deli'],

  // Meat & Seafood
  ['Chicken breast', '🍗', 'Meat & Seafood'], ['Chicken thighs', '🍗', 'Meat & Seafood'], ['Ground beef', '🥩', 'Meat & Seafood'],
  ['Steak', '🥩', 'Meat & Seafood'], ['Pork chops', '🍖', 'Meat & Seafood'], ['Bacon', '🥓', 'Meat & Seafood'],
  ['Sausage', '🌭', 'Meat & Seafood'], ['Ground turkey', '🦃', 'Meat & Seafood'], ['Salmon', '🐟', 'Meat & Seafood'],
  ['Shrimp', '🍤', 'Meat & Seafood'], ['Hot dogs', '🌭', 'Meat & Seafood'], ['Tilapia', '🐟', 'Meat & Seafood'],

  // Dairy & Eggs
  ['Milk', '🥛', 'Dairy & Eggs'], ['Eggs', '🥚', 'Dairy & Eggs'], ['Butter', '🧈', 'Dairy & Eggs'], ['Cheese', '🧀', 'Dairy & Eggs'],
  ['Shredded cheese', '🧀', 'Dairy & Eggs'], ['Yogurt', '🥣', 'Dairy & Eggs'], ['Greek yogurt', '🥣', 'Dairy & Eggs'],
  ['Sour cream', '🥛', 'Dairy & Eggs'], ['Cream cheese', '🧀', 'Dairy & Eggs'], ['Heavy cream', '🥛', 'Dairy & Eggs'],
  ['Half and half', '☕', 'Dairy & Eggs'], ['Oat milk', '🥛', 'Dairy & Eggs'], ['Almond milk', '🥛', 'Dairy & Eggs'],
  ['Cottage cheese', '🥣', 'Dairy & Eggs'], ['Orange juice', '🧃', 'Dairy & Eggs'],

  // Pantry
  ['Rice', '🍚', 'Pantry'], ['Pasta', '🍝', 'Pantry'], ['Pasta sauce', '🍝', 'Pantry'], ['Flour', '🌾', 'Pantry'],
  ['Sugar', '🍬', 'Pantry'], ['Olive oil', '🫒', 'Pantry'], ['Vegetable oil', '🛢️', 'Pantry'], ['Salt', '🧂', 'Pantry'],
  ['Pepper', '🧂', 'Pantry'], ['Cereal', '🥣', 'Pantry'], ['Oatmeal', '🥣', 'Pantry'], ['Peanut butter', '🥜', 'Pantry'],
  ['Jelly', '🍇', 'Pantry'], ['Honey', '🍯', 'Pantry'], ['Ketchup', '🍅', 'Pantry'], ['Mustard', '🌭', 'Pantry'],
  ['Mayo', '🥪', 'Pantry'], ['Soy sauce', '🍶', 'Pantry'], ['Hot sauce', '🌶️', 'Pantry'], ['Salsa', '🫙', 'Pantry'],
  ['Canned tomatoes', '🥫', 'Pantry'], ['Black beans', '🫘', 'Pantry'], ['Chicken broth', '🥫', 'Pantry'], ['Soup', '🥫', 'Pantry'],
  ['Tuna', '🥫', 'Pantry'], ['Taco shells', '🌮', 'Pantry'], ['Ramen', '🍜', 'Pantry'], ['Baking soda', '🧁', 'Pantry'],
  ['Vanilla', '🧁', 'Pantry'], ['Coffee', '☕', 'Pantry'], ['Tea', '🍵', 'Pantry'], ['Chocolate chips', '🍫', 'Pantry'],

  // Snacks
  ['Chips', '🥔', 'Snacks'], ['Tortilla chips', '🌮', 'Snacks'], ['Crackers', '🍘', 'Snacks'], ['Pretzels', '🥨', 'Snacks'],
  ['Popcorn', '🍿', 'Snacks'], ['Cookies', '🍪', 'Snacks'], ['Granola bars', '🍫', 'Snacks'], ['Trail mix', '🥜', 'Snacks'],
  ['Almonds', '🌰', 'Snacks'], ['Candy', '🍬', 'Snacks'], ['Chocolate', '🍫', 'Snacks'], ['Fruit snacks', '🍓', 'Snacks'],

  // Drinks
  ['Water', '💧', 'Drinks'], ['Sparkling water', '🫧', 'Drinks'], ['Soda', '🥤', 'Drinks'], ['Juice', '🧃', 'Drinks'],
  ['Beer', '🍺', 'Drinks'], ['Wine', '🍷', 'Drinks'], ['Lemonade', '🍋', 'Drinks'], ['Sports drink', '🥤', 'Drinks'],
  ['Kombucha', '🍵', 'Drinks'], ['Energy drink', '⚡', 'Drinks'],

  // Frozen
  ['Ice cream', '🍨', 'Frozen'], ['Frozen pizza', '🍕', 'Frozen'], ['Frozen vegetables', '🥦', 'Frozen'], ['Frozen fruit', '🫐', 'Frozen'],
  ['Waffles', '🧇', 'Frozen'], ['French fries', '🍟', 'Frozen'], ['Popsicles', '🍡', 'Frozen'], ['Frozen dinners', '🍱', 'Frozen'],
  ['Ice', '🧊', 'Frozen'],

  // Household
  ['Paper towels', '🧻', 'Household'], ['Toilet paper', '🧻', 'Household'], ['Tissues', '🤧', 'Household'], ['Trash bags', '🗑️', 'Household'],
  ['Dish soap', '🧴', 'Household'], ['Dishwasher pods', '🫧', 'Household'], ['Laundry detergent', '🧺', 'Household'], ['Dryer sheets', '🧺', 'Household'],
  ['Sponges', '🧽', 'Household'], ['Aluminum foil', '🥡', 'Household'], ['Plastic wrap', '🥡', 'Household'], ['Zip bags', '👝', 'Household'],
  ['All-purpose cleaner', '🧴', 'Household'], ['Batteries', '🔋', 'Household'], ['Light bulbs', '💡', 'Household'], ['Napkins', '🧻', 'Household'],

  // Personal Care
  ['Shampoo', '🧴', 'Personal Care'], ['Conditioner', '🧴', 'Personal Care'], ['Body wash', '🧼', 'Personal Care'], ['Bar soap', '🧼', 'Personal Care'],
  ['Toothpaste', '🪥', 'Personal Care'], ['Toothbrush', '🪥', 'Personal Care'], ['Floss', '🦷', 'Personal Care'], ['Deodorant', '🧴', 'Personal Care'],
  ['Razors', '🪒', 'Personal Care'], ['Lotion', '🧴', 'Personal Care'], ['Sunscreen', '☀️', 'Personal Care'], ['Vitamins', '💊', 'Personal Care'],
  ['Ibuprofen', '💊', 'Personal Care'], ['Band-aids', '🩹', 'Personal Care'], ['Hand sanitizer', '🧴', 'Personal Care'],

  // Baby & Pet
  ['Diapers', '👶', 'Baby & Pet'], ['Wipes', '🧻', 'Baby & Pet'], ['Formula', '🍼', 'Baby & Pet'], ['Dog food', '🐕', 'Baby & Pet'],
  ['Cat food', '🐈', 'Baby & Pet'], ['Cat litter', '🐈', 'Baby & Pet'], ['Dog treats', '🦴', 'Baby & Pet'],
];

export const AISLE_EMOJI = {
  'Produce': '🥬', 'Bakery': '🍞', 'Deli': '🥪', 'Meat & Seafood': '🥩', 'Dairy & Eggs': '🥛', 'Pantry': '🥫',
  'Snacks': '🍿', 'Drinks': '🥤', 'Frozen': '🧊', 'Household': '🧻', 'Personal Care': '🧴', 'Baby & Pet': '🐾', 'Other': '🛒',
};

const BY_KEY = new Map(CATALOG.map(([name, emoji, aisle]) => [name.toLowerCase(), { name, emoji, aisle }]));

// Emoji for any item name: exact catalog match, then a catalog name contained in it, then the aisle's emoji.
export function emojiFor(name, aisle) {
  const n = String(name || '').toLowerCase().trim();
  const hit = BY_KEY.get(n) || BY_KEY.get(n.replace(/s$/, '')) || BY_KEY.get(n + 's');
  if (hit) return hit.emoji;
  for (const [key, v] of BY_KEY) {
    if (key.length > 3 && n.includes(key)) return v.emoji;
  }
  return AISLE_EMOJI[aisle] || '🛒';
}
