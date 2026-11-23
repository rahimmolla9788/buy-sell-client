import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_API } from '@/constants/api';
import { fetchWithRetry } from '@/services/api-client';
import {
  OperatorInfo,
  SimOffer,
  OfferCategory,
  OPERATORS,
  SIM_OFFERS,
} from '@/constants/sim-offers';

const STORAGE_KEY_OPERATORS = '@cached_sim_operators_v1';
const STORAGE_KEY_PACKAGES = '@cached_sim_packages_v1';

/**
 * Static SIM Operators list with local logo assets
 */
export async function fetchSimOperators(): Promise<OperatorInfo[]> {
  return Object.values(OPERATORS);
}

/**
 * Fetch packages from backend with optional filters
 * Falls back to cached data or local defaults if network is offline
 */
export async function fetchSimPackages(filter?: {
  operator?: string;
  category?: OfferCategory | string;
  search?: string;
}): Promise<SimOffer[]> {
  try {
    const query = new URLSearchParams();
    if (filter?.operator) query.append('operator', filter.operator);
    if (filter?.category && filter.category !== 'all') query.append('category', filter.category);
    if (filter?.search) query.append('search', filter.search);

    const path = `/packages${query.toString() ? `?${query.toString()}` : ''}`;
    const res = await fetchWithRetry(path, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }, { retries: 3, timeoutMs: 35000 });

    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        const packages: SimOffer[] = json.data;
        if (!filter?.operator && !filter?.category && !filter?.search) {
          // Cache full list
          AsyncStorage.setItem(STORAGE_KEY_PACKAGES, JSON.stringify(packages)).catch(() => {});
        }
        return packages;
      }
    }
  } catch (err) {
    console.log('[SimOfferService] Failed to fetch packages from backend, using cache/fallback:', err);
  }

  // Try cached data
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY_PACKAGES);
    if (cached) {
      const parsed: SimOffer[] = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return filterPackagesLocally(parsed, filter);
      }
    }
  } catch {}

  // Fallback to local default packages
  return filterPackagesLocally(SIM_OFFERS, filter);
}

function filterPackagesLocally(
  list: SimOffer[],
  filter?: { operator?: string; category?: OfferCategory | string; search?: string }
): SimOffer[] {
  let res = [...list];
  if (filter?.operator) {
    res = res.filter((p) => p.operator.toLowerCase() === filter.operator!.toLowerCase());
  }
  if (filter?.category && filter.category !== 'all') {
    res = res.filter((p) => p.category.toLowerCase() === filter.category!.toLowerCase());
  }
  if (filter?.search) {
    const q = filter.search.toLowerCase().trim();
    res = res.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.volume.toLowerCase().includes(q) ||
        p.validity.toLowerCase().includes(q) ||
        p.price.toString().includes(q)
    );
  }
  return res;
}

/**
 * Create a new package on the backend
 */
export async function createPackageOnBackend(pkg: Omit<SimOffer, 'id'> & { id?: string }): Promise<SimOffer> {
  const res = await fetchWithRetry('/packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pkg),
  }, { retries: 2, timeoutMs: 30000 });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to create package on backend');
  }

  return json.data;
}

/**
 * Create a new SIM operator on the backend
 */
export async function createSimOnBackend(sim: Partial<OperatorInfo> & { name: string }): Promise<OperatorInfo> {
  const res = await fetchWithRetry('/sims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sim),
  }, { retries: 2, timeoutMs: 30000 });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to create SIM operator on backend');
  }

  return json.data;
}
