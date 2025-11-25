export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  totalStock: number;
  imagePath?: string | null;
  soldQuantity: number;
  remainingStock: number;
}

export interface ProductCreateRequest {
  name: string;
  price: number;
  totalStock: number;
  imagePath?: string | null;
}

export interface ProductUpdateRequest {
  name?: string;
  price?: number;
  totalStock?: number;
  imagePath?: string | null;
}

export interface Sale {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  soldAt: string;
}

export interface SaleCreateRequest {
  productId: string;
  quantity: number;
}

export interface StatsSummary {
  totalProducts: number;
  totalStock: number;
  totalSoldQuantity: number;
  totalRemainingStock: number;
}

export interface BestSellersStats {
  bestByQuantity: {
    productId: string;
    name: string;
    price: number;
    soldQuantity: number;
  } | null;

  bestByRevenue: {
    productId: string;
    name: string;
    price: number;
    soldQuantity: number;
    totalRevenue: number;
  } | null;
}

export interface PurchaseCreateRequest {
  productId: string;
  quantity: number;
}

export interface PurchaseResponse {
  purchaseId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  purchasedAt: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}
