import 'dotenv/config';
import { supabase } from '../src/supabaseClient';

const imageBase = (process.env.SEED_IMAGE_BASE ?? 'public').replace(/\/$/, '');

const products = [
  { name: 'Sourdough Loaf', price: 4.5, total_stock: 120, image_path: `${imageBase}/sourdough.jpg` },
  { name: 'Chocolate Croissant', price: 3.25, total_stock: 200, image_path: `${imageBase}/choco-croissant.jpg` },
  { name: 'Almond Danish', price: 3.75, total_stock: 150, image_path: `${imageBase}/almond-danish.jpg` },
  { name: 'Cinnamon Roll', price: 3.0, total_stock: 180, image_path: `${imageBase}/cinnamon-roll.jpg` },
  { name: 'Blueberry Muffin', price: 2.75, total_stock: 160, image_path: `${imageBase}/blueberry-muffin.jpg` },
];

async function main() {
  const names = products.map((p) => p.name);
  const { data: existing, error: existingError } = await supabase
    .from('products')
    .select('name')
    .in('name', names);

  if (existingError) {
    console.error('Failed to check existing products:', existingError.message);
    process.exit(1);
  }

  const existingNames = new Set((existing ?? []).map((p) => p.name));
  const toInsert = products.filter((p) => !existingNames.has(p.name));

  if (toInsert.length === 0) {
    console.log('Seed skipped: all products already exist');
    return;
  }

  const { error: insertError } = await supabase.from('products').insert(toInsert);

  if (insertError) {
    console.error('Failed to insert seed products:', insertError.message);
    process.exit(1);
  }

  console.log(`Seeded ${toInsert.length} products`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
