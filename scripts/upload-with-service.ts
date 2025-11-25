import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { supabase } from '../src/supabaseClient';

const imageDir = process.env.SEED_IMAGE_DIR ?? path.join(process.cwd(), 'public');
const bucketName = 'products';

const files = [
  'sourdough.jpg',
  'choco-croissant.jpg',
  'almond-danish.jpg',
  'cinnamon-roll.jpg',
  'blueberry-muffin.jpg',
];

async function uploadFile(filename: string) {
  const filePath = path.join(imageDir, filename);
  const buffer = await fs.readFile(filePath);

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filename, buffer, {
      contentType: 'image/jpeg',
      upsert: true // Overwrite if already exists
    });

  if (error) {
    throw new Error(`Failed to upload ${filename}: ${error.message}`);
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(filename);

  console.log(`[uploaded] ${filename} -> ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
}

async function ensureBucket() {
  // Check if bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === bucketName);

  if (!bucketExists) {
    console.log(`Creating bucket: ${bucketName}`);
    const { error } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
    });

    if (error) {
      throw new Error(`Failed to create bucket: ${error.message}`);
    }
  }
}

async function main() {
  console.log(`Using Supabase Storage bucket: ${bucketName}`);
  console.log(`Reading images from: ${imageDir}`);

  // Ensure bucket exists
  await ensureBucket();

  // Upload all files
  for (const file of files) {
    await uploadFile(file);
  }

  console.log('\nUpload complete! Use the printed paths in product image_path.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

