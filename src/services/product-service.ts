import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_API } from '@/constants/api';
import { SecondHandProduct, AppSettings, UserOrder } from '@/types/product';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_BOOKING_AMOUNT,
  DEFAULT_DELIVERY_INSIDE_DHAKA,
  DEFAULT_DELIVERY_OUTSIDE_DHAKA,
  OFFICIAL_SHOP_LOCATION,
  OFFICIAL_SHOP_ADDRESS,
} from '@/constants/products';

const STORAGE_KEY_PRODUCTS = '@cached_products_v2';
const STORAGE_KEY_SETTINGS = '@cached_app_settings_v2';

/**
 * Fetch 2nd-hand products from backend with optional category & search filter
 */
export async function fetchProducts(filter?: {
  category?: string;
  search?: string;
}): Promise<SecondHandProduct[]> {
  try {
    const query = new URLSearchParams();
    if (filter?.category && filter.category !== 'all') {
      query.append('category', filter.category);
    }
    if (filter?.search) {
      query.append('search', filter.search);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    const url = `${BACKEND_API.BASE_URL}/products${query.toString() ? `?${query.toString()}` : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const products: SecondHandProduct[] = json.data;
        if (!filter?.category && !filter?.search) {
          AsyncStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products)).catch(() => {});
        }
        return products;
      }
    }
  } catch (err) {
    console.log('[ProductService] Failed to fetch products from backend, using cache/fallback:', err);
  }

  // Try cached data
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY_PRODUCTS);
    if (cached) {
      const parsed: SecondHandProduct[] = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return filterProductsLocally(parsed, filter);
      }
    }
  } catch {}

  // Fallback to default local products
  return filterProductsLocally(DEFAULT_PRODUCTS, filter);
}

/**
 * Fetch single product by id
 */
export async function fetchProductById(id: string): Promise<SecondHandProduct | undefined> {
  try {
    const res = await fetch(`${BACKEND_API.BASE_URL}/products/${id}`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        return json.data;
      }
    }
  } catch {}

  // Fallback check in default products
  return DEFAULT_PRODUCTS.find((p) => p.id === id);
}

/**
 * Fetch configurable App Settings (including Booking Payment Amount)
 */
export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${BACKEND_API.BASE_URL}/settings`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        const s: AppSettings = json.data;
        AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(s)).catch(() => {});
        return s;
      }
    }
  } catch (err) {
    console.log('[ProductService] Failed to fetch settings, using cache/default');
  }

  // Try cached settings
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS);
    if (cached) {
      const s = JSON.parse(cached);
      if (s && s.bookingPaymentAmount) return s;
    }
  } catch {}

  return {
    key: 'global_settings',
    bookingPaymentAmount: DEFAULT_BOOKING_AMOUNT,
    deliveryFeeInsideDhaka: DEFAULT_DELIVERY_INSIDE_DHAKA,
    deliveryFeeOutsideDhaka: DEFAULT_DELIVERY_OUTSIDE_DHAKA,
    shopLocation: OFFICIAL_SHOP_LOCATION,
    shopAddress: OFFICIAL_SHOP_ADDRESS,
    appName: 'BuySell - সেকেন্ড হ্যান্ড বাজার',
    supportPhone: '0197272313',
    noticeBanner: 'নিরাপদে সেকেন্ড হ্যান্ড পণ্য কিনুন বা টোকেন বুকিং মানি দিয়ে বুক করে রাখুন!',
  };
}

/**
 * Fetch all bookings & orders placed by the logged-in user
 */
export async function fetchUserOrders(phoneNumber: string): Promise<UserOrder[]> {
  if (!phoneNumber) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${BACKEND_API.BASE_URL}/orders/user/${encodeURIComponent(phoneNumber)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        return json.data as UserOrder[];
      }
    }
  } catch (err) {
    console.log('[ProductService] Failed to fetch user orders:', err);
  }
  return [];
}

function filterProductsLocally(
  list: SecondHandProduct[],
  filter?: { category?: string; search?: string }
): SecondHandProduct[] {
  let res = [...list];
  if (filter?.category && filter.category !== 'all') {
    res = res.filter((p) => (p.category || '').toLowerCase() === filter.category!.toLowerCase());
  }
  if (filter?.search) {
    const q = filter.search.toLowerCase().trim();
    res = res.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q))
    );
  }
  return res;
}

