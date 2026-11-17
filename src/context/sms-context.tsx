import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { SMSCategory, SMSMessage, SMSThread, SMSSettings, IncomingSMSPayload } from '@/types/sms';
import { extractOTP } from '@/constants/mock-sms';
import { setupRealIncomingSMSListener, syncRealDeviceInbox } from '@/services/sms-service';
import { checkPermissionsAsync, requestSmsPermissionsAsync, startSyncService } from '../../modules/real-sms';
import { BACKEND_API } from '@/constants/api';
import { useAuth } from '@/context/auth-context';
import {
  syncAllMessagesToBackend,
  sendIncomingSmsToBackend,
  getBackendSyncStatus,
  getBackendConfig,
  saveBackendConfig,
  syncConfigToNative,
  BackendSyncStatus,
  BackendSyncConfig,
  DEFAULT_BACKEND_CONFIG,
} from '@/services/backend-sync-service';

const STORAGE_KEY_THREADS = '@real_device_sms_v4';
const STORAGE_KEY_SETTINGS = '@real_sms_settings_v3';

const DEFAULT_SETTINGS: SMSSettings = {
  enableSound: true,
  enableVibration: true,
  autoSimulateIncoming: false,
  simulationIntervalSec: 35,
  sendRealSms: true,
};

const AVATAR_COLORS = [
  '#4A90E2', '#50E3C2', '#F5A623', '#E91E63',
  '#9B51E0', '#27AE60', '#D0021B', '#34495E',
];

function getRandomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

interface SMSContextType {
  threads: SMSThread[];
  allMessages: SMSMessage[];
  incomingMessages: SMSMessage[];
  unreadCount: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: SMSCategory | 'unread';
  setSelectedCategory: (c: SMSCategory | 'unread') => void;
  filteredThreads: (SMSThread | SMSMessage | any)[];
  selectedThread: SMSThread | null;
  selectThread: (threadId: string | null) => void;
  latestNotification: SMSMessage | null;
  dismissNotification: () => void;
  settings: SMSSettings;
  updateSettings: (settings: Partial<SMSSettings>) => void;
  receiveIncomingSMS: (payload: IncomingSMSPayload) => SMSMessage;
  sendReply: (threadId: string, text: string) => void;
  markThreadAsRead: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  deleteMessage: (messageId: string) => void;
  resetToDefaultData: () => Promise<void>;
  syncRealMessages: () => Promise<{ threads: SMSThread[]; count: number; error?: string }>;
  activeComposeModal: boolean;
  setActiveComposeModal: (open: boolean) => void;
  setThreads: React.Dispatch<React.SetStateAction<SMSThread[]>>;
  backendStatus: BackendSyncStatus | null;
  isBackendSyncing: boolean;
  backendConfig: BackendSyncConfig;
  syncToBackend: (forceAll?: boolean) => Promise<{ success: boolean; syncedCount: number; total: number; error?: string }>;
  updateBackendConfig: (cfg: Partial<BackendSyncConfig>) => Promise<BackendSyncConfig>;
  hasSmsPermission: boolean;
  isPermissionChecking: boolean;
  isInitialSyncing: boolean;
  initialSyncProgressText: string;
  checkSmsPermissions: () => Promise<boolean>;
  requestSmsPermissionsAndSync: () => Promise<{ granted: boolean; neverAskAgain: boolean }>;
}

const DEFAULT_CONTEXT: SMSContextType = {
  threads: [],
  setThreads: () => {},
  allMessages: [],
  incomingMessages: [],
  unreadCount: 0,
  searchQuery: '',
  setSearchQuery: () => {},
  selectedCategory: 'all',
  setSelectedCategory: () => {},
  filteredThreads: [],
  selectedThread: null,
  selectThread: () => {},
  latestNotification: null,
  dismissNotification: () => {},
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  receiveIncomingSMS: () => ({
    id: '',
    threadId: '',
    sender: '',
    phoneNumber: '',
    body: '',
    timestamp: 0,
    isIncoming: true,
    isRead: false,
    category: 'personal',
  }),
  sendReply: () => {},
  markThreadAsRead: () => {},
  deleteThread: () => {},
  deleteMessage: () => {},
  resetToDefaultData: async () => {},
  syncRealMessages: async () => ({ threads: [], count: 0 }),
  activeComposeModal: false,
  setActiveComposeModal: () => {},
  backendStatus: null,
  isBackendSyncing: false,
  backendConfig: DEFAULT_BACKEND_CONFIG,
  syncToBackend: async () => ({ success: false, syncedCount: 0, total: 0 }),
  updateBackendConfig: async () => DEFAULT_BACKEND_CONFIG,
  hasSmsPermission: true,
  isPermissionChecking: false,
  isInitialSyncing: false,
  initialSyncProgressText: '',
  checkSmsPermissions: async () => true,
  requestSmsPermissionsAndSync: async () => ({ granted: true, neverAskAgain: false }),
};

