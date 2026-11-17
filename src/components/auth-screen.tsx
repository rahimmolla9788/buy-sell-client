import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { useSMS } from '@/context/sms-context';

interface AuthScreenProps {
  onSuccess?: () => void;
}

type AuthMode =
  | 'signin'
  | 'register'
  | 'register_otp'
  | 'forgot_password_request'
  | 'forgot_password_otp';

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const {
    login,
    requestRegisterOtp,
    verifyRegisterOtp,
    requestForgotPasswordOtp,
    verifyForgotPasswordOtp,
    resendOtp,
  } = useAuth();
  const { syncToBackend } = useSMS();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Pending verification state
  const [pendingRegisterData, setPendingRegisterData] = useState({
    phoneNumber: '',
    name: '',
    password: '',
  });
  const [pendingForgotPhone, setPendingForgotPhone] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  // Keyboard height listener
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Resend OTP countdown timer
  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendTimer]);

  const triggerHaptic = (type: 'error' | 'success' | 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (type === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (type === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {}
  };

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (resendTimer > 0 || isSubmitting) return;
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);
    triggerHaptic('light');

    try {
      const type = mode === 'register_otp' ? 'register' : 'forgot_password';
      const targetPhone =
        mode === 'register_otp' ? pendingRegisterData.phoneNumber : pendingForgotPhone;
      const res = await resendOtp(targetPhone, type);
      if (res.success) {
        setResendTimer(60);
        setSuccessMessage('আপনার নম্বরে নতুন ওটিপি কোড পাঠানো হয়েছে।');
        triggerHaptic('success');
      } else {
        setErrorMessage(res.error || 'ওটিপি পাঠাতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
        triggerHaptic('error');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'ওটিপি পাঠানো যায়নি।');
      triggerHaptic('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Handler for all modes
  const handleSubmit = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    // Flow 1: Normal Sign In
    if (mode === 'signin') {
      const rawInput = phoneNumber.trim();
      const isNamedUser = rawInput.toLowerCase() === 'super-admin' || !/^\+?\d+$/.test(rawInput);
      const cleanPhone = isNamedUser ? rawInput.toLowerCase() : rawInput.replace(/[^\d+]/g, '');

      if (!cleanPhone) {
        setErrorMessage('অনুগ্রহ করে আপনার মোবাইল নম্বর দিন।');
        triggerHaptic('error');
        return;
      }
      if (!isNamedUser && cleanPhone.length < 8) {
        setErrorMessage('মোবাইল নম্বর কমপক্ষে ৮ ডিজিটের হতে হবে (যেমন: 017xxxxxxxx)।');
        triggerHaptic('error');
        return;
      }
      const cleanPassword = password.trim();
      if (!cleanPassword) {
        setErrorMessage('অনুগ্রহ করে পাসওয়ার্ড দিন।');
        triggerHaptic('error');
        return;
      }
      if (cleanPassword.length < 4) {
        setErrorMessage('পাসওয়ার্ড কমপক্ষে ৪ ডিজিট বা অক্ষরের হতে হবে।');
        triggerHaptic('error');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await login({ phoneNumber: cleanPhone, password });
        if (res.success) {
          triggerHaptic('success');
          syncToBackend(true).catch(() => {});
          onSuccess?.();
        } else {
          setErrorMessage(res.error || 'লগইন করা সম্ভব হয়নি। মোবাইল নম্বর বা পাসওয়ার্ড চেক করুন।');
          triggerHaptic('error');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'লগইন প্রক্রিয়ায় সমস্যা হয়েছে।');
        triggerHaptic('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Flow 2: Register - Step 1 (Request OTP)
    if (mode === 'register') {
      const rawInput = phoneNumber.trim();
      const cleanPhone = rawInput.replace(/[^\d+]/g, '');

      if (!name.trim()) {
        setErrorMessage('অনুগ্রহ করে আপনার পুরো নাম লিখুন।');
        triggerHaptic('error');
        return;
      }
      if (!cleanPhone || cleanPhone.length < 8) {
        setErrorMessage('অনুগ্রহ করে সঠিক মোবাইল নম্বর দিন (যেমন: 017xxxxxxxx)।');
        triggerHaptic('error');
        return;
      }
      const cleanPassword = password.trim();
      if (!cleanPassword) {
        setErrorMessage('অনুগ্রহ করে পাসওয়ার্ড দিন।');
        triggerHaptic('error');
        return;
      }
      if (cleanPassword.length < 4) {
        setErrorMessage('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
        triggerHaptic('error');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await requestRegisterOtp({
          phoneNumber: cleanPhone,
          name: name.trim(),
          password: cleanPassword,
        });

        if (res.success) {
          triggerHaptic('success');
          setPendingRegisterData({
            phoneNumber: cleanPhone,
            name: name.trim(),
            password: cleanPassword,
          });
          setOtp('');
          setResendTimer(60);
          setSuccessMessage('আপনার নম্বরে একটি ৬ ডিজিটের ওটিপি (OTP) পাঠানো হয়েছে।');
          setMode('register_otp');
        } else {
          setErrorMessage(res.error || 'ওটিপি পাঠাতে সমস্যা হয়েছে।');
          triggerHaptic('error');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'ওটিপি পাঠাতে সমস্যা হয়েছে।');
        triggerHaptic('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Flow 3: Register - Step 2 (Verify OTP & Complete Registration)
    if (mode === 'register_otp') {
      const cleanOtp = otp.trim();
      if (!cleanOtp || cleanOtp.length < 4) {
        setErrorMessage('অনুগ্রহ করে আপনার ফোনে পাওয়া ওটিপি কোডটি লিখুন।');
        triggerHaptic('error');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await verifyRegisterOtp({
          phoneNumber: pendingRegisterData.phoneNumber,
          otp: cleanOtp,
          name: pendingRegisterData.name,
          password: pendingRegisterData.password,
        });

        if (res.success) {
          triggerHaptic('success');
          syncToBackend(true).catch(() => {});
          onSuccess?.();
        } else {
          setErrorMessage(res.error || 'ওটিপি যাচাইকরণ ব্যর্থ হয়েছে। অনুগ্রহ করে সঠিক কোড দিন।');
          triggerHaptic('error');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'ওটিপি যাচাইকরণে ত্রুটি হয়েছে।');
        triggerHaptic('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Flow 4: Forgot Password - Step 1 (Request OTP)
    if (mode === 'forgot_password_request') {
      const rawInput = phoneNumber.trim();
      const cleanPhone = rawInput.replace(/[^\d+]/g, '');

      if (!cleanPhone || cleanPhone.length < 8) {
        setErrorMessage('অনুগ্রহ করে আপনার নিবন্ধিত মোবাইল নম্বর দিন।');
        triggerHaptic('error');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await requestForgotPasswordOtp(cleanPhone);
        if (res.success) {
          triggerHaptic('success');
          setPendingForgotPhone(cleanPhone);
          setOtp('');
          setPassword('');
          setConfirmPassword('');
          setResendTimer(60);
          setSuccessMessage('পাসওয়ার্ড রিসেটের ওটিপি আপনার নম্বরে পাঠানো হয়েছে।');
          setMode('forgot_password_otp');
        } else {
          setErrorMessage(res.error || 'ওটিপি পাঠানো সম্ভব হয়নি। নম্বরটি সঠিক কিনা পরীক্ষা করুন।');
          triggerHaptic('error');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'ওটিপি পাঠানো সম্ভব হয়নি।');
        triggerHaptic('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Flow 5: Forgot Password - Step 2 (Verify OTP & Reset Password)
    if (mode === 'forgot_password_otp') {
      const cleanOtp = otp.trim();
      if (!cleanOtp || cleanOtp.length < 4) {
        setErrorMessage('অনুগ্রহ করে ৬ ডিজিটের ওটিপি কোড দিন।');
        triggerHaptic('error');
        return;
      }
      const cleanPass = password.trim();
      if (!cleanPass || cleanPass.length < 4) {
        setErrorMessage('নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
        triggerHaptic('error');
        return;
      }
      if (cleanPass !== confirmPassword.trim()) {
        setErrorMessage('উভয় পাসওয়ার্ড একই হতে হবে।');
        triggerHaptic('error');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await verifyForgotPasswordOtp(pendingForgotPhone, cleanOtp, cleanPass);
        if (res.success) {
          triggerHaptic('success');
          setPhoneNumber(pendingForgotPhone);
          setPassword('');
          setConfirmPassword('');
          setOtp('');
          setMode('signin');
          setSuccessMessage('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে! এখন লগইন করুন।');
        } else {
          setErrorMessage(res.error || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে। ওটিপি কোড চেক করুন।');
          triggerHaptic('error');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'পাসওয়ার্ড পরিবর্তনে সমস্যা হয়েছে।');
        triggerHaptic('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.statusBarArea} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                justifyContent: keyboardHeight > 0 ? 'flex-start' : 'center',
                paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 40,
                paddingTop: keyboardHeight > 0 ? 8 : 20,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            
            {/* Header Brand */}
            <View style={[styles.brandContainer, keyboardHeight > 0 && { marginBottom: 8 }]}>
              {keyboardHeight === 0 && (
                <View style={styles.logoBadge}>
                  <Image
                    source={require('@/assets/images/icon.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              )}
              <ThemedText type="title" style={[styles.appTitle, keyboardHeight > 0 && { fontSize: 20 }]}>
                {mode === 'forgot_password_request' || mode === 'forgot_password_otp'
                  ? 'পাসওয়ার্ড রিসেট'
                  : 'Buy & Sell BD'}
              </ThemedText>
              {keyboardHeight === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.appSubtitle}>
                  {mode === 'register_otp'
                    ? 'মোবাইল নম্বর ওটিপি দিয়ে যাচাই করুন'
                    : mode === 'forgot_password_request' || mode === 'forgot_password_otp'
                    ? 'সহজে আপনার পাসওয়ার্ড পরিবর্তন করুন'
                    : 'সেকেন্ড হ্যান্ড পণ্য কেনাবেচার বিশ্বস্ত বাজার'}
                </ThemedText>
              )}
            </View>

            {/* Mode Switcher Tabs (Only on Sign In or Initial Register) */}
            {(mode === 'signin' || mode === 'register') && (
              <View style={[styles.tabContainer, keyboardHeight > 0 && { marginBottom: 12 }]}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    setMode('signin');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  style={[styles.tabBtn, mode === 'signin' && styles.tabBtnActive]}>
                  <Ionicons
                    name="log-in-outline"
                    size={18}
                    color={mode === 'signin' ? '#ffffff' : '#8E8E93'}
                  />
                  <ThemedText
                    style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
                    লগইন
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    setMode('register');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  style={[styles.tabBtn, mode === 'register' && styles.tabBtnActive]}>
                  <Ionicons
                    name="person-add-outline"
                    size={18}
                    color={mode === 'register' ? '#ffffff' : '#8E8E93'}
                  />
                  <ThemedText
                    style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                    রেজিস্টার
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Success Message Banner */}
            {successMessage ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color="#30D158" style={{ marginTop: 2 }} />
                <ThemedText style={styles.successBoxText}>{successMessage}</ThemedText>
              </View>
            ) : null}

            {/* Error Message Banner */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#FF453A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 6 }}>
                  <ThemedText style={styles.errorBoxText}>{errorMessage}</ThemedText>
                  {mode === 'register' &&
                    (errorMessage.includes('ইতিমধ্যে') || errorMessage.includes('already exists')) && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('light');
                          setMode('signin');
                          setErrorMessage('');
                          setSuccessMessage('');
                        }}
                        style={styles.switchModePrompt}>
                        <ThemedText style={styles.switchModePromptText}>
                          👉 এখনই লগইন করুন
                        </ThemedText>
                      </Pressable>
                    )}
                </View>
              </View>
            ) : null}

            {/* Form Card */}
            <View style={styles.formCard}>
              {/* ============================================================== */}
              {/* MODE 1: SIGN IN                                                */}
              {/* ============================================================== */}
              {mode === 'signin' && (
                <>
                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      মোবাইল নম্বর *
                    </ThemedText>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="call-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="যেমন: 017xxxxxxxx"
                        placeholderTextColor="#94A3B8"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        keyboardType="default"
                        autoCapitalize="none"
                        autoComplete="username"
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <ThemedText type="small" style={styles.inputLabel}>
                        পাসওয়ার্ড *
                      </ThemedText>
                      <Pressable
                        onPress={() => {
                          triggerHaptic('light');
                          setMode('forgot_password_request');
                          setErrorMessage('');
                          setSuccessMessage('');
                        }}>
                        <ThemedText style={styles.forgotPasswordLink}>
                          পাসওয়ার্ড ভুলে গেছেন?
                        </ThemedText>
                      </Pressable>
                    </View>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="পাসওয়ার্ড লিখুন"
                        placeholderTextColor="#94A3B8"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeBtn}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color="#6B7280"
                        />
                      </Pressable>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && styles.submitBtnPressed,
                      isSubmitting && styles.submitBtnDisabled,
                    ]}>
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" />
                        <ThemedText style={styles.submitBtnText}>লগইন করুন</ThemedText>
                      </>
                    )}
                  </Pressable>
                </>
              )}

              {/* ============================================================== */}
              {/* MODE 2: REGISTER (Step 1: Enter Info -> Send OTP)              */}
              {/* ============================================================== */}
              {mode === 'register' && (
                <>
                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      আপনার পুরো নাম *
                    </ThemedText>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="যেমন: MD Rahim"
                        placeholderTextColor="#94A3B8"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      মোবাইল নম্বর * (যাচাইয়ের জন্য ওটিপি যাবে)
                    </ThemedText>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="call-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="যেমন: 017xxxxxxxx"
                        placeholderTextColor="#94A3B8"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                        autoComplete="tel"
                      />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.helperText}>
                      এই নম্বরে এসএমএস এর মাধ্যমে ভেরিফিকেশন ওটিপি কোড পাঠানো হবে।
                    </ThemedText>
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      পাসওয়ার্ড নির্ধারণ করুন *
                    </ThemedText>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="পাসওয়ার্ড লিখুন (কমপক্ষে ৪ অক্ষরের)"
                        placeholderTextColor="#94A3B8"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeBtn}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color="#6B7280"
                        />
                      </Pressable>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && styles.submitBtnPressed,
                      isSubmitting && styles.submitBtnDisabled,
                    ]}>
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="send-outline" size={18} color="#ffffff" />
                        <ThemedText style={styles.submitBtnText}>ওটিপি পাঠান ও এগিয়ে যান</ThemedText>
                      </>
                    )}
                  </Pressable>
                </>
              )}

              {/* ============================================================== */}
              {/* MODE 3: REGISTER OTP VERIFICATION (Step 2: Enter OTP)          */}
              {/* ============================================================== */}
              {mode === 'register_otp' && (
                <>
                  <View style={styles.otpHeaderCard}>
                    <View style={styles.otpShieldIcon}>
                      <Ionicons name="shield-checkmark" size={26} color="#0A84FF" />
                    </View>
                    <ThemedText style={styles.otpCardTitle}>মোবাইল নম্বর যাচাইকরণ</ThemedText>
                    <ThemedText style={styles.otpCardSubtitle}>
                      ({pendingRegisterData.phoneNumber})-এ প্রেরিত ৬ ডিজিটের ওটিপি কোড লিখুন
                    </ThemedText>
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      ৬ ডিজিটের ওটিপি কোড (OTP) *
                    </ThemedText>
                    <View style={[styles.inputWrapper, styles.otpInputWrapper]}>
                      <TextInput
                        style={[styles.textInput, styles.otpTextInput]}
                        placeholder="••••••"
                        placeholderTextColor="#94A3B8"
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                      />
                    </View>
                  </View>

                  {/* Resend OTP Row */}
                  <View style={styles.resendRow}>
                    {resendTimer > 0 ? (
                      <ThemedText style={styles.timerText}>
                        পুনরায় ওটিপি পাঠান ({resendTimer} সেকেন্ড)
                      </ThemedText>
                    ) : (
                      <Pressable onPress={handleResendOtp} disabled={isSubmitting}>
                        <ThemedText style={styles.resendActiveText}>
                          🔄 পুনরায় ওটিপি কোড পাঠান
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>

                  <Pressable
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && styles.submitBtnPressed,
                      isSubmitting && styles.submitBtnDisabled,
                    ]}>
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done-circle-outline" size={20} color="#ffffff" />
                        <ThemedText style={styles.submitBtnText}>যাচাই করুন ও সম্পন্ন করুন</ThemedText>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      triggerHaptic('light');
                      setMode('register');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    style={styles.backBtn}>
                    <ThemedText style={styles.backBtnText}>← তথ্য পরিবর্তন করুন</ThemedText>
                  </Pressable>
                </>
              )}

              {/* ============================================================== */}
              {/* MODE 4: FORGOT PASSWORD REQUEST (Step 1: Enter Phone)           */}
              {/* ============================================================== */}
              {mode === 'forgot_password_request' && (
                <>
                  <View style={styles.otpHeaderCard}>
                    <View style={styles.otpShieldIcon}>
                      <Ionicons name="key-outline" size={26} color="#0A84FF" />
                    </View>
                    <ThemedText style={styles.otpCardTitle}>পাসওয়ার্ড ভুলে গেছেন?</ThemedText>
                    <ThemedText style={styles.otpCardSubtitle}>
                      আপনার নিবন্ধিত মোবাইল নম্বর দিন। আমরা পাসওয়ার্ড রিসেটের জন্য একটি ওটিপি কোড পাঠাব।
                    </ThemedText>
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      নিবন্ধিত মোবাইল নম্বর *
                    </ThemedText>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="call-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="যেমন: 017xxxxxxxx"
                        placeholderTextColor="#94A3B8"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                        autoFocus
                      />
                    </View>
                  </View>

                  <Pressable
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && styles.submitBtnPressed,
                      isSubmitting && styles.submitBtnDisabled,
                    ]}>
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="send-outline" size={18} color="#ffffff" />
                        <ThemedText style={styles.submitBtnText}>ওটিপি কোড পাঠান</ThemedText>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      triggerHaptic('light');
                      setMode('signin');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    style={styles.backBtn}>
                    <ThemedText style={styles.backBtnText}>← লগইন স্ক্রিনে ফিরে যান</ThemedText>
                  </Pressable>
                </>
              )}

              {/* ============================================================== */}
              {/* MODE 5: FORGOT PASSWORD OTP & NEW PASSWORD (Step 2: Reset)      */}
              {/* ============================================================== */}
              {mode === 'forgot_password_otp' && (
                <>
                  <View style={styles.otpHeaderCard}>
                    <View style={styles.otpShieldIcon}>
                      <Ionicons name="lock-open-outline" size={26} color="#0A84FF" />
                    </View>
                    <ThemedText style={styles.otpCardTitle}>নতুন পাসওয়ার্ড সেট করুন</ThemedText>
                    <ThemedText style={styles.otpCardSubtitle}>
                      ({pendingForgotPhone})-এ পাঠানো ওটিপি কোড ও নতুন পাসওয়ার্ড লিখুন
                    </ThemedText>
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      ৬ ডিজিটের ওটিপি কোড (OTP) *
                    </ThemedText>
                    <View style={[styles.inputWrapper, styles.otpInputWrapper]}>
                      <TextInput
                        style={[styles.textInput, styles.otpTextInput]}
                        placeholder="••••••"
                        placeholderTextColor="#94A3B8"
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                      />
                    </View>
                  </View>

                  {/* Resend Row */}
                  <View style={styles.resendRow}>
                    {resendTimer > 0 ? (
                      <ThemedText style={styles.timerText}>
                        পুনরায় ওটিপি পাঠান ({resendTimer} সেকেন্ড)
                      </ThemedText>
                    ) : (
                      <Pressable onPress={handleResendOtp} disabled={isSubmitting}>
                        <ThemedText style={styles.resendActiveText}>
                          🔄 পুনরায় ওটিপি কোড পাঠান
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      নতুন পাসওয়ার্ড *
                    </ThemedText>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="নতুন পাসওয়ার্ড (কমপক্ষে ৪ অক্ষরের)"
                        placeholderTextColor="#94A3B8"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeBtn}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color="#6B7280"
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText type="small" style={styles.inputLabel}>
                      নতুন পাসওয়ার্ড নিশ্চিত করুন *
                    </ThemedText>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="shield-outline" size={20} color="#0A84FF" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="আবার নতুন পাসওয়ার্ড লিখুন"
                        placeholderTextColor="#94A3B8"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                      />
                      <Pressable
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeBtn}>
                        <Ionicons
                          name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color="#6B7280"
                        />
                      </Pressable>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && styles.submitBtnPressed,
                      isSubmitting && styles.submitBtnDisabled,
                    ]}>
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done-circle-outline" size={20} color="#ffffff" />
                        <ThemedText style={styles.submitBtnText}>পাসওয়ার্ড পরিবর্তন করুন</ThemedText>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      triggerHaptic('light');
                      setMode('signin');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    style={styles.backBtn}>
                    <ThemedText style={styles.backBtnText}>← বাতিল করে লগইনে ফিরে যান</ThemedText>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  statusBarArea: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  logoImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  appSubtitle: {
    marginTop: 4,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  tabBtnActive: {
    backgroundColor: '#0A84FF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 16,
  },
  successBoxText: {
    flex: 1,
    color: '#28A745',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 16,
  },
  errorBoxText: {
    flex: 1,
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '500',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  inputGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontWeight: '600',
    fontSize: 13,
    color: '#334155',
  },
  forgotPasswordLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A84FF',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 48,
    color: '#000000',
    fontSize: 15,
    fontWeight: '500',
  },
  otpInputWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0A84FF',
    backgroundColor: '#F0F7FF',
  },
  otpTextInput: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    color: '#0A84FF',
  },
  otpHeaderCard: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  otpShieldIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  otpCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1E293B',
  },
  otpCardSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    color: '#64748B',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  resendRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  timerText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  resendActiveText: {
    fontSize: 13,
    color: '#0A84FF',
    fontWeight: '700',
  },
  backBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 2,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  switchModePrompt: {
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  switchModePromptText: {
    color: '#0A84FF',
    fontSize: 12,
    fontWeight: '700',
  },
  eyeBtn: {
    padding: 8,
  },
  helperText: {
    fontSize: 11,
    paddingHorizontal: 2,
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: '#0A84FF',
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  submitBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
