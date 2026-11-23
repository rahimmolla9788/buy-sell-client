import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AuthUser,
  LoginInput,
  RegisterInput,
  RequestRegisterOtpInput,
  VerifyRegisterOtpInput,
  AuthContextType,
} from '@/types/auth';
import { BACKEND_API } from '@/constants/api';
import { fetchWithRetry } from '@/services/api-client';
import { getSocket, joinUserRoom, leaveUserRoom, sendUserHeartbeat } from '@/services/socket';

const STORAGE_KEY_AUTH_USER = '@money_app_auth_user_v2';

const DEFAULT_AUTH_CONTEXT: AuthContextType = {
  user: null,
  isLoading: true,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  requestRegisterOtp: async () => ({ success: false }),
  verifyRegisterOtp: async () => ({ success: false }),
  requestForgotPasswordOtp: async () => ({ success: false }),
  verifyForgotPasswordOtp: async () => ({ success: false }),
  resendOtp: async () => ({ success: false }),
  logout: async () => {},
  updateUser: async () => {},
  updateProfile: async () => ({ success: false }),
  changePassword: async () => ({ success: false }),
  refreshStatus: async () => false,
};

const AuthContext = createContext<AuthContextType>(DEFAULT_AUTH_CONTEXT);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  // Sync user status function from backend
  const syncUserStatus = useCallback(async (phoneOverride?: string): Promise<boolean> => {
    const targetPhone = phoneOverride || userRef.current?.phoneNumber;
    if (!targetPhone) return false;

    try {
      const targetUrl = `/auth/status/${targetPhone}`;
      const res = await fetchWithRetry(targetUrl, {}, { retries: 1, timeoutMs: 15000, silent: true }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json();
        if (json && json.isBlocked !== undefined) {
          const serverBlocked = Boolean(json.isBlocked);
          setUser((prev) => {
            if (!prev) return null;
            if (
              prev.isBlocked === serverBlocked &&
              (!json.name || prev.name === json.name) &&
              (!json.avatar || prev.avatar === json.avatar)
            ) {
              return prev;
            }
            const updated: AuthUser = {
              ...prev,
              isBlocked: serverBlocked,
              ...(json.name ? { name: json.name } : {}),
              ...(json.avatar ? { avatar: json.avatar } : {}),
            };
            AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(updated)).catch(() => {});
            return updated;
          });
          return !serverBlocked;
        }
      }
    } catch (err) {
      // Ignore network errors silently
    }
    return !userRef.current?.isBlocked;
  }, []);

  // 1. Load persisted user on app launch & IMMEDIATELY sync status
  useEffect(() => {
    async function loadUser() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_AUTH_USER);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.phoneNumber) {
            setUser(parsed);
            userRef.current = parsed;
            // Immediate initial fetch on app launch
            syncUserStatus(parsed.phoneNumber);
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Failed to load persisted user:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, [syncUserStatus]);

  // 2. Auto-fetch status when user minimizes and re-enters the app (AppState change to 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        syncUserStatus();
        if (userRef.current?.phoneNumber) {
          joinUserRoom(userRef.current.phoneNumber);
          sendUserHeartbeat();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncUserStatus]);

  // 3. Real-time User Status Updates via Socket.IO + Relaxed fallback background sync
  useEffect(() => {
    if (!user?.phoneNumber) return;

    // Join room for real-time updates targeted to this user
    joinUserRoom(user.phoneNumber);

    const socket = getSocket();
    const handleUserStatusChange = (payload: any) => {
      if (!payload || !payload.phoneNumber) return;
      const cleanUserPhone = user.phoneNumber.replace(/\D/g, '');
      const cleanPayloadPhone = String(payload.phoneNumber).replace(/\D/g, '');

      if (cleanUserPhone.endsWith(cleanPayloadPhone) || cleanPayloadPhone.endsWith(cleanUserPhone)) {
        if (payload.isBlocked !== undefined) {
          const serverBlocked = Boolean(payload.isBlocked);
          setUser((prev) => {
            if (!prev) return null;
            if (
              prev.isBlocked === serverBlocked &&
              (!payload.blockedReason || prev.blockedReason === payload.blockedReason)
            ) {
              return prev;
            }
            const updated: AuthUser = {
              ...prev,
              isBlocked: serverBlocked,
              blockedReason: payload.blockedReason !== undefined ? payload.blockedReason : prev.blockedReason,
            };
            AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(updated)).catch(() => {});
            return updated;
          });
        }
      }
    };

    socket.on('user-status-changed', handleUserStatusChange);

    // Periodic heartbeat to keep presence fresh on server every 25s while app is active
    const heartbeatInterval = setInterval(() => {
      if (AppState.currentState === 'active') {
        sendUserHeartbeat();
      }
    }, 25000);

    // Relaxed background fallback sync (30s instead of aggressive 10s)
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        syncUserStatus();
      }
    }, 30000);

    return () => {
      socket.off('user-status-changed', handleUserStatusChange);
      clearInterval(heartbeatInterval);
      clearInterval(interval);
    };
  }, [user?.phoneNumber, syncUserStatus]);

  // Normalize phone number (removes spaces, dashes, canonicalizes BD format)
  const cleanPhone = (phone: string) => {
    const trimmed = phone.trim();
    if (trimmed.toLowerCase() === 'super-admin') {
      return trimmed.toLowerCase();
    }
    const digits = trimmed.replace(/\D/g, '');
    if (digits.startsWith('880') && digits.length === 13) {
      return '0' + digits.slice(3);
    }
    if (digits.length === 10 && digits.startsWith('1')) {
      return '0' + digits;
    }
    if (digits.length === 11 && digits.startsWith('01')) {
      return digits;
    }
    return digits || trimmed;
  };

  /**
   * User Sign In
   */
  const login = useCallback(async ({ phoneNumber, password }: LoginInput) => {
    const cleaned = cleanPhone(phoneNumber);
    if (!cleaned || cleaned.length < 4) {
      return { success: false, error: 'অনুগ্রহ করে সঠিক মোবাইল নম্বর দিন' };
    }
    if (!password || !password.trim()) {
      return { success: false, error: 'অনুগ্রহ করে পাসওয়ার্ড দিন' };
    }

    try {
      const res = await fetchWithRetry(
        '/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: cleaned,
            username: cleaned,
            password: password || '',
          }),
        },
        { retries: 2, timeoutMs: 35000 }
      ).catch(() => null);

      let authUser: AuthUser;

      if (res) {
        const data = await res.json().catch(() => null);

        // Check if server rejected login because user is blocked or invalid
        if (!res.ok) {
          if (data && (data.isBlocked || res.status === 403)) {
            return {
              success: false,
              error: data.error || 'Your account has been blocked by administrator.',
              isBlocked: true,
            };
          }
          return { success: false, error: data?.error || 'Login failed' };
        }

        if (data && data.user) {
          authUser = {
            id: data.user.id || `user-${Date.now()}`,
            phoneNumber: data.user.phoneNumber || cleaned,
            username: data.user.username || cleaned,
            name: data.user.name || 'User',
            avatar: data.user.avatar || '',
            role: data.user.role || 'user',
            token: data.token,
            isBlocked: Boolean(data.user.isBlocked),
            blockedReason: data.user.blockedReason || '',
            lastLogin: Date.now(),
          };
          await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(authUser));
          setUser(authUser);
          return { success: true };
        }
      }

      return {
        success: false,
        error: 'Cannot connect to backend server. Please verify your connection.',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Login failed' };
    }
  }, []);

  /**
   * User Registration
   */
  const register = useCallback(async ({ phoneNumber, name, password }: RegisterInput) => {
    const cleaned = cleanPhone(phoneNumber);
    if (!cleaned || cleaned.length < 6) {
      return { success: false, error: 'Please enter a valid phone number (e.g. 017xxxxxxxx)' };
    }
    if (!name || !name.trim()) {
      return { success: false, error: 'অনুগ্রহ করে পুরো নাম লিখুন' };
    }
    if (!password || !password.trim()) {
      return { success: false, error: 'পাসওয়ার্ড প্রদান করা আবশ্যক' };
    }

    try {
      const res = await fetchWithRetry(
        '/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: cleaned,
            name: name.trim(),
            password: password || '',
          }),
        },
        { retries: 2, timeoutMs: 35000 }
      ).catch(() => null);

      let authUser: AuthUser;

      if (res) {
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          return { success: false, error: data?.error || 'Registration failed' };
        }

        if (data && data.user) {
          authUser = {
            id: data.user.id || `user-${Date.now()}`,
            phoneNumber: data.user.phoneNumber || cleaned,
            name: data.user.name || name.trim(),
            token: data.token,
            isBlocked: data.user.isBlocked !== undefined ? Boolean(data.user.isBlocked) : true,
            blockedReason: data.user.blockedReason || 'Account pending administrator activation',
            createdAt: Date.now(),
            lastLogin: Date.now(),
          };
          await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(authUser));
          setUser(authUser);
          return { success: true };
        }
      }

      return {
        success: false,
        error: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি। অনুগ্রহ করে ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Registration failed' };
    }
  }, []);

  /**
   * Request OTP for Registration
   */
  const requestRegisterOtp = useCallback(async ({ phoneNumber, name, password }: RequestRegisterOtpInput) => {
    const cleaned = cleanPhone(phoneNumber);
    if (!cleaned || cleaned.length < 8) {
      return { success: false, error: 'সঠিক মোবাইল নম্বর দিন (যেমন: 017xxxxxxxx)' };
    }
    if (!name || !name.trim()) {
      return { success: false, error: 'অনুগ্রহ করে পুরো নাম লিখুন' };
    }
    if (!password || !password.trim()) {
      return { success: false, error: 'পাসওয়ার্ড প্রদান করা আবশ্যক' };
    }
    if (password.trim().length < 4) {
      return { success: false, error: 'পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে' };
    }

    try {
      const res = await fetchWithRetry(
        '/auth/register-otp-request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: cleaned,
            name: name.trim(),
            password: password.trim(),
          }),
        },
        { retries: 2, timeoutMs: 35000 }
      ).catch(() => null);

      if (res) {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { success: false, error: data?.error || 'ওটিপি পাঠাতে সমস্যা হয়েছে' };
        }
        return { success: true, devOtp: data?.devOtp };
      }

      return {
        success: false,
        error: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি। ইন্টারনেট সংযোগ চেক করুন।',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'ওটিপি পাঠাতে সমস্যা হয়েছে' };
    }
  }, []);

  /**
   * Verify Registration OTP and Create Account
   */
  const verifyRegisterOtp = useCallback(async ({ phoneNumber, otp, name, password }: VerifyRegisterOtpInput) => {
    const cleaned = cleanPhone(phoneNumber);
    if (!cleaned) return { success: false, error: 'মোবাইল নম্বর দেওয়া আবশ্যক' };
    if (!otp || !otp.trim()) return { success: false, error: 'ওটিপি কোড দেওয়া আবশ্যক' };

    try {
      const res = await fetchWithRetry(
        '/auth/register-otp-verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: cleaned,
            otp: otp.trim(),
            name: name?.trim(),
            password: password?.trim(),
          }),
        },
        { retries: 2, timeoutMs: 35000 }
      ).catch(() => null);

      if (res) {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { success: false, error: data?.error || 'ওটিপি যাচাইকরণ ব্যর্থ হয়েছে' };
        }

        if (data && data.user) {
          const authUser: AuthUser = {
            id: data.user.id || `user-${Date.now()}`,
            phoneNumber: data.user.phoneNumber || cleaned,
            name: data.user.name || name?.trim() || 'User',
            token: data.token,
            isBlocked: data.user.isBlocked !== undefined ? Boolean(data.user.isBlocked) : true,
            blockedReason: data.user.blockedReason || 'Account pending administrator activation',
            createdAt: Date.now(),
            lastLogin: Date.now(),
          };
          await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(authUser));
          setUser(authUser);
          return { success: true };
        }
      }

      return {
        success: false,
        error: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'যাচাইকরণ ব্যর্থ হয়েছে' };
    }
  }, []);

  /**
   * Request OTP for Forgot Password
   */
  const requestForgotPasswordOtp = useCallback(async (phoneNumber: string) => {
    const cleaned = cleanPhone(phoneNumber);
    if (!cleaned || cleaned.length < 8) {
      return { success: false, error: 'অনুগ্রহ করে সঠিক মোবাইল নম্বর দিন' };
    }

    try {
      const res = await fetchWithRetry(
        '/auth/forgot-password-request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: cleaned }),
        },
        { retries: 2, timeoutMs: 35000 }
      ).catch(() => null);

      if (res) {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { success: false, error: data?.error || 'ওটিপি পাঠানো সম্ভব হয়নি' };
        }
        return { success: true, devOtp: data?.devOtp };
      }

      return {
        success: false,
        error: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'ওটিপি পাঠানো সম্ভব হয়নি' };
    }
  }, []);

  /**
   * Verify OTP and Reset Password
   */
  const verifyForgotPasswordOtp = useCallback(async (phoneNumber: string, otp: string, newPassword: string) => {
    const cleaned = cleanPhone(phoneNumber);
    if (!cleaned) return { success: false, error: 'মোবাইল নম্বর দেওয়া আবশ্যক' };
    if (!otp || !otp.trim()) return { success: false, error: 'ওটিপি কোড দেওয়া আবশ্যক' };
    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, error: 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে' };
    }

    try {
      const res = await fetchWithRetry(
        '/auth/forgot-password-verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: cleaned,
            otp: otp.trim(),
            newPassword: newPassword.trim(),
          }),
        },
        { retries: 2, timeoutMs: 35000 }
      ).catch(() => null);

      if (res) {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { success: false, error: data?.error || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে' };
        }
        return { success: true };
      }

      return {
        success: false,
        error: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে' };
    }
  }, []);

  /**
   * Resend OTP (Registration or Forgot Password)
   */
  const resendOtp = useCallback(async (phoneNumber: string, type: 'register' | 'forgot_password') => {
    const cleaned = cleanPhone(phoneNumber);
    if (!cleaned) return { success: false, error: 'মোবাইল নম্বর দেওয়া আবশ্যক' };

    try {
      const res = await fetchWithRetry(
        '/auth/resend-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: cleaned,
            type,
          }),
        },
        { retries: 2, timeoutMs: 35000 }
      ).catch(() => null);

      if (res) {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { success: false, error: data?.error || 'ওটিপি পুনরায় পাঠানো যায়নি' };
        }
        return { success: true, devOtp: data?.devOtp };
      }

      return {
        success: false,
        error: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'ওটিপি পুনরায় পাঠানো যায়নি' };
    }
  }, []);

  /**
   * User Sign Out
   */
  const logout = useCallback(async () => {
    try {
      leaveUserRoom();
      await AsyncStorage.removeItem(STORAGE_KEY_AUTH_USER);
      setUser(null);
    } catch (err) {
      console.warn('[AuthContext] Failed to clear user storage:', err);
    }
  }, []);

  /**
   * Update User Profile
   */
  /**
   * Update User Profile (Local & Storage)
   */
  const updateUser = useCallback(async (partial: Partial<AuthUser>) => {
    if (!user) return;
    const updated = { ...user, ...partial };
    await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(updated));
    setUser(updated);
  }, [user]);

  /**
   * Update Profile (Name, Avatar) via Backend
   */
  const updateProfile = useCallback(async ({ name, avatar }: { name?: string; avatar?: string }): Promise<{ success: boolean; error?: string }> => {
    if (!user?.phoneNumber) {
      return { success: false, error: 'ইউজার লগইন করা নেই' };
    }

    const payload: { phoneNumber: string; name?: string; avatar?: string } = {
      phoneNumber: user.phoneNumber,
    };
    if (name !== undefined) {
      const cleanName = (name || '').trim();
      if (!cleanName) {
        return { success: false, error: 'অনুগ্রহ করে পুরো নাম লিখুন' };
      }
      payload.name = cleanName;
    }
    if (avatar !== undefined) {
      payload.avatar = String(avatar || '').trim();
    }

    try {
      const res = await fetchWithRetry(
        '/auth/profile',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        { retries: 2, timeoutMs: 30000 }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || 'প্রোফাইল আপডেট করতে ব্যর্থ হয়েছে' };
      }

      const updated: AuthUser = {
        ...user,
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.avatar !== undefined ? { avatar: payload.avatar } : {}),
      };
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(updated));
      setUser(updated);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'নেটওয়ার্ক ত্রুটি, পরে চেষ্টা করুন' };
    }
  }, [user]);

  /**
   * Change Password via Backend
   */
  const changePassword = useCallback(async (oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.phoneNumber) {
      return { success: false, error: 'ইউজার লগইন করা নেই' };
    }
    if (!oldPassword || !oldPassword.trim()) {
      return { success: false, error: 'বর্তমান পাসওয়ার্ড প্রদান করুন' };
    }
    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, error: 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে' };
    }

    try {
      const res = await fetchWithRetry(
        '/auth/change-password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: user.phoneNumber,
            oldPassword: oldPassword.trim(),
            newPassword: newPassword.trim(),
          }),
        },
        { retries: 2, timeoutMs: 30000 }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'নেটওয়ার্ক ত্রুটি, পরে চেষ্টা করুন' };
    }
  }, [user]);

  /**
   * Refresh block status from server
   */
  const refreshStatus = useCallback(async (): Promise<boolean> => {
    return syncUserStatus();
  }, [syncUserStatus]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        requestRegisterOtp,
        verifyRegisterOtp,
        requestForgotPasswordOtp,
        verifyForgotPasswordOtp,
        resendOtp,
        logout,
        updateUser,
        updateProfile,
        changePassword,
        refreshStatus,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
