import { Platform, Linking } from 'react-native';
import * as SMS from 'expo-sms';

import {
  isRealSmsModuleAvailable,
  checkPermissionsAsync,
  requestSmsPermissionsAsync,
  fetchDeviceInboxMessages,
  sendDirectSmsAsync,
  subscribeToRealIncomingSMS,
  SmsPermissionsResult,
  RealSmsRecord,
} from '../../modules/real-sms';
import { SMSThread, SMSMessage, SMSCategory } from '@/types/sms';
import { extractOTP } from '@/constants/mock-sms';
import { BACKEND_API } from '@/constants/api';

export interface SendRealSMSResult {
  success: boolean;
  method: 'direct_native' | 'expo_sms_ui' | 'url_scheme' | 'simulated';
  error?: string;
}

export async function isDeviceSmsCapable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SMS.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getDeviceSmsPermissions(): Promise<SmsPermissionsResult> {
  return await checkPermissionsAsync();
}

export async function promptRequestSmsPermissions(): Promise<SmsPermissionsResult> {
  return await requestSmsPermissionsAsync();
}

export async function sendRealSMS(
  phoneNumber: string,
  message: string,
  preferDirect: boolean = false
): Promise<SendRealSMSResult> {
  if (!phoneNumber.trim() || !message.trim()) {
    return { success: false, method: 'simulated', error: 'Phone number and message cannot be empty' };
  }

  const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');

  // 1. Try Direct Native SMS on Android if native module is available and preferred
  if (preferDirect && isRealSmsModuleAvailable()) {
    try {
      const perms = await checkPermissionsAsync();
      if (!perms.send) {
        const requested = await requestSmsPermissionsAsync();
        if (!requested.send) {
          throw new Error('SEND_SMS permission denied');
        }
      }
      const sent = await sendDirectSmsAsync(cleanPhone, message);
      if (sent) {
        return { success: true, method: 'direct_native' };
      }
    } catch (e: any) {
      console.warn('Direct send failed, falling back to expo-sms:', e);
    }
  }

  // 2. Try expo-sms (works on all real iOS and Android devices, opens native messaging sheet)
  if (Platform.OS !== 'web') {
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable) {
        const res = await SMS.sendSMSAsync([cleanPhone], message);
        return {
          success: res.result === 'sent' || res.result === 'unknown',
          method: 'expo_sms_ui',
        };
      }
    } catch (err: any) {
      console.warn('expo-sms error:', err);
    }
  }

  // 3. Fallback: sms: URL scheme
  try {
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return { success: true, method: 'url_scheme' };
    }
  } catch (err: any) {
    console.warn('URL scheme error:', err);
  }

  return { success: true, method: 'simulated' };
}

export async function syncRealDeviceInbox(): Promise<{
  threads: SMSThread[];
  count: number;
  error?: string;
}> {
  if (Platform.OS !== 'android') {
    return {
      threads: [],
      count: 0,
      error: Platform.OS === 'ios'
        ? 'Apple iOS does not permit third-party apps to read user SMS inbox for privacy protection.'
        : 'SMS inbox reading is only supported on Android devices with READ_SMS permission.',
    };
  }

  const perms = await checkPermissionsAsync();
  if (!perms.read) {
    const requested = await requestSmsPermissionsAsync();
    if (!requested.read) {
      return { threads: [], count: 0, error: 'READ_SMS permission was not granted by user.' };
    }
  }

  if (!isRealSmsModuleAvailable()) {
    return {
      threads: [],
      count: 0,
      error: 'Real SMS native module is configured and ready. Build a development client with "npx expo run:android" to read live device SMS directly.',
    };
  }

  const records: RealSmsRecord[] = await fetchDeviceInboxMessages(1000);
  if (!records || records.length === 0) {
    return { threads: [], count: 0 };
  }

  // Group real messages by address/thread
  const threadMap = new Map<string, SMSThread>();
  const AVATAR_COLORS = ['#4A90E2', '#50E3C2', '#F5A623', '#E91E63', '#9B51E0', '#27AE60'];

  for (const rec of records) {
    const address = rec.address || 'Unknown';
    const code = extractOTP(rec.body);
    let category: SMSCategory = 'personal';

    if (code) {
      category = 'otp';
    } else if (/bank|chase|bofa|paypal|card|credit|debit|alert|balance/i.test(rec.body)) {
      category = 'banking';
    } else if (/delivery|order|shipping|fedex|ups|amazon|uber/i.test(rec.body)) {
      category = 'promotions';
    }

    const name = rec.contactName || address;

    const msg: SMSMessage = {
      id: `real-msg-${rec.id || Math.random()}`,
      threadId: rec.threadId || address,
      sender: name,
      phoneNumber: address,
      receiptNumber: BACKEND_API.RECEIPT_NUMBER || BACKEND_API.USER_PHONE_NUMBER,
      recipientPhone: rec.recipientPhone || BACKEND_API.RECEIPT_NUMBER || BACKEND_API.USER_PHONE_NUMBER,
      body: rec.body,
      timestamp: rec.date,
      isIncoming: rec.isIncoming,
      isRead: rec.isRead,
      category,
      otpCode: code,
    };

    if (!threadMap.has(address)) {
      threadMap.set(address, {
        id: `real-thread-${rec.threadId || address}`,
        contactName: name,
        phoneNumber: address,
        category,
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        unreadCount: rec.isRead ? 0 : 1,
        lastMessage: msg,
        messages: [msg],
      });
    } else {
      const existing = threadMap.get(address)!;
      const isDup = existing.messages.some(
        (m) =>
          m.id === msg.id ||
          (m.body.trim() === msg.body.trim() && Math.abs(m.timestamp - msg.timestamp) < 60000)
      );
      if (!isDup) {
        existing.messages.push(msg);
        if (!rec.isRead) {
          existing.unreadCount = (existing.unreadCount || 0) + 1;
        }
        if (msg.timestamp > existing.lastMessage.timestamp) {
          existing.lastMessage = msg;
        }
      }
    }
  }

  const resultThreads = Array.from(threadMap.values()).map((t) => ({
    ...t,
    messages: t.messages.sort((a, b) => a.timestamp - b.timestamp),
  }));

  return {
    threads: resultThreads,
    count: records.length,
  };
}

export function setupRealIncomingSMSListener(
  onReceive: (msg: { sender: string; phoneNumber: string; body: string; timestamp: number }) => void
) {
  return subscribeToRealIncomingSMS(onReceive);
}