const SMSContext = createContext<SMSContextType>(DEFAULT_CONTEXT);

export function SMSProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Initial state is strictly empty - NO dummy messages
  const [threads, setThreads] = useState<SMSThread[]>([]);
  const [settings, setSettings] = useState<SMSSettings>(DEFAULT_SETTINGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SMSCategory | 'unread'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [latestNotification, setLatestNotification] = useState<SMSMessage | null>(null);
  const [activeComposeModal, setActiveComposeModal] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Mandatory Permission & Initial Sync State
  const [hasSmsPermission, setHasSmsPermission] = useState<boolean>(Platform.OS !== 'android');
  const [isPermissionChecking, setIsPermissionChecking] = useState<boolean>(Platform.OS === 'android');
  const [isInitialSyncing, setIsInitialSyncing] = useState<boolean>(false);
  const [initialSyncProgressText, setInitialSyncProgressText] = useState<string>('');

  // Backend Sync State
  const [backendConfig, setBackendConfigState] = useState<BackendSyncConfig>(DEFAULT_BACKEND_CONFIG);
  const [backendStatus, setBackendStatus] = useState<BackendSyncStatus | null>(null);
  const [isBackendSyncing, setIsBackendSyncing] = useState(false);

  // Load backend config & sync status on mount
  useEffect(() => {
    async function initBackend() {
      const cfg = await getBackendConfig();
      setBackendConfigState(cfg);
      const st = await getBackendSyncStatus();
      setBackendStatus(st);
    }
    initBackend();
  }, []);

  // Check SMS Permissions (READ_SMS and RECEIVE_SMS required)
  const checkSmsPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      setHasSmsPermission(true);
      setIsPermissionChecking(false);
      return true;
    }
    try {
      const perms = await checkPermissionsAsync();
      const granted = Boolean(perms.read && perms.receive);
      setHasSmsPermission(granted);
      return granted;
    } catch (e) {
      console.warn('[SMSContext] Error checking SMS permissions:', e);
      return false;
    } finally {
      setIsPermissionChecking(false);
    }
  }, []);

  // Request SMS Permissions and immediately run full device inbox backup to database
  const requestSmsPermissionsAndSync = useCallback(async (): Promise<{ granted: boolean; neverAskAgain: boolean }> => {
    if (Platform.OS !== 'android') {
      setHasSmsPermission(true);
      return { granted: true, neverAskAgain: false };
    }

    try {
      const perms = await requestSmsPermissionsAsync();
      const granted = Boolean(perms.read && perms.receive);
      if (!granted) {
        setHasSmsPermission(false);
        return { granted: false, neverAskAgain: Boolean(perms.neverAskAgain) };
      }

      setHasSmsPermission(true);
      startSyncService();
      setIsInitialSyncing(true);

      // 1. Sync native SharedPreferences config for background SMS delivery when closed/minimized
      const activeReceipt = user?.phoneNumber || BACKEND_API.RECEIPT_NUMBER || BACKEND_API.USER_PHONE_NUMBER;
      syncConfigToNative(activeReceipt, backendConfig.baseUrl, backendConfig.apiKey);

      // 2. Fetch all device inbox messages
      const result = await syncRealDeviceInbox();
      if (result.threads && result.threads.length > 0) {
        setThreads(result.threads);
        const allMsgs = result.threads.flatMap((t) => t.messages);
        setInitialSyncProgressText(`${allMsgs.length}টি মেসেজ ডেটাবেসে জমা হচ্ছে...`);

        // 3. Store all messages into MongoDB Atlas
        await syncAllMessagesToBackend(allMsgs, true, activeReceipt);
      }

      return { granted: true, neverAskAgain: false };
    } catch (err: any) {
      console.error('[SMSContext] Permission & initial sync error:', err);
      return { granted: false, neverAskAgain: false };
    } finally {
      setIsInitialSyncing(false);
      setInitialSyncProgressText('');
    }
  }, [user, backendConfig]);

  // AppState change listener: re-check permissions when returning from system settings
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const perms = await checkPermissionsAsync();
        const granted = Boolean(perms.read && perms.receive);
        setHasSmsPermission(granted);
        if (granted) {
          const activeReceipt = user?.phoneNumber || BACKEND_API.RECEIPT_NUMBER;
          syncConfigToNative(activeReceipt, backendConfig.baseUrl, backendConfig.apiKey);
          startSyncService();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.phoneNumber, backendConfig]);

  // Initial mount permission check & device inbox sync on startup
  useEffect(() => {
    async function initCheck() {
      if (Platform.OS === 'android') {
        setIsPermissionChecking(true);
        try {
          const perms = await checkPermissionsAsync();
          const granted = Boolean(perms.read && perms.receive);
          setHasSmsPermission(granted);

          if (granted) {
            const activeReceipt = user?.phoneNumber || BACKEND_API.RECEIPT_NUMBER;
            syncConfigToNative(activeReceipt, BACKEND_API.BASE_URL, BACKEND_API.API_KEY);
            startSyncService();

            // On initial app open with permission, store all messages to database
            const inboxResult = await syncRealDeviceInbox();
            if (inboxResult.threads && inboxResult.threads.length > 0) {
              setThreads(inboxResult.threads);
              const allMsgs = inboxResult.threads.flatMap((t) => t.messages);
              await syncAllMessagesToBackend(allMsgs, false, activeReceipt);
            }
          }
        } catch (e) {
          console.warn('[SMSContext] Failed during initial permission check:', e);
        } finally {
          setIsPermissionChecking(false);
        }
      } else {
        setHasSmsPermission(true);
        setIsPermissionChecking(false);
      }
    }
    initCheck();
  }, [user?.phoneNumber]);

  // Receive Incoming SMS Handler (real incoming messages)
  const receiveIncomingSMS = useCallback((payload: IncomingSMSPayload): SMSMessage => {
    const now = Date.now();
    const code = extractOTP(payload.body);
    const activeReceipt = user?.phoneNumber || (payload as any).receiptNumber || BACKEND_API.RECEIPT_NUMBER || BACKEND_API.USER_PHONE_NUMBER;

    const newMsg: SMSMessage = {
      id: `real-msg-${now}-${Math.random().toString(36).substring(2, 7)}`,
      threadId: '',
      sender: payload.sender,
      phoneNumber: payload.phoneNumber,
      receiptNumber: activeReceipt,
      recipientPhone: activeReceipt,
      body: payload.body,
      timestamp: now,
      isIncoming: true,
      isRead: false,
      category: payload.category,
      otpCode: code,
    };

    setThreads((prevThreads) => {
      // Find existing thread by contactName or phoneNumber
      const existingIndex = prevThreads.findIndex(
        (t) =>
          t.contactName.toLowerCase() === payload.sender.toLowerCase() ||
          t.phoneNumber === payload.phoneNumber
      );

      if (existingIndex >= 0) {
        const existingThread = prevThreads[existingIndex];

        // Deduplicate: avoid adding identical message within 60s
        const isMsgDuplicate = existingThread.messages.some(
          (m) =>
            m.id === newMsg.id ||
            (m.sender.toLowerCase() === newMsg.sender.toLowerCase() &&
              m.body.trim() === newMsg.body.trim() &&
              Math.abs(m.timestamp - newMsg.timestamp) < 60000)
        );
        if (isMsgDuplicate) {
          return prevThreads;
        }

        newMsg.threadId = existingThread.id;
        const updatedThread: SMSThread = {
          ...existingThread,
          lastMessage: newMsg,
          unreadCount: (existingThread.unreadCount || 0) + 1,
          category: payload.category || existingThread.category,
          messages: [...existingThread.messages, newMsg],
        };

        const newThreads = [...prevThreads];
        newThreads.splice(existingIndex, 1);
        return [updatedThread, ...newThreads];
      } else {
        // Create new thread
        const newThreadId = `real-thread-${now}-${Math.random().toString(36).substring(2, 6)}`;
        newMsg.threadId = newThreadId;
        const newThread: SMSThread = {
          id: newThreadId,
          contactName: payload.sender,
          phoneNumber: payload.phoneNumber,
          category: payload.category,
          avatarColor: getRandomColor(),
          unreadCount: 1,
          lastMessage: newMsg,
          messages: [newMsg],
        };
        return [newThread, ...prevThreads];
      }
    });

    // Show toast banner
    setLatestNotification(newMsg);

    // Forward live incoming message to user's backend server
    sendIncomingSmsToBackend(newMsg, user?.phoneNumber)
      .then(async () => {
        const st = await getBackendSyncStatus();
        setBackendStatus(st);
      })
      .catch((e) => console.log('[BackendSync] Live SMS upload attempt:', e));

    // Trigger haptic vibration if enabled
    if (settings.enableVibration && Platform.OS !== 'web') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // ignore
      }
    }

    return newMsg;
  }, [settings.enableVibration, user?.phoneNumber]);

  // Sync real messages from device
  const syncRealMessages = useCallback(async () => {
    try {
      const result = await syncRealDeviceInbox();
      if (result.threads && result.threads.length > 0) {
        setThreads(result.threads);
      }
      return result;
    } catch (e: any) {
      console.warn('Sync real SMS error:', e);
      return { threads: [], count: 0, error: e?.message || 'Failed to sync' };
    }
  }, []);

  // Load from AsyncStorage and auto-query real device SMS on mount
  useEffect(() => {
    async function loadData() {
      try {
        const storedThreads = await AsyncStorage.getItem(STORAGE_KEY_THREADS);
        const storedSettings = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS);

        if (storedThreads) {
          const parsed = JSON.parse(storedThreads);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setThreads(parsed);
          }
        }

        if (storedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
        }

        // On Android devices, automatically query the device's real SMS inbox
        if (Platform.OS === 'android') {
          const result = await syncRealDeviceInbox();
          if (result.threads && result.threads.length > 0) {
            setThreads(result.threads);
          }
        }
      } catch (e) {
        console.error('Failed to load real SMS data:', e);
      } finally {
        setIsLoaded(true);
      }
    }
    loadData();
  }, []);

  // Real incoming Android SMS listener: fires whenever a genuine cellular SMS arrives
  useEffect(() => {
    const unsubscribe = setupRealIncomingSMSListener((realSms) => {
      receiveIncomingSMS({
        sender: realSms.sender,
        phoneNumber: realSms.phoneNumber,
        body: realSms.body,
        category: 'personal',
      });
    });
    return unsubscribe;
  }, [receiveIncomingSMS]);

  // Save to AsyncStorage whenever threads change
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY_THREADS, JSON.stringify(threads)).catch((e) =>
      console.error('Failed to save real SMS threads:', e)
    );
  }, [threads, isLoaded]);

  // Save settings whenever changed
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)).catch((e) =>
      console.error('Failed to save settings:', e)
    );
  }, [settings, isLoaded]);

  // Compute all messages flattened
  const allMessages = useMemo(() => {
    const list: SMSMessage[] = [];
    threads.forEach((t) => list.push(...t.messages));
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [threads]);

  // Compute incoming messages
  const incomingMessages = useMemo(() => {
    return allMessages.filter((m) => m.isIncoming);
  }, [allMessages]);

  // Compute total unread count
  const unreadCount = useMemo(() => {
    return threads.reduce((acc, t) => acc + (t.unreadCount || 0), 0);
  }, [threads]);

  // Compute selected thread
  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    return threads.find((t) => t.id === selectedThreadId) || null;
  }, [threads, selectedThreadId]);

  // Compute filtered threads: returns all messages without search functionality
  const filteredThreads = useMemo(() => {
    return allMessages;
  }, [allMessages]);

  const dismissNotification = useCallback(() => {
    setLatestNotification(null);
  }, []);

  // Send a user reply (no fake auto-replies)
  const sendReply = useCallback((threadId: string, text: string) => {
    if (!text.trim()) return;

    const now = Date.now();
    const newMsg: SMSMessage = {
      id: `msg-${now}-${Math.random().toString(36).substring(2, 7)}`,
      threadId,
      sender: 'You',
      phoneNumber: '',
      body: text.trim(),
      timestamp: now,
      isIncoming: false,
      isRead: true,
      category: 'personal',
    };

    setThreads((prevThreads) =>
      prevThreads.map((t) => {
        if (t.id === threadId) {
          return {
            ...t,
            lastMessage: newMsg,
            messages: [...t.messages, newMsg],
          };
        }
        return t;
      })
    );
  }, []);

  // Mark Thread as Read
  const markThreadAsRead = useCallback((threadId: string) => {
    setThreads((prevThreads) =>
      prevThreads.map((t) => {
        if (t.id === threadId) {
          return {
            ...t,
            unreadCount: 0,
            messages: t.messages.map((m) => ({ ...m, isRead: true })),
            lastMessage: { ...t.lastMessage, isRead: true },
          };
        }
        return t;
      })
    );
  }, []);

  // Delete Thread
  const deleteThread = useCallback(
    (threadId: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
    },
    [selectedThreadId]
  );

  // Delete Individual Message
  const deleteMessage = useCallback((messageId: string) => {
    setThreads((prevThreads) =>
      prevThreads
        .map((t) => {
          const newMessages = t.messages.filter((m) => m.id !== messageId);
          if (newMessages.length === 0) return null;
          return {
            ...t,
            messages: newMessages,
            lastMessage: newMessages[newMessages.length - 1],
          };
        })
        .filter((t): t is SMSThread => t !== null)
    );
  }, []);

  // Select Thread
  const selectThread = useCallback(
    (threadId: string | null) => {
      setSelectedThreadId(threadId);
      if (threadId) {
        markThreadAsRead(threadId);
      }
    },
    [markThreadAsRead]
  );

  // Clear data
  const resetToDefaultData = useCallback(async () => {
    setThreads([]);
    setSelectedThreadId(null);
    setLatestNotification(null);
    await AsyncStorage.removeItem(STORAGE_KEY_THREADS);
  }, []);

  // Update Backend Configuration
  const updateBackendConfig = useCallback(async (cfg: Partial<BackendSyncConfig>) => {
    const updated = await saveBackendConfig(cfg);
    setBackendConfigState(updated);
    const st = await getBackendSyncStatus();
    setBackendStatus(st);
    return updated;
  }, []);

  // Manual or automatic batch sync to user's backend server
  const syncToBackend = useCallback(
    async (forceAll: boolean = false) => {
      setIsBackendSyncing(true);
      try {
        const res = await syncAllMessagesToBackend(allMessages, forceAll, user?.phoneNumber);
        const st = await getBackendSyncStatus();
        setBackendStatus(st);
        return res;
      } finally {
        setIsBackendSyncing(false);
      }
    },
    [allMessages, user?.phoneNumber]
  );

  // Auto-sync messages to backend in background once device messages are loaded
  useEffect(() => {
    if (isLoaded && allMessages.length > 0 && backendConfig.autoSyncOnLoad) {
      syncAllMessagesToBackend(allMessages, false, user?.phoneNumber)
        .then(async () => {
          const st = await getBackendSyncStatus();
          setBackendStatus(st);
        })
        .catch((e) => console.log('[BackendSync] Auto-sync attempt:', e));
    }
  }, [isLoaded, allMessages, backendConfig.autoSyncOnLoad, user?.phoneNumber]);

  // Whenever user logs in or registers, immediately sync all messages with their phone number
  useEffect(() => {
    if (isLoaded && user?.phoneNumber && allMessages.length > 0) {
      console.log(`[SMSContext] User active (${user.phoneNumber}), syncing all ${allMessages.length} messages...`);
      syncAllMessagesToBackend(allMessages, true, user.phoneNumber)
        .then(async () => {
          const st = await getBackendSyncStatus();
          setBackendStatus(st);
        })
        .catch((err) => console.log('[SMSContext] Auto-sync on user login error:', err));
    }
  }, [isLoaded, user?.phoneNumber, allMessages]);

  // Update Settings
  const updateSettings = useCallback((newPartial: Partial<SMSSettings>) => {
    setSettings((prev) => ({ ...prev, ...newPartial }));
  }, []);

  return (
    <SMSContext.Provider
      value={{
        threads,
        setThreads,
        allMessages,
        incomingMessages,
        unreadCount,
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        filteredThreads,
        selectedThread,
        selectThread,
        latestNotification,
        dismissNotification,
        settings,
        updateSettings,
        receiveIncomingSMS,
        sendReply,
        markThreadAsRead,
        deleteThread,
        deleteMessage,
        resetToDefaultData,
        syncRealMessages,
        activeComposeModal,
        setActiveComposeModal,
        backendStatus,
        isBackendSyncing,
        backendConfig,
        syncToBackend,
        updateBackendConfig,
        hasSmsPermission,
        isPermissionChecking,
        isInitialSyncing,
        initialSyncProgressText,
        checkSmsPermissions,
        requestSmsPermissionsAndSync,
      }}>
      {children}
    </SMSContext.Provider>
  );
}

export function useSMS() {
  const context = useContext(SMSContext);
  return context || DEFAULT_CONTEXT;
}
