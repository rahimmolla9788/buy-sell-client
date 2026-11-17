export type ProductCategory =
  | 'all'
  | 'mobiles'
  | 'computers'
  | 'bikes'
  | 'electronics'
  | 'appliances'
  | 'cameras'
  | 'furniture'
  | 'fashion'
  | 'others';

export type ProductCondition = 'used-like-new' | 'used-good' | 'used-fair';

export type PaymentType = 'cod_delivery' | 'store_pickup' | 'booking' | 'online';
export type DeliveryArea = 'inside_dhaka' | 'outside_dhaka';

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface SecondHandProduct {
  id: string;
  title: string;
  category: ProductCategory | string;
  categoryName?: string;
  price: number;
  originalPrice?: number | null;
  condition: ProductCondition | string;
  conditionLabel?: string;
  location: string;
  images: string[];
  thumbnail: string;
  description: string;
  sellerName: string;
  sellerPhone: string;
  sellerVerified?: boolean;
  sellerRating?: number;
  bookingAmount?: number | null;
  status: 'available' | 'booked' | 'sold';
  featured?: boolean;
  badge?: string;
  specifications?: ProductSpecification[];
  createdAt?: number;
  updatedAt?: number;
}

export interface AppSettings {
  key: string;
  bookingPaymentAmount: number;
  deliveryFeeInsideDhaka: number;
  deliveryFeeOutsideDhaka: number;
  shopLocation: string;
  shopAddress: string;
  appName: string;
  supportPhone: string;
  noticeBanner?: string;
}

export type OrderProgressStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'ready_for_pickup'
  | 'delivered'
  | 'cancelled';

export interface UserOrder {
  sessionId: string;
  userPhone: string;
  buyerPhone?: string;
  accountNumber?: string;
  method: string;
  amount: number;
  paymentType: PaymentType | string;
  productId: string;
  productTitle: string;
  productThumbnail?: string;
  productPrice: number;
  bookingAmount?: number;
  deliveryAddress?: string;
  status: string;
  orderProgress: OrderProgressStatus;
  trackingNote?: string;
  createdAt: number;
  updatedAt: number;
}

