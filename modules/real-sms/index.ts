import { EventEmitter, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, PermissionsAndroid } from 'react-native';

export interface RealSmsRecord {
  id: string;
  threadId: string;
  address: string;
  contactName?: string;
  body: string;
  date: number;
  isIncoming: boolean;
  isRead: boolean;
  recipientPhone?: string;
}

export interface RealIncomingSMS {
  sender: string;
  phoneNumber: string;
  body: string;
  timestamp: number;
  recipientPhone?: string;
}

export interface SmsPermissionsResult {
  read: boolean;
  receive: boolean;
  send: boolean;
  allGranted: boolean;
  neverAskAgain?: boolean;
}

// Safely load the native module if compiled into the native build
const RealSms = requireOptionalNativeModule<any>('RealSms');
const emitter: any = RealSms ? new (EventEmitter as any)(RealSms) : null;

export function isRealSmsModuleAvailable(): boolean {
  return !!RealSms && Platform.OS === 'android';
}

export function setNativeSyncConfig(baseUrl: string, receiptNumber: string, apiKey?: string): void {
  if (isRealSmsModuleAvailable() && RealSms?.setSyncConfig) {
    try {
      RealSms.setSyncConfig(baseUrl, receiptNumber, apiKey || '');
    } catch (e) {
      console.warn('[RealSms] Failed to set native sync config:', e);
    }
  }
}

export function startSyncService(): void {
  if (isRealSmsModuleAvailable() && RealSms?.startSyncService) {
    try {
      RealSms.startSyncService();
    } catch (e) {
      console.warn('[RealSms] Failed to start native sync service:', e);
    }
  }
}

export function getNativeSyncConfig(): { baseUrl: string; receiptNumber: string; apiKey: string } | null {
  if (isRealSmsModuleAvailable() && RealSms?.getSyncConfig) {
    try {
      return RealSms.getSyncConfig();
    } catch (e) {
      console.warn('[RealSms] Failed to get native sync config:', e);
    }
  }
  return null;
}

export async function checkPermissionsAsync(): Promise<SmsPermissionsResult> {
  if (Platform.OS !== 'android') {
    return { read: false, receive: false, send: false, allGranted: false };
  }

  if (RealSms?.hasPermissions) {
    try {
      return await RealSms.hasPermissions();
    } catch {
      // fallback to PermissionsAndroid
    }
  }

  const [hasRead, hasReceive, hasSend] = await Promise.all([
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS),
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS),
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS),
  ]);

  return {
    read: hasRead,
    receive: hasReceive,
    send: hasSend,
    allGranted: hasRead && hasReceive && hasSend,
  };
}

export async function requestSmsPermissionsAsync(): Promise<SmsPermissionsResult> {
  if (Platform.OS !== 'android') {
    return { read: false, receive: false, send: false, allGranted: false };
  }

  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
    ]);

    const readGranted = results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
    const receiveGranted = results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;
    const sendGranted = results[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.GRANTED;

    const readNever = results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    const receiveNever = results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    const sendNever = results[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

    return {
      read: readGranted,
      receive: receiveGranted,
      send: sendGranted,
      allGranted: readGranted && receiveGranted && sendGranted,
      neverAskAgain: readNever || receiveNever || sendNever,
    };
  } catch (error) {
    console.warn('Failed to request SMS permissions:', error);
    return { read: false, receive: false, send: false, allGranted: false, neverAskAgain: false };
  }
}

export async function fetchDeviceInboxMessages(limit: number = 100): Promise<RealSmsRecord[]> {
  if (!isRealSmsModuleAvailable()) {
    return [];
  }

  try {
    const list = await RealSms.getInboxMessages(limit);
    return (list || []).map((item: any) => ({
      id: String(item.id || ''),
      threadId: String(item.threadId || item.address || ''),
      address: String(item.address || 'Unknown'),
      contactName: String(item.contactName || item.address || 'Unknown'),
      body: String(item.body || ''),
      date: Number(item.date || Date.now()),
      isIncoming: Boolean(item.isIncoming),
      isRead: Boolean(item.isRead),
    }));
  } catch (err) {
    console.warn('Error fetching device SMS:', err);
    return [];
  }
}

export async function sendDirectSmsAsync(phoneNumber: string, message: string): Promise<boolean> {
  if (isRealSmsModuleAvailable() && RealSms?.sendDirectSms) {
    try {
      await RealSms.sendDirectSms(phoneNumber, message);
      return true;
    } catch (e) {
      console.warn('Direct SMS send error:', e);
    }
  }
  return false;
}

export function subscribeToRealIncomingSMS(callback: (sms: RealIncomingSMS) => void) {
  if (!emitter) return () => {};

  const subscription = emitter.addListener('onIncomingSMS', (event: any) => {
    callback({
      sender: event.sender || event.phoneNumber || 'Unknown',
      phoneNumber: event.phoneNumber || event.sender || 'Unknown',
      body: event.body || '',
      timestamp: Number(event.timestamp || Date.now()),
    });
  });

  return () => {
    subscription.remove();
  };
}
