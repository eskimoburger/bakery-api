import 'dotenv/config';
import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { supabase } from './supabaseClient';
import {
  BestSellersStats,
  PaginatedResponse,
  Product,
  ProductCreateRequest,
  ProductUpdateRequest,
  Sale,
  SaleCreateRequest,
  StatsSummary,
} from './types';

const app = express();
app.use(express.json());

// Root path - API information
app.get('/', (_req: Request, res: Response) => {
  const baseUrl = process.env.RENDER === 'true'
    ? process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`
    : `http://localhost:${process.env.PORT || 3000}`;

  res.json({
    name: 'Bakery Inventory & Sales API',
    version: '1.1.0',
    description: 'API for managing bakery products, stock, sales records, and analytics',
    documentation: `${baseUrl}/docs`,
    endpoints: {
      products: `${baseUrl}/products`,
      sales: `${baseUrl}/sales`,
      stats: {
        summary: `${baseUrl}/stats/summary`,
        bestSellers: `${baseUrl}/stats/best-sellers`,
      },
      uploads: `${baseUrl}/uploads/product-image`,
      docs: {
        swagger: `${baseUrl}/docs`,
        openapi: `${baseUrl}/docs/openapi.json`,
      },
    },
  });
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const productCreateSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  totalStock: z.number().int().nonnegative(),
  imagePath: z.string().min(1).optional(),
});

const productUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    totalStock: z.number().int().nonnegative().optional(),
    imagePath: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const saleCreateSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const salesQuerySchema = paginationSchema.extend({
  productId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const statsRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const uploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

const openApiPath = path.resolve(process.cwd(), 'openapi.yaml');
let cachedOpenApi: unknown;

const loadOpenApi = async () => {
  if (!cachedOpenApi) {
    const file = await fs.readFile(openApiPath, 'utf8');
    const spec = YAML.parse(file) as Record<string, unknown>;

    // Dynamically set the server URL based on environment
    const isProduction = process.env.RENDER === 'true';
    const baseUrl = isProduction
      ? process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`
      : `http://localhost:${process.env.PORT || 3000}`;

    spec.servers = [{ url: baseUrl }];
    cachedOpenApi = spec;
  }
  return cachedOpenApi;
};

type ProductRow = {
  id: string;
  name: string;
  price: number | string;
  total_stock: number;
  image_path: string | null;
  sold_quantity: number;
  remaining_stock: number;
};

type SaleRow = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number | string;
  total_amount: number | string;
  sold_at: string;
};

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  price: Number(row.price),
  totalStock: row.total_stock,
  imagePath: row.image_path,
  soldQuantity: row.sold_quantity,
  remainingStock: row.remaining_stock,
});

const toSale = (row: SaleRow): Sale => ({
  id: row.id,
  productId: row.product_id,
  quantity: row.quantity,
  unitPrice: Number(row.unit_price),
  totalAmount: Number(row.total_amount),
  soldAt: row.sold_at,
});

const sendError = (res: Response, status: number, error: string, message?: string) =>
  res.status(status).json({ error, message });

const fetchProductById = async (id: string): Promise<Product | null> => {
  const { data, error } = await supabase
    .from('product_read_model')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toProduct(data) : null;
};

app.get('/products', async (req: Request, res: Response) => {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, 'InvalidRequest', parsed.error.issues[0]?.message);
  }

  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('product_read_model')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return sendError(res, 500, 'ServerError', error.message);
  }

  const items = (data ?? []).map(toProduct);
  const response: PaginatedResponse<Product> = {
    items,
    total: count ?? items.length,
  };

  return res.json(response);
});

app.post('/products', async (req: Request, res: Response) => {
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'InvalidRequest', parsed.error.issues[0]?.message);
  }

  const payload: ProductCreateRequest = parsed.data;

  const { data, error } = await supabase
    .from('products')
    .insert({
      name: payload.name,
      price: payload.price,
      total_stock: payload.totalStock,
      image_path: payload.imagePath,
    })
    .select('id')
    .single();

  if (error) {
    return sendError(res, 500, 'ServerError', error.message);
  }

  const product = await fetchProductById(data.id);
  return res.status(201).json(product);
});

app.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const product = await fetchProductById(req.params.id);
    if (!product) {
      return sendError(res, 404, 'NotFound', 'Product not found');
    }
    return res.json(product);
  } catch (error: any) {
    return sendError(res, 500, 'ServerError', error.message);
  }
});

