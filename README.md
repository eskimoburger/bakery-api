# Bakery Inventory & Sales API

TypeScript Express API backed by Supabase implementing the provided bakery inventory & sales spec.

## Prerequisites
- Node.js 18+
- Supabase project (URL + service role key)

## Setup
1) Install dependencies  
   `npm install`
2) Copy environment variables  
   `cp .env.example .env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   - For uploads, set R2 credentials: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and optional `R2_PUBLIC_BASE_URL` if you want to return a public URL.
3) Apply database schema to Supabase (SQL editor or `supabase db push`):  
   `supabase/migrations/001_init.sql` creates `products`, `sales`, the `product_read_model` view, and RPC helpers `get_stats_summary` and `get_best_sellers`.

## Run
- Dev: `npm run dev`
- Build: `npm run build`
- Start compiled build: `npm start`
- Seed sample products (requires env + DB ready): `npm run seed` (or `bun run scripts/seed.ts`)
- Upload local public images to R2 via the upload service: start the API (`npm run dev`), then run `bun run scripts/upload-with-service.ts` (uses `UPLOAD_SERVICE_URL`, `SEED_IMAGE_DIR`, `SEED_IMAGE_BASE` envs as needed).

## API (matches the given spec)
- `GET /products` (pagination `page`, `limit`)
- `POST /products` `{ name, price, totalStock, imagePath? }`
- `GET /products/:id`
- `PATCH /products/:id` (partial `{ name?, price?, totalStock?, imagePath? }`)
- `GET /sales` (filters `productId`, `from`, `to`, pagination)
- `POST /sales` `{ productId, quantity }` (checks remaining stock, uses current product price)
- `GET /stats/summary` (uses `get_stats_summary`)
- `GET /stats/best-sellers` (optional `from`, `to`, uses `get_best_sellers`)
- `POST /uploads/product-image` `{ filename, contentType }` → returns `{ uploadUrl, key, publicUrl? }` (signed PUT for R2; store `key` or `publicUrl` in `imagePath`)
- `GET /docs/openapi.json` serves the OpenAPI/Swagger spec (`openapi.yaml`)

## Notes
- Uses the `product_read_model` view to compute `soldQuantity` and `remainingStock` from sales history.
- Products support `imagePath` (store your Cloudflare R2 object path/URL); the API just persists the string.
- `get_best_sellers` aggregates by quantity and revenue; returns `null` when no sales in range.
- Concurrency: stock check for `/sales` is application-level; for strict guarantees, move the check + insert into a single SQL function and call via `rpc`.
- Testing was not run in this environment (no dependencies installed here); run `npm run lint` or start the server after installing packages.
