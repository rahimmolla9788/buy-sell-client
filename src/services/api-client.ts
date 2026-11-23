import { useState, useEffect } from 'react';
import { BACKEND_API } from '@/constants/api';

export interface RetryOptions {
  /** Maximum number of retries before failing (default: 3) */
  retries?: number;
  /** Timeout in ms per attempt (default: 35000ms - 35s for free tier cold starts) */
  timeoutMs?: number;
  /** Initial delay between retries in ms (default: 1500ms) */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms (default: 8000ms) */
  maxDelayMs?: number;
  /** Backoff factor (default: 1.8) */
  backoffFactor?: number;
  /** HTTP status codes that trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryOnStatuses?: number[];
  /** Whether to retry on network errors or timeout aborts (default: true) */
  retryOnNetworkError?: boolean;
  /** Optional callback triggered on each retry attempt */
  onRetry?: (attempt: number, error: any) => void;
  /** If true, does not trigger global waking indicator */
  silent?: boolean;
}

// Global server connection state listeners
type ConnectionListener = (state: { isWaking: boolean; isOffline: boolean; lastError: string | null }) => void;
const listeners = new Set<ConnectionListener>();
let globalConnectionState = {
  isWaking: false,
  isOffline: false,
  lastError: null as string | null,
};

let activePendingRequests = 0;
let latencyWarningTimer: any = null;

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener({ ...globalConnectionState });
    } catch {}
  });
}

function updateConnectionState(partial: Partial<typeof globalConnectionState>) {
  globalConnectionState = { ...globalConnectionState, ...partial };
  notifyListeners();
}

/**
 * Register a listener for global server connection/waking events
 */
export function subscribeServerConnection(listener: ConnectionListener) {
  listeners.add(listener);
  listener({ ...globalConnectionState });
  return () => {
    listeners.delete(listener);
  };
}

/**
 * React Hook to subscribe to server cold-start / connection status
 */
export function useServerConnectionStatus() {
  const [state, setState] = useState(globalConnectionState);

  useEffect(() => {
    return subscribeServerConnection(setState);
  }, []);

  return state;
}

/**
 * Sleep helper with promise
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Centralized fetch with automatic retry, exponential backoff, cold-start handling, and configurable timeout.
 */
export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  const {
    retries = 3,
    timeoutMs = 35000, // 35 seconds per attempt (essential for free-tier spin-up)
    initialDelayMs = 1500,
    maxDelayMs = 8000,
    backoffFactor = 1.8,
    retryOnStatuses = [408, 429, 500, 502, 503, 504],
    retryOnNetworkError = true,
    onRetry,
    silent = false,
  } = options || {};

  // Build full URL if relative path passed
  let fullUrl = input;
  if (input.startsWith('/')) {
    const base = BACKEND_API.BASE_URL.replace(/\/+$/, '');
    fullUrl = `${base}${input}`;
  }

  activePendingRequests++;
  if (!silent && !latencyWarningTimer) {
    // If request takes > 3.5s, signal that server might be cold-starting
    latencyWarningTimer = setTimeout(() => {
      if (activePendingRequests > 0) {
        updateConnectionState({ isWaking: true });
      }
    }, 3500);
  }

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt <= retries) {
    const controller = new AbortController();
    let hasTimedOut = false;
    const timeoutId = setTimeout(() => {
      hasTimedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(fullUrl, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if response status warrants a retry (e.g. 502 Bad Gateway / 503 while container boots)
      if (retryOnStatuses.includes(response.status) && attempt < retries) {
        attempt++;
        const jitter = Math.floor(Math.random() * 500);
        const waitTime = Math.min(delay, maxDelayMs) + jitter;
        console.log(
          `[fetchWithRetry] Received status ${response.status} from ${fullUrl}. Retrying attempt ${attempt}/${retries} in ${waitTime}ms...`
        );
        if (onRetry) onRetry(attempt, new Error(`HTTP ${response.status}`));
        await sleep(waitTime);
        delay = Math.round(delay * backoffFactor);
        continue;
      }

      // Successful or non-retriable response received
      activePendingRequests = Math.max(0, activePendingRequests - 1);
      if (activePendingRequests === 0) {
        if (latencyWarningTimer) {
          clearTimeout(latencyWarningTimer);
          latencyWarningTimer = null;
        }
        updateConnectionState({ isWaking: false, isOffline: false, lastError: null });
      }

      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);

      const isAbort = hasTimedOut || err?.name === 'AbortError';
      const isNetworkError =
        err?.message?.includes('Network request failed') ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        isAbort;

      if (retryOnNetworkError && isNetworkError && attempt < retries) {
        attempt++;
        const jitter = Math.floor(Math.random() * 500);
        const waitTime = Math.min(delay, maxDelayMs) + jitter;
        const reason = isAbort ? `Timeout after ${timeoutMs}ms` : err?.message || 'Network Error';
        console.log(
          `[fetchWithRetry] Error (${reason}) requesting ${fullUrl}. Retrying attempt ${attempt}/${retries} in ${waitTime}ms...`
        );
        if (onRetry) onRetry(attempt, err);
        await sleep(waitTime);
        delay = Math.round(delay * backoffFactor);
        continue;
      }

      // Retries exhausted or non-retriable error
      activePendingRequests = Math.max(0, activePendingRequests - 1);
      if (activePendingRequests === 0) {
        if (latencyWarningTimer) {
          clearTimeout(latencyWarningTimer);
          latencyWarningTimer = null;
        }
        updateConnectionState({
          isWaking: false,
          isOffline: true,
          lastError: err?.message || 'Connection failed',
        });
      }

      throw err;
    }
  }

  // Fallback if loop exits without returning
  activePendingRequests = Math.max(0, activePendingRequests - 1);
  throw new Error(`[fetchWithRetry] All ${retries} retries exhausted for ${fullUrl}`);
}

/**
 * Convenient JSON GET with auto-retry
 */
export async function apiGet<T = any>(
  path: string,
  options?: RetryOptions & { headers?: Record<string, string> }
): Promise<T> {
  const { headers, ...retryOpts } = options || {};
  const res = await fetchWithRetry(
    path,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(BACKEND_API.API_KEY ? { 'Authorization': `Bearer ${BACKEND_API.API_KEY}` } : {}),
        ...headers,
      },
    },
    retryOpts
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.error || `Request failed with status ${res.status}`);
  }

  return (await res.json()) as T;
}

/**
 * Convenient JSON POST with auto-retry
 */
export async function apiPost<T = any>(
  path: string,
  body?: any,
  options?: RetryOptions & { headers?: Record<string, string> }
): Promise<T> {
  const { headers, ...retryOpts } = options || {};
  const res = await fetchWithRetry(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(BACKEND_API.API_KEY ? { 'Authorization': `Bearer ${BACKEND_API.API_KEY}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    retryOpts
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.error || `Request failed with status ${res.status}`);
  }

  return (await res.json()) as T;
}

/**
 * Fire-and-forget server wake-up ping for free-tier spin-up
 * Pings /health in the background without blocking UI
 */
export async function wakeUpServer(): Promise<boolean> {
  try {
    const res = await fetchWithRetry(
      '/health',
      { method: 'GET' },
      { retries: 2, timeoutMs: 40000, silent: false }
    );
    return res.ok;
  } catch {
    return false;
  }
}