app.patch('/products/:id', async (req: Request, res: Response) => {
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'InvalidRequest', parsed.error.issues[0]?.message);
  }

  const payload: ProductUpdateRequest = parsed.data;

  const updateBody: Record<string, unknown> = {};
  if (payload.name !== undefined) updateBody.name = payload.name;
  if (payload.price !== undefined) updateBody.price = payload.price;
  if (payload.totalStock !== undefined) updateBody.total_stock = payload.totalStock;
  if (payload.imagePath !== undefined) updateBody.image_path = payload.imagePath;

  const { data, error } = await supabase
    .from('products')
    .update(updateBody)
    .eq('id', req.params.id)
    .select('id')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return sendError(res, 404, 'NotFound', 'Product not found');
    }
    return sendError(res, 500, 'ServerError', error.message);
  }

  const product = await fetchProductById(data.id);
  return res.json(product);
});

app.get('/sales', async (req: Request, res: Response) => {
  const parsed = salesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, 'InvalidRequest', parsed.error.issues[0]?.message);
  }

  const { page, limit, productId, from, to } = parsed.data;
  const offset = (page - 1) * limit;

  let query = supabase.from('sales').select('*', { count: 'exact' });

  if (productId) {
    query = query.eq('product_id', productId);
  }
  if (from) {
    query = query.gte('sold_at', from);
  }
  if (to) {
    query = query.lte('sold_at', to);
  }

  const { data, error, count } = await query
    .order('sold_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return sendError(res, 500, 'ServerError', error.message);
  }

  const items = (data ?? []).map(toSale);
  const response: PaginatedResponse<Sale> = {
    items,
    total: count ?? items.length,
  };

  return res.json(response);
});

app.post('/sales', async (req: Request, res: Response) => {
  const parsed = saleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'InvalidRequest', parsed.error.issues[0]?.message);
  }

  const payload: SaleCreateRequest = parsed.data;

  let product: Product | null;
  try {
    product = await fetchProductById(payload.productId);
  } catch (error: any) {
    return sendError(res, 500, 'ServerError', error.message);
  }

  if (!product) {
    return sendError(res, 404, 'NotFound', 'Product not found');
  }

  if (payload.quantity > product.remainingStock) {
    return sendError(res, 400, 'InvalidRequest', 'Not enough stock');
  }

  const { data, error } = await supabase
    .from('sales')
    .insert({
      product_id: payload.productId,
      quantity: payload.quantity,
      unit_price: product.price,
    })
    .select('*')
    .single();

  if (error) {
    return sendError(res, 500, 'ServerError', error.message);
  }

  return res.status(201).json(toSale(data));
});

app.get('/stats/summary', async (_req: Request, res: Response) => {
  const { data, error } = await supabase.rpc('get_stats_summary');

  if (error) {
    return sendError(res, 500, 'ServerError', error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const summary: StatsSummary = {
    totalProducts: Number(row?.total_products ?? 0),
    totalStock: Number(row?.total_stock ?? 0),
    totalSoldQuantity: Number(row?.total_sold_quantity ?? 0),
    totalRemainingStock: Number(row?.total_remaining_stock ?? 0),
  };

  return res.json(summary);
});

app.get('/stats/best-sellers', async (req: Request, res: Response) => {
  const parsed = statsRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, 'InvalidRequest', parsed.error.issues[0]?.message);
  }

  const { from, to } = parsed.data;
  const { data, error } = await supabase.rpc('get_best_sellers', {
    from_ts: from ?? null,
    to_ts: to ?? null,
  });

  if (error) {
    return sendError(res, 500, 'ServerError', error.message);
  }

  const stats: BestSellersStats = (data as BestSellersStats) ?? {
    bestByQuantity: null,
    bestByRevenue: null,
  };

  return res.json(stats);
});

app.post('/uploads/product-image', async (req: Request, res: Response) => {
  const parsed = uploadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'InvalidRequest', parsed.error.issues[0]?.message);
  }

  const { filename } = parsed.data;
  const bucketName = 'products';

  try {
    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);

    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
      });

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }
    }

    // Generate upload URL (Supabase Storage doesn't use pre-signed URLs for uploads with service role)
    // Instead, we return the public URL where the file will be accessible
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);

    return res.status(201).json({
      key: `${bucketName}/${filename}`,
      publicUrl: publicUrlData.publicUrl,
      uploadUrl: publicUrlData.publicUrl, // For compatibility with existing upload script
    });
  } catch (error: any) {
    return sendError(res, 500, 'ServerError', error.message);
  }
});

app.get('/docs/openapi.json', async (_req: Request, res: Response) => {
  try {
    const spec = await loadOpenApi();
    return res.json(spec);
  } catch (error: any) {
    return sendError(res, 500, 'ServerError', error.message ?? 'Unable to load OpenAPI spec');
  }
});

app.use('/docs', swaggerUi.serve, async (req: Request, res: Response, next: express.NextFunction) => {
  try {
    const spec = (await loadOpenApi()) as Record<string, unknown>;
    return swaggerUi.setup(spec)(req, res, next);
  } catch (error: any) {
    return sendError(res, 500, 'ServerError', error.message ?? 'Unable to load OpenAPI spec');
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Bakery API running on port ${port}`);
});
