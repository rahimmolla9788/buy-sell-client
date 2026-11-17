import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Modal,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { useAuth } from '@/context/auth-context';
import { useLanguage, AppLanguage } from '@/context/language-context';
import { ThemedText } from '@/components/themed-text';
import { UserOrder, OrderProgressStatus, AppSettings } from '@/types/product';
import {
  DEFAULT_BOOKING_AMOUNT,
  DEFAULT_DELIVERY_INSIDE_DHAKA,
  DEFAULT_DELIVERY_OUTSIDE_DHAKA,
  OFFICIAL_SHOP_LOCATION,
  OFFICIAL_SHOP_ADDRESS,
} from '@/constants/products';
import { fetchUserOrders, fetchAppSettings } from '@/services/product-service';
import { getSocket } from '@/services/socket';

const IMGBB_API_KEY = 'bdb1740562edb396275444abca610543';

type ProfileSection = 'main' | 'edit' | 'orders' | 'security';
type InfoModalType = null | 'help' | 'contact' | 'privacy';

function getSafeImagePicker(): any {
  try {
    if (Platform.OS === 'web') {
      return require('expo-image-picker');
    }
    const hasNative = requireOptionalNativeModule('ExponentImagePicker');
    if (hasNative) {
      return require('expo-image-picker');
    }
    return null;
  } catch {
    return null;
  }
}

function getOrderStatusMeta(
  progress: OrderProgressStatus | string,
  isPickup: boolean,
  t: (en: string, bn: string) => string
) {
  switch (progress) {
    case 'confirmed':
      return { label: t('Confirmed', 'কনফার্মড'), color: '#0284C7', bg: '#E0F2FE', step: 2, icon: 'checkmark-circle' as const };
    case 'processing':
      return { label: t('Processing', 'প্রসেসিং চলছে'), color: '#7C3AED', bg: '#F3E8FF', step: 2, icon: 'cube' as const };
    case 'shipped':
      return { label: t('Out for Delivery', 'ডেলিভারির পথে'), color: '#D97706', bg: '#FEF3C7', step: 3, icon: 'bicycle' as const };
    case 'ready_for_pickup':
      return { label: t('Ready at Shop', 'শোরুমে প্রস্তুত'), color: '#D97706', bg: '#FEF3C7', step: 3, icon: 'storefront' as const };
    case 'delivered':
      return {
        label: isPickup ? t('Collected', 'সংগ্রহ সম্পন্ন') : t('Delivered', 'ডেলিভারি সম্পন্ন'),
        color: '#16A34A',
        bg: '#DCFCE7',
        step: 4,
        icon: 'checkmark-done-circle' as const,
      };
    case 'cancelled':
      return { label: t('Cancelled', 'বাতিল হয়েছে'), color: '#DC2626', bg: '#FEE2E2', step: 0, icon: 'close-circle' as const };
    default:
      return { label: t('Pending', 'অপেক্ষমাণ'), color: '#B45309', bg: '#FEF3C7', step: 1, icon: 'time' as const };
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, changePassword, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  // Current View: 'main' (menu list) | 'edit' | 'orders' | 'security'
  const [activeSection, setActiveSection] = useState<ProfileSection>('main');

  // Preferences state
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [showLangModal, setShowLangModal] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoModalType>(null);

  // Dynamic Shop & App Settings (from Backend / Admin Panel)
  const [appSettings, setAppSettings] = useState<AppSettings>({
    key: 'global_settings',
    bookingPaymentAmount: DEFAULT_BOOKING_AMOUNT,
    deliveryFeeInsideDhaka: DEFAULT_DELIVERY_INSIDE_DHAKA,
    deliveryFeeOutsideDhaka: DEFAULT_DELIVERY_OUTSIDE_DHAKA,
    shopLocation: OFFICIAL_SHOP_LOCATION,
    shopAddress: OFFICIAL_SHOP_ADDRESS,
    appName: 'Buy & Sell BD',
    supportPhone: '0197272313',
  });

  useEffect(() => {
    let mounted = true;
    fetchAppSettings()
      .then((s) => {
        if (mounted && s) setAppSettings(s);
      })
      .catch(() => {});
    const socket = getSocket();
    const handleSettingsUpdate = (updated: AppSettings) => {
      if (mounted && updated) setAppSettings((prev) => ({ ...prev, ...updated }));
    };
    socket.on('settings-updated', handleSettingsUpdate);
    return () => {
      mounted = false;
      socket.off('settings-updated', handleSettingsUpdate);
    };
  }, []);

  // User Orders state
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isRefreshingOrders, setIsRefreshingOrders] = useState(false);

  // Profile edit state
  const [name, setName] = useState(user?.name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarErrorMsg, setAvatarErrorMsg] = useState('');
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [inputImageUrl, setInputImageUrl] = useState('');
  const [isSavingUrlAvatar, setIsSavingUrlAvatar] = useState(false);

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

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
    } catch {}
  };

  const loadUserOrders = useCallback(
    async (showSpinner = false) => {
      if (!user?.phoneNumber) {
        setIsLoadingOrders(false);
        return;
      }
      if (showSpinner) setIsLoadingOrders(true);
      try {
        const data = await fetchUserOrders(user.phoneNumber);
        setOrders(data);
      } finally {
        setIsLoadingOrders(false);
        setIsRefreshingOrders(false);
      }
    },
    [user?.phoneNumber]
  );

  useEffect(() => {
    loadUserOrders(true);
  }, [loadUserOrders]);

  useEffect(() => {
    if (!user?.phoneNumber) return;
    const socket = getSocket();
    const handleUpdate = () => loadUserOrders(false);
    socket.on('order-progress-updated', handleUpdate);
    socket.on('payment-session-update', handleUpdate);
    return () => {
      socket.off('order-progress-updated', handleUpdate);
      socket.off('payment-session-update', handleUpdate);
    };
  }, [user?.phoneNumber, loadUserOrders]);

  // Upload image to ImgBB
  const uploadToImgBB = async (base64Image: string): Promise<string> => {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const formData = new FormData();
    formData.append('image', cleanBase64);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (data && data.success && data.data && data.data.url) {
      return data.data.display_url || data.data.url;
    }
    throw new Error(data?.error?.message || 'ImgBB upload failed');
  };

  const handlePickImage = async () => {
    setAvatarErrorMsg('');
    triggerHaptic('light');

    const ImagePicker = getSafeImagePicker();
    if (!ImagePicker) {
      setInputImageUrl(user?.avatar || '');
      setShowUrlModal(true);
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            t('Permission Required', 'অনুমতি প্রয়োজন'),
            t(
              'Please allow gallery permission to upload a profile photo.',
              'প্রোফাইল ছবি আপলোড করার জন্য গ্যালারি অনুমতি প্রদান করুন।'
            )
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setAvatarErrorMsg(t('Could not process image.', 'ছবি প্রসেস করা সম্ভব হয়নি।'));
        return;
      }

      setIsUploadingAvatar(true);
      const uploadedUrl = await uploadToImgBB(asset.base64);
      const res = await updateProfile({ avatar: uploadedUrl });
      if (res.success) {
        triggerHaptic('success');
        setProfileSuccessMsg(t('Profile photo updated!', 'প্রোফাইল ছবি আপডেট হয়েছে!'));
        setTimeout(() => setProfileSuccessMsg(''), 3000);
      } else {
        setAvatarErrorMsg(res.error || t('Failed to save photo.', 'ছবি সংরক্ষণ করতে ব্যর্থ হয়েছে।'));
      }
    } catch (err: any) {
      setAvatarErrorMsg(err?.message || t('Photo upload error.', 'ছবি আপলোড করতে সমস্যা হয়েছে।'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveUrlAvatar = async () => {
    const trimmed = inputImageUrl.trim();
    if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
      Alert.alert(
        t('Invalid URL', 'সঠিক লিংক দিন'),
        t('Please enter a valid http:// or https:// image link.', 'দয়া করে একটি সঠিক ছবির লিংক দিন।')
      );
      return;
    }
    setIsSavingUrlAvatar(true);
    try {
      const res = await updateProfile({ avatar: trimmed });
      if (res.success) {
        triggerHaptic('success');
        setShowUrlModal(false);
        setProfileSuccessMsg(t('Profile photo updated!', 'প্রোফাইল ছবি আপডেট হয়েছে!'));
        setTimeout(() => setProfileSuccessMsg(''), 3000);
      } else {
        Alert.alert(t('Error', 'ত্রুটি'), res.error || t('Could not update photo.', 'ছবি আপডেট করা যায়নি।'));
      }
    } finally {
      setIsSavingUrlAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.avatar) return;
    setIsUploadingAvatar(true);
    setAvatarErrorMsg('');
    try {
      const res = await updateProfile({ avatar: '' });
      if (res.success) {
        triggerHaptic('success');
        setProfileSuccessMsg(t('Profile photo removed.', 'প্রোফাইল ছবি মুছে ফেলা হয়েছে।'));
        setTimeout(() => setProfileSuccessMsg(''), 3000);
      } else {
        setAvatarErrorMsg(res.error || t('Could not remove photo.', 'ছবি মুছতে সমস্যা হয়েছে।'));
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUpdateProfile = async () => {
    setProfileSuccessMsg('');
    setProfileErrorMsg('');
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setProfileErrorMsg(t('Please enter at least 2 characters for name.', 'দয়া করে কমপক্ষে ২ অক্ষরের নাম লিখুন।'));
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const res = await updateProfile({ name: trimmedName });
      if (res.success) {
        triggerHaptic('success');
        setProfileSuccessMsg(t('Profile updated successfully!', 'আপনার প্রোফাইল সফলভাবে আপডেট হয়েছে!'));
        setTimeout(() => setProfileSuccessMsg(''), 3500);
      } else {
        triggerHaptic('warning');
        setProfileErrorMsg(res.error || t('Failed to update profile.', 'প্রোফাইল আপডেট করতে ব্যর্থ হয়েছে।'));
      }
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordSuccessMsg('');
    setPasswordErrorMsg('');

    if (!oldPassword.trim()) {
      setPasswordErrorMsg(t('Please enter your current password.', 'আপনার বর্তমান পাসওয়ার্ড দিন।'));
      return;
    }
    if (!newPassword.trim() || newPassword.trim().length < 4) {
      setPasswordErrorMsg(t('New password must be at least 4 characters.', 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg(t('New passwords do not match.', 'নতুন পাসওয়ার্ড দুটি মেলেনি।'));
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await changePassword(oldPassword.trim(), newPassword.trim());
      if (res.success) {
        triggerHaptic('success');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordSuccessMsg(t('Password changed successfully!', 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!'));
        setTimeout(() => setPasswordSuccessMsg(''), 3500);
      } else {
        triggerHaptic('warning');
        setPasswordErrorMsg(res.error || t('Failed to change password.', 'পাসওয়ার্ড পরিবর্তন করতে ব্যর্থ হয়েছে।'));
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOut = () => {
    triggerHaptic('light');
    if (Platform.OS === 'web') {
      logout();
      router.replace('/');
      return;
    }
    Alert.alert(
      t('Log Out', 'লগআউট'),
      t('Are you sure you want to log out of your account?', 'আপনি কি আপনার অ্যাকাউন্ট থেকে লগআউট করতে চান?'),
      [
        { text: t('Cancel', 'বাতিল'), style: 'cancel' },
        {
          text: t('Log Out', 'লগআউট করুন'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleSelectLanguage = async (lang: AppLanguage) => {
    triggerHaptic('light');
    await setLanguage(lang);
    setShowLangModal(false);
  };

  const initialLetter = (user?.name || 'U').charAt(0).toUpperCase();

  // ==================== SUB-HEADER FOR SUB-SECTIONS ====================
  const getSectionTitle = () => {
    if (activeSection === 'edit') return t('Edit Profile Information', 'প্রোফাইল তথ্য এডিট');
    if (activeSection === 'orders') return t('My Orders & Bookings', 'আমার অর্ডার ও বুকিং');
    if (activeSection === 'security') return t('Security', 'সিকিউরিটি');
    return t('Profile', 'প্রোফাইল');
  };

  const handleBackPress = () => {
    if (activeSection !== 'main') {
      setActiveSection('main');
    } else {
      router.back();
    }
  };

  const getOrderTypeLabel = (paymentType: string) => {
    if (paymentType === 'cod_delivery') return t('🚚 Home Delivery (COD)', '🚚 হোম ডেলিভারি (COD)');
    if (paymentType === 'store_pickup' || paymentType === 'booking') return t('🏬 Store Pickup', '🏬 শোরুম পিকআপ');
    if (paymentType === 'online') return t('💳 Full Online Payment', '💳 সম্পূর্ণ অনলাইন পেমেন্ট');
    return t('🔖 Booking Order', '🔖 বুকিং অর্ডার');
  };

  const getMethodLabel = (method: string) => {
    const m = (method || '').toLowerCase();
    if (m === 'bkash') return t('bKash', 'বিকাশ');
    if (m === 'nagad') return t('Nagad', 'নগদ');
    if (m === 'rocket') return t('Rocket', 'রকেট');
    return method || t('Online', 'অনলাইন');
  };

  return (
    <View style={styles.container}>
      {/* Top Safe Area + Header (only show standard top header bar on sub-screens OR top border on main) */}
      <SafeAreaView edges={['top']} style={styles.statusBarArea}>
        {activeSection !== 'main' ? (
          <View style={styles.topHeader}>
            <Pressable
              onPress={handleBackPress}
              style={styles.backButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={22} color="#111827" />
            </Pressable>
            <ThemedText style={styles.headerTitle} numberOfLines={1}>
              {getSectionTitle()}
            </ThemedText>
            <View style={{ width: 40 }} />
          </View>
        ) : (
          <View style={styles.statusSeparatorLine} />
        )}
      </SafeAreaView>

      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.mainArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          {/* ==================== VIEW 1: MAIN PROFILE MENU (Matches Reference Design) ==================== */}
          {activeSection === 'main' && (
            <ScrollView
              style={{ flex: 1, backgroundColor: '#FFFFFF' }}
              contentContainerStyle={styles.mainScrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshingOrders}
                  onRefresh={() => {
                    setIsRefreshingOrders(true);
                    loadUserOrders(false);
                  }}
                  tintColor="#0284C7"
                />
              }>
              {/* Curved Soft Gray Top Banner with Back Arrow */}
              <View style={styles.curvedBannerWrapper}>
                <View style={styles.curvedBannerBg}>
                  <Pressable
                    onPress={() => router.back()}
                    style={styles.floatingBackBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="arrow-back" size={22} color="#0F172A" />
                  </Pressable>
                </View>

                {/* Overlapping Centered Circular Avatar with Pencil Badge */}
                <View style={styles.avatarOverlapContainer}>
                  <Pressable
                    onPress={handlePickImage}
                    disabled={isUploadingAvatar}
                    style={({ pressed }) => [
                      styles.avatarOuterRing,
                      pressed && { opacity: 0.9 },
                    ]}>
                    {user?.avatar ? (
                      <Image
                        source={{ uri: user.avatar }}
                        style={styles.avatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <ThemedText style={styles.avatarInitialText}>{initialLetter}</ThemedText>
                      </View>
                    )}

                    {isUploadingAvatar && (
                      <View style={styles.avatarUploadingOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={handlePickImage}
                    disabled={isUploadingAvatar}
                    style={styles.editPencilBadge}>
                    <Ionicons name="pencil-outline" size={16} color="#0F172A" />
                  </Pressable>
                </View>
              </View>

              {/* Centered User Name & Phone */}
              <View style={styles.userIdentityBlock}>
                <ThemedText style={styles.userNameText} numberOfLines={1}>
                  {user?.name || t('Guest User', 'ব্যবহারকারী')}
                </ThemedText>
                <ThemedText style={styles.userSubtitleText} numberOfLines={1}>
                  {user?.phoneNumber
                    ? `${t('Buy & Sell BD', 'Buy & Sell BD')}  |  ${user.phoneNumber}`
                    : t('Sign in to manage orders & profile', 'অর্ডার ও প্রোফাইল দেখতে লগইন করুন')}
                </ThemedText>
              </View>

              {avatarErrorMsg ? (
                <View style={[styles.errorBanner, { marginHorizontal: 20, marginBottom: 12 }]}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <ThemedText style={styles.errorBannerText}>{avatarErrorMsg}</ThemedText>
                </View>
              ) : null}

              {/* GROUPED MENU CARDS */}
              <View style={styles.menuGroupsWrapper}>
                {/* CARD 1: Edit Profile, Orders, Notifications, Language */}
                <View style={styles.menuCard}>
                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setActiveSection('edit');
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="id-card-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Edit profile information', 'প্রোফাইল তথ্য এডিট')}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#CBD5E1" />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setActiveSection('orders');
                      loadUserOrders(false);
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="receipt-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('My Orders & Bookings', 'আমার অর্ডার ও বুকিং')}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.menuRightAccent} numberOfLines={1}>
                      {orders.length > 0
                        ? `${orders.length} ${t('Orders', 'টি')}`
                        : t('View', 'দেখুন')}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setNotificationsOn((prev) => !prev);
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="notifications-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Notifications', 'নোটিফিকেশন')}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.menuRightAccent,
                        !notificationsOn && { color: '#94A3B8' },
                      ]}
                      numberOfLines={1}>
                      {notificationsOn ? t('ON', 'চালু') : t('OFF', 'বন্ধ')}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setShowLangModal(true);
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="language-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Language', 'ভাষা')}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.menuRightAccent} numberOfLines={1}>
                      {language === 'bn' ? 'বাংলা' : 'English'}
                    </ThemedText>
                  </Pressable>
                </View>

                {/* CARD 2: Security & Theme */}
                <View style={styles.menuCard}>
                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setActiveSection('security');
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="shield-checkmark-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Security', 'সিকিউরিটি')}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#CBD5E1" />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      Alert.alert(
                        t('Theme', 'থিম'),
                        t('Light mode is currently active.', 'বর্তমানে লাইট মোড সক্রিয় রয়েছে।')
                      );
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="sunny-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Theme', 'থিম')}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.menuRightAccent} numberOfLines={1}>
                      {t('Light mode', 'লাইট মোড')}
                    </ThemedText>
                  </Pressable>
                </View>

                {/* CARD 3: Help & Support, Contact us, Privacy policy */}
                <View style={styles.menuCard}>
                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setInfoModal('help');
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="help-circle-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Help & Support', 'হেল্প ও সাপোর্ট')}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#CBD5E1" />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setInfoModal('contact');
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="chatbubble-ellipses-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Contact us', 'যোগাযোগ করুন')}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#CBD5E1" />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    onPress={() => {
                      triggerHaptic('light');
                      setInfoModal('privacy');
                    }}>
                    <View style={styles.menuLeft}>
                      <Ionicons name="lock-closed-outline" size={21} color="#1E293B" />
                      <ThemedText style={styles.menuLabel} numberOfLines={1}>
                        {t('Privacy policy', 'প্রাইভেসি পলিসি')}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="#CBD5E1" />
                  </Pressable>
                </View>

                {/* LOGOUT / LOGIN BUTTON ON MAIN PROFILE PAGE */}
                {user ? (
                  <Pressable
                    onPress={handleSignOut}
                    style={({ pressed }) => [
                      styles.mainLogoutBtn,
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                    <ThemedText style={styles.mainLogoutText} numberOfLines={1}>
                      {t('Log Out', 'লগআউট করুন')}
                    </ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => router.replace('/')}
                    style={({ pressed }) => [
                      styles.mainLoginBtn,
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                    <ThemedText style={styles.mainLoginText} numberOfLines={1}>
                      {t('Log In', 'লগইন করুন')}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          )}

          {/* ==================== VIEW 2: MY ORDERS & LIVE PROGRESS ==================== */}
          {activeSection === 'orders' && (
            <ScrollView
              style={{ flex: 1, backgroundColor: '#F8FAFC' }}
              contentContainerStyle={styles.subScrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshingOrders}
                  onRefresh={() => {
                    setIsRefreshingOrders(true);
                    loadUserOrders(false);
                  }}
                  tintColor="#0284C7"
                />
              }>
              <View style={styles.ordersHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="cube" size={18} color="#0284C7" />
                  <ThemedText style={styles.ordersSectionHeading}>
                    {t(`My Orders (${orders.length})`, `আমার অর্ডার ও বুকিং (${orders.length})`)}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => loadUserOrders(true)}
                  style={styles.refreshMiniBtn}
                  hitSlop={8}>
                  <Ionicons name="refresh" size={14} color="#0284C7" />
                  <ThemedText style={styles.refreshMiniText}>
                    {t('Refresh', 'রিফ্রেশ')}
                  </ThemedText>
                </Pressable>
              </View>

              {isLoadingOrders ? (
                <View style={styles.ordersEmptyCard}>
                  <ActivityIndicator size="large" color="#0284C7" />
                  <ThemedText style={styles.ordersEmptySub}>
                    {t('Loading orders...', 'অর্ডার তথ্য লোড হচ্ছে...')}
                  </ThemedText>
                </View>
              ) : orders.length === 0 ? (
                <View style={styles.ordersEmptyCard}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="bag-handle-outline" size={32} color="#0284C7" />
                  </View>
                  <ThemedText style={styles.ordersEmptyTitle}>
                    {t('No Orders or Bookings Yet', 'এখনো কোনো অর্ডার বা বুকিং নেই')}
                  </ThemedText>
                  <ThemedText style={styles.ordersEmptySub}>
                    {t(
                      'When you book or order any product, you can track its live progress status right here.',
                      'পছন্দের যেকোনো পণ্য বুক বা অর্ডার করলে এখানে তার লাইভ প্রগ্রেস স্ট্যাটাস দেখতে পারবেন।'
                    )}
                  </ThemedText>
                  <Pressable onPress={() => router.replace('/')} style={styles.browseBtn}>
                    <Ionicons name="storefront-outline" size={16} color="#FFFFFF" />
                    <ThemedText style={styles.browseBtnText} numberOfLines={1}>
                      {t('Browse Products', 'পণ্য ব্রাউজ করুন')}
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                orders.map((order) => {
                  const isPickup =
                    order.paymentType === 'store_pickup' || order.paymentType === 'booking';
                  const meta = getOrderStatusMeta(order.orderProgress, isPickup, t);
                  const paid = Number(order.amount) || 0;
                  const prodPrice = Number(order.productPrice) || 0;
                  const due =
                    order.paymentType === 'online'
                      ? 0
                      : order.paymentType === 'cod_delivery'
                      ? prodPrice
                      : Math.max(0, prodPrice - paid);

                  const stepLabels = isPickup
                    ? [
                        t('Booked', 'বুকিং'),
                        t('Confirmed', 'কনফার্ম'),
                        t('At Shop', 'শোরুমে প্রস্তুত'),
                        t('Done', 'সম্পন্ন'),
                      ]
                    : [
                        t('Ordered', 'অর্ডার'),
                        t('Confirmed', 'কনফার্ম'),
                        t('On Way', 'ডেলিভারি পথে'),
                        t('Delivered', 'সম্পন্ন'),
                      ];

                  const orderDate = order.createdAt
                    ? new Date(order.createdAt).toLocaleDateString(
                        language === 'bn' ? 'bn-BD' : 'en-US',
                        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
                      )
                    : '';

                  return (
                    <View key={order.sessionId} style={styles.orderCard}>
                      <View style={styles.orderTopRow}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.orderIdText} numberOfLines={1}>
                            {t('Order', 'অর্ডার')} #{order.sessionId.slice(-8).toUpperCase()}
                          </ThemedText>
                          {orderDate ? (
                            <ThemedText style={styles.orderDateText}>{orderDate}</ThemedText>
                          ) : null}
                        </View>
                        <View style={[styles.orderStatusBadge, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={13} color={meta.color} />
                          <ThemedText
                            style={[styles.orderStatusText, { color: meta.color }]}
                            numberOfLines={1}>
                            {meta.label}
                          </ThemedText>
                        </View>
                      </View>

                      <View style={styles.orderProductRow}>
                        <Image
                          source={{
                            uri:
                              order.productThumbnail ||
                              'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=400&q=80',
                          }}
                          style={styles.orderThumb}
                          resizeMode="cover"
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <ThemedText style={styles.orderProdTitle} numberOfLines={2}>
                            {order.productTitle || t('Product', 'পণ্য')}
                          </ThemedText>
                          <View style={styles.orderTypePill}>
                            <ThemedText style={styles.orderTypeText} numberOfLines={1}>
                              {getOrderTypeLabel(order.paymentType)}
                            </ThemedText>
                          </View>
                        </View>
                      </View>

                      {order.orderProgress === 'cancelled' ? (
                        <View style={styles.cancelledBar}>
                          <Ionicons name="close-circle" size={16} color="#DC2626" />
                          <ThemedText style={styles.cancelledBarText}>
                            {t('This order has been cancelled.', 'এই অর্ডারটি বাতিল করা হয়েছে।')}
                          </ThemedText>
                        </View>
                      ) : (
                        <View style={styles.stepperContainer}>
                          <View style={styles.stepperLineRow}>
                            {[1, 2, 3, 4].map((stepNum, idx) => {
                              const isDone = meta.step >= stepNum;
                              const isCurrent = meta.step === stepNum;
                              return (
                                <React.Fragment key={stepNum}>
                                  <View
                                    style={[
                                      styles.stepDot,
                                      isDone && styles.stepDotDone,
                                      isCurrent && styles.stepDotCurrent,
                                    ]}>
                                    {isDone ? (
                                      <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                                    ) : (
                                      <ThemedText style={styles.stepDotNum}>{stepNum}</ThemedText>
                                    )}
                                  </View>
                                  {idx < 3 && (
                                    <View
                                      style={[
                                        styles.stepConnector,
                                        meta.step > stepNum && styles.stepConnectorDone,
                                      ]}
                                    />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </View>
                          <View style={styles.stepperLabelsRow}>
                            {stepLabels.map((lbl, idx) => (
                              <ThemedText
                                key={lbl}
                                style={[
                                  styles.stepLabel,
                                  meta.step >= idx + 1 && styles.stepLabelActive,
                                ]}
                                numberOfLines={1}>
                                {lbl}
                              </ThemedText>
                            ))}
                          </View>
                        </View>
                      )}

                      <View style={styles.orderAmountsRow}>
                        <View style={styles.orderAmountCol}>
                          <ThemedText style={styles.orderAmountLbl}>{t('Paid', 'পরিশোধিত')}</ThemedText>
                          <ThemedText style={[styles.orderAmountVal, { color: '#16A34A' }]}>
                            ৳ {paid.toLocaleString()}
                          </ThemedText>
                        </View>
                        <View style={styles.orderAmountDivider} />
                        <View style={styles.orderAmountCol}>
                          <ThemedText style={styles.orderAmountLbl}>
                            {isPickup ? t('Due at Shop', 'দোকানে প্রদেয়') : t('Due on Delivery', 'ডেলিভারিতে প্রদেয়')}
                          </ThemedText>
                          <ThemedText style={[styles.orderAmountVal, { color: '#D97706' }]}>
                            ৳ {due.toLocaleString()}
                          </ThemedText>
                        </View>
                        <View style={styles.orderAmountDivider} />
                        <View style={styles.orderAmountCol}>
                          <ThemedText style={styles.orderAmountLbl}>{t('Method', 'মাধ্যম')}</ThemedText>
                          <ThemedText style={styles.orderAmountVal} numberOfLines={1}>
                            {getMethodLabel(order.method)}
                          </ThemedText>
                        </View>
                      </View>

                      {order.deliveryAddress ? (
                        <View style={styles.orderAddressRow}>
                          <Ionicons name="location-outline" size={14} color="#64748B" />
                          <ThemedText style={styles.orderAddressText} numberOfLines={2}>
                            {order.deliveryAddress}
                          </ThemedText>
                        </View>
                      ) : null}

                      {order.trackingNote ? (
                        <View style={styles.trackingNoteBox}>
                          <Ionicons name="information-circle-outline" size={14} color="#0284C7" />
                          <ThemedText style={styles.trackingNoteText}>{order.trackingNote}</ThemedText>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* ==================== VIEW 3: EDIT PROFILE INFORMATION ==================== */}
          {activeSection === 'edit' && (
            <ScrollView
              style={{ flex: 1, backgroundColor: '#F8FAFC' }}
              contentContainerStyle={styles.subScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              <View style={styles.cardSection}>
                <View style={styles.editAvatarCenter}>
                  <Pressable onPress={handlePickImage} disabled={isUploadingAvatar} style={styles.avatarOuterRing}>
                    {user?.avatar ? (
                      <Image source={{ uri: user.avatar }} style={styles.avatarImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <ThemedText style={styles.avatarInitialText}>{initialLetter}</ThemedText>
                      </View>
                    )}
                    {isUploadingAvatar && (
                      <View style={styles.avatarUploadingOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    )}
                  </Pressable>
                  <View style={styles.editAvatarBtnsRow}>
                    <Pressable onPress={handlePickImage} disabled={isUploadingAvatar} style={styles.changePhotoBtn}>
                      <Ionicons name="camera-outline" size={15} color="#0284C7" />
                      <ThemedText style={styles.changePhotoText} numberOfLines={1}>
                        {t('Change Photo', 'ছবি পরিবর্তন')}
                      </ThemedText>
                    </Pressable>
                    {user?.avatar ? (
                      <Pressable onPress={handleRemoveAvatar} disabled={isUploadingAvatar} style={styles.removePhotoBtn}>
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                        <ThemedText style={styles.removePhotoText} numberOfLines={1}>
                          {t('Remove', 'মুছুন')}
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {profileSuccessMsg ? (
                  <View style={styles.successBanner}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <ThemedText style={styles.successBannerText}>{profileSuccessMsg}</ThemedText>
                  </View>
                ) : null}

                {profileErrorMsg ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <ThemedText style={styles.errorBannerText}>{profileErrorMsg}</ThemedText>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>{t('Full Name', 'পুরো নাম')}</ThemedText>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={19} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder={t('Enter your full name', 'আপনার পুরো নাম লিখুন')}
                      placeholderTextColor="#94A3B8"
                      value={name}
                      onChangeText={(text) => {
                        setName(text);
                        if (profileErrorMsg) setProfileErrorMsg('');
                      }}
                      autoCapitalize="words"
                      maxLength={40}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>{t('Phone Number', 'মোবাইল নম্বর')}</ThemedText>
                  <View style={[styles.inputWrapper, styles.inputDisabled]}>
                    <Ionicons name="call-outline" size={19} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.textInput, styles.textInputDisabled]}
                      value={user?.phoneNumber}
                      editable={false}
                    />
                    <Ionicons name="lock-closed" size={16} color="#94A3B8" />
                  </View>
                  <ThemedText style={styles.helperText}>
                    {t(
                      'Registered phone number cannot be changed for security.',
                      'নিরাপত্তার স্বার্থে রেজিস্ট্রেশনকৃত ফোন নম্বর পরিবর্তনযোগ্য নয়।'
                    )}
                  </ThemedText>
                </View>

                <Pressable
                  onPress={handleUpdateProfile}
                  disabled={isUpdatingProfile}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && { opacity: 0.85 },
                    isUpdatingProfile && { opacity: 0.7 },
                  ]}>
                  {isUpdatingProfile ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <ThemedText style={styles.primaryBtnText} numberOfLines={1}>
                        {t('Save Changes', 'প্রোফাইল সংরক্ষণ করুন')}
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}

          {/* ==================== VIEW 4: SECURITY (CHANGE PASSWORD) ==================== */}
          {activeSection === 'security' && (
            <ScrollView
              style={{ flex: 1, backgroundColor: '#F8FAFC' }}
              contentContainerStyle={styles.subScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              <View style={styles.cardSection}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.sectionIconBox, { backgroundColor: '#FDF2F8' }]}>
                    <Ionicons name="key" size={18} color="#E2136E" />
                  </View>
                  <ThemedText style={styles.cardHeaderTitle}>
                    {t('Change Password', 'পাসওয়ার্ড পরিবর্তন')}
                  </ThemedText>
                </View>

                {passwordSuccessMsg ? (
                  <View style={styles.successBanner}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <ThemedText style={styles.successBannerText}>{passwordSuccessMsg}</ThemedText>
                  </View>
                ) : null}

                {passwordErrorMsg ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <ThemedText style={styles.errorBannerText}>{passwordErrorMsg}</ThemedText>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>{t('Current Password', 'বর্তমান পাসওয়ার্ড')}</ThemedText>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={19} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder={t('Enter current password', 'বর্তমান পাসওয়ার্ড দিন')}
                      placeholderTextColor="#94A3B8"
                      value={oldPassword}
                      onChangeText={(txt) => {
                        setOldPassword(txt);
                        if (passwordErrorMsg) setPasswordErrorMsg('');
                      }}
                      secureTextEntry={!showOldPass}
                      autoCapitalize="none"
                    />
                    <Pressable onPress={() => setShowOldPass(!showOldPass)} hitSlop={8}>
                      <Ionicons name={showOldPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>{t('New Password', 'নতুন পাসওয়ার্ড')}</ThemedText>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="shield-checkmark-outline" size={19} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder={t('Minimum 4 characters', 'কমপক্ষে ৪ অক্ষরের নতুন পাসওয়ার্ড দিন')}
                      placeholderTextColor="#94A3B8"
                      value={newPassword}
                      onChangeText={(txt) => {
                        setNewPassword(txt);
                        if (passwordErrorMsg) setPasswordErrorMsg('');
                      }}
                      secureTextEntry={!showNewPass}
                      autoCapitalize="none"
                    />
                    <Pressable onPress={() => setShowNewPass(!showNewPass)} hitSlop={8}>
                      <Ionicons name={showNewPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>{t('Confirm Password', 'নতুন পাসওয়ার্ড নিশ্চিত করুন')}</ThemedText>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="checkmark-done-outline" size={19} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder={t('Re-enter new password', 'নতুন পাসওয়ার্ডটি পুনরায় লিখুন')}
                      placeholderTextColor="#94A3B8"
                      value={confirmPassword}
                      onChangeText={(txt) => {
                        setConfirmPassword(txt);
                        if (passwordErrorMsg) setPasswordErrorMsg('');
                      }}
                      secureTextEntry={!showConfirmPass}
                      autoCapitalize="none"
                    />
                    <Pressable onPress={() => setShowConfirmPass(!showConfirmPass)} hitSlop={8}>
                      <Ionicons name={showConfirmPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  onPress={handleChangePassword}
                  disabled={isChangingPassword}
                  style={({ pressed }) => [
                    styles.securityBtn,
                    pressed && { opacity: 0.85 },
                    isChangingPassword && { opacity: 0.7 },
                  ]}>
                  {isChangingPassword ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="key-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <ThemedText style={styles.primaryBtnText} numberOfLines={1}>
                        {t('Update Password', 'পাসওয়ার্ড পরিবর্তন করুন')}
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ==================== LANGUAGE PICKER MODAL (English / বাংলা) ==================== */}
      <Modal
        visible={showLangModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLangModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLangModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle} numberOfLines={1}>
                {t('Select Language', 'ভাষা নির্বাচন করুন')}
              </ThemedText>
              <Pressable onPress={() => setShowLangModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>

            <Pressable
              style={[styles.langOptionRow, language === 'en' && styles.langOptionActive]}
              onPress={() => handleSelectLanguage('en')}>
              <View style={styles.langOptionLeft}>
                <ThemedText style={styles.langOptionTitle}>English</ThemedText>
                <ThemedText style={styles.langOptionSub}>Default Language</ThemedText>
              </View>
              <View style={[styles.langRadio, language === 'en' && styles.langRadioActive]}>
                {language === 'en' && <View style={styles.langRadioDot} />}
              </View>
            </Pressable>

            <Pressable
              style={[styles.langOptionRow, { marginBottom: 0 }, language === 'bn' && styles.langOptionActive]}
              onPress={() => handleSelectLanguage('bn')}>
              <View style={styles.langOptionLeft}>
                <ThemedText style={styles.langOptionTitle}>বাংলা (Bangla)</ThemedText>
                <ThemedText style={styles.langOptionSub}>বাংলা ভাষা</ThemedText>
              </View>
              <View style={[styles.langRadio, language === 'bn' && styles.langRadioActive]}>
                {language === 'bn' && <View style={styles.langRadioDot} />}
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ==================== INFO MODAL (Help / Contact / Privacy) ==================== */}
      <Modal
        visible={infoModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setInfoModal(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle} numberOfLines={1}>
                {infoModal === 'help'
                  ? t('Help & Support', 'হেল্প ও সাপোর্ট')
                  : infoModal === 'contact'
                  ? t('Contact Us', 'যোগাযোগ করুন')
                  : t('Privacy Policy', 'প্রাইভেসি পলিসি')}
              </ThemedText>
              <Pressable onPress={() => setInfoModal(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>

            {infoModal === 'help' && (
              <View style={{ gap: 8 }}>
                <ThemedText style={styles.infoBodyText}>
                  {t(
                    `• Cash on Delivery: Confirm your home delivery order by paying only the delivery charge (৳${appSettings.deliveryFeeInsideDhaka || DEFAULT_DELIVERY_INSIDE_DHAKA} inside Dhaka, ৳${appSettings.deliveryFeeOutsideDhaka || DEFAULT_DELIVERY_OUTSIDE_DHAKA} outside Dhaka).`,
                    `• ক্যাশ অন ডেলিভারি: শুধুমাত্র ডেলিভারি চার্জ (ঢাকার ভেতরে ৳${appSettings.deliveryFeeInsideDhaka || DEFAULT_DELIVERY_INSIDE_DHAKA}, বাইরে ৳${appSettings.deliveryFeeOutsideDhaka || DEFAULT_DELIVERY_OUTSIDE_DHAKA}) অগ্রিম দিয়ে হোম ডেলিভারি বুক করুন।`
                  )}
                </ThemedText>
                <ThemedText style={styles.infoBodyText}>
                  {t(
                    `• Store Pickup: Reserve any product with a ৳${appSettings.bookingPaymentAmount || DEFAULT_BOOKING_AMOUNT} token booking and inspect it in person at our ${appSettings.shopLocation || OFFICIAL_SHOP_LOCATION} showroom.`,
                    `• শোরুম পিকআপ: মাত্র ৳${appSettings.bookingPaymentAmount || DEFAULT_BOOKING_AMOUNT} টোকেন বুকিং দিয়ে রিজার্ভ রাখুন এবং ${appSettings.shopLocation || OFFICIAL_SHOP_LOCATION} শোরুমে এসে দেখে নিন।`
                  )}
                </ThemedText>
                <ThemedText style={styles.infoBodyText}>
                  {t(
                    '• 7-Day Replacement Guarantee on all verified products.',
                    '• সব ভেরিফাইড পণ্যে ৭ দিনের রিপ্লেসমেন্ট গ্যারান্টি।'
                  )}
                </ThemedText>
              </View>
            )}

            {infoModal === 'contact' && (
              <View style={{ gap: 8 }}>
                <ThemedText style={styles.infoBodyText}>
                  🏬 {t('Buy & Sell BD Official Showroom', 'Buy & Sell BD প্রধান শোরুম')}
                </ThemedText>
                <ThemedText style={styles.infoBodyText}>
                  📍 {appSettings.shopAddress || appSettings.shopLocation || OFFICIAL_SHOP_ADDRESS}
                </ThemedText>
                <ThemedText style={styles.infoBodyText}>
                  📞 {t('Helpline:', 'হেল্পলাইন:')} {appSettings.supportPhone || '0197272313'}
                </ThemedText>
                <ThemedText style={styles.infoBodyText}>
                  ⏰ {t('Open Daily: 10:00 AM - 9:00 PM', 'প্রতিদিন খোলা: সকাল ১০:০০ - রাত ৯:০০')}
                </ThemedText>
              </View>
            )}

            {infoModal === 'privacy' && (
              <ThemedText style={styles.infoBodyText}>
                {t(
                  'Your personal information, order details, and payment verification data are encrypted and strictly used only to process your orders and protect your account.',
                  'আপনার ব্যক্তিগত তথ্য, অর্ডারের বিবরণ এবং পেমেন্ট ডেটা সম্পূর্ণ এনক্রিপ্টেড এবং শুধুমাত্র আপনার অর্ডার প্রসেসিং ও অ্যাকাউন্টের নিরাপত্তায় ব্যবহৃত হয়।'
                )}
              </ThemedText>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ==================== IMAGE URL FALLBACK MODAL ==================== */}
      <Modal
        visible={showUrlModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUrlModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle} numberOfLines={1}>
                {t('Profile Photo Link', 'প্রোফাইল ছবির লিংক দিন')}
              </ThemedText>
              <Pressable onPress={() => setShowUrlModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="link-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="https://i.ibb.co/..."
                placeholderTextColor="#94A3B8"
                value={inputImageUrl}
                onChangeText={setInputImageUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => setShowUrlModal(false)} style={styles.urlCancelBtn}>
                <ThemedText style={styles.urlCancelBtnText}>{t('Cancel', 'বাতিল')}</ThemedText>
              </Pressable>
              <Pressable onPress={handleSaveUrlAvatar} disabled={isSavingUrlAvatar} style={styles.urlSubmitBtn}>
                {isSavingUrlAvatar ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.urlSubmitBtnText}>{t('Save', 'সেভ করুন')}</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  statusBarArea: {
    backgroundColor: '#FFFFFF',
  },
  statusSeparatorLine: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#0F172A',
    includeFontPadding: false,
  },
  mainArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // ==================== MAIN PROFILE CURVED DESIGN ====================
  mainScrollContent: {
    paddingBottom: 28,
    backgroundColor: '#FFFFFF',
  },
  curvedBannerWrapper: {
    alignItems: 'center',
    marginBottom: 48,
  },
  curvedBannerBg: {
    width: '100%',
    height: 105,
    backgroundColor: '#EEF2F6',
    borderBottomLeftRadius: 140,
    borderBottomRightRadius: 140,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  floatingBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlapContainer: {
    position: 'absolute',
    bottom: -44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOuterRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#BAE6FD',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialText: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  avatarUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPencilBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  userIdentityBlock: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  userNameText: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '800',
    color: '#0F172A',
    includeFontPadding: false,
  },
  userSubtitleText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
    marginTop: 4,
    fontWeight: '500',
    includeFontPadding: false,
  },
  menuGroupsWrapper: {
    paddingHorizontal: 18,
    gap: 14,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 10,
  },
  menuRowPressed: {
    backgroundColor: '#F8FAFC',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  menuLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: '#1E293B',
    includeFontPadding: false,
  },
  menuRightAccent: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#F59E0B',
    includeFontPadding: false,
    marginLeft: 8,
  },
  mainLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 4,
  },
  mainLogoutText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#EF4444',
    includeFontPadding: false,
  },
  mainLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0284C7',
    marginTop: 4,
  },
  mainLoginText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  // ==================== SUB SCREENS (Edit, Security, Orders) ====================
  subScrollContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editAvatarCenter: {
    alignItems: 'center',
    marginBottom: 18,
  },
  editAvatarBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  changePhotoText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#0284C7',
    includeFontPadding: false,
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  removePhotoText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#EF4444',
    includeFontPadding: false,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#0F172A',
    includeFontPadding: false,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    includeFontPadding: false,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 46,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  textInputDisabled: {
    color: '#64748B',
  },
  helperText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
    marginTop: 5,
  },
  primaryBtn: {
    height: 46,
    backgroundColor: '#0284C7',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  securityBtn: {
    height: 46,
    backgroundColor: '#0284C7',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    includeFontPadding: false,
    flexShrink: 0,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  successBannerText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
  },
  // ==================== ORDERS & PROGRESS TRACKER ====================
  ordersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  ordersSectionHeading: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: '#0F172A',
    includeFontPadding: false,
  },
  refreshMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  refreshMiniText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#0284C7',
    includeFontPadding: false,
  },
  ordersEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ordersEmptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: '#0F172A',
    includeFontPadding: false,
  },
  ordersEmptySub: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 8,
  },
  browseBtnText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    includeFontPadding: false,
    flexShrink: 0,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  orderIdText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#0F172A',
    includeFontPadding: false,
  },
  orderDateText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    marginTop: 2,
    includeFontPadding: false,
  },
  orderStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
  },
  orderStatusText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    includeFontPadding: false,
  },
  orderProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderThumb: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  orderProdTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  orderTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    marginTop: 4,
  },
  orderTypeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#0369A1',
    includeFontPadding: false,
  },
  cancelledBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelledBarText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#DC2626',
    includeFontPadding: false,
  },
  stepperContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: '#16A34A',
  },
  stepDotCurrent: {
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  stepDotNum: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: '#64748B',
    includeFontPadding: false,
  },
  stepConnector: {
    flex: 1,
    height: 3,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 3,
    borderRadius: 2,
  },
  stepConnectorDone: {
    backgroundColor: '#16A34A',
  },
  stepperLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  stepLabel: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: '#94A3B8',
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
  stepLabelActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  orderAmountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  orderAmountCol: {
    flex: 1,
    alignItems: 'center',
  },
  orderAmountDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#E2E8F0',
  },
  orderAmountLbl: {
    fontSize: 10,
    lineHeight: 14,
    color: '#64748B',
    fontWeight: '600',
    includeFontPadding: false,
  },
  orderAmountVal: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    includeFontPadding: false,
  },
  orderAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  orderAddressText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
  },
  trackingNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  trackingNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#0369A1',
    fontWeight: '600',
  },
  // ==================== MODALS ====================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#0F172A',
    includeFontPadding: false,
  },
  langOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  langOptionActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  langOptionLeft: {
    flex: 1,
  },
  langOptionTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#0F172A',
    includeFontPadding: false,
  },
  langOptionSub: {
    fontSize: 11,
    lineHeight: 15,
    color: '#64748B',
    marginTop: 2,
    includeFontPadding: false,
  },
  langRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langRadioActive: {
    borderColor: '#0284C7',
  },
  langRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0284C7',
  },
  infoBodyText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#334155',
  },
  urlCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  urlCancelBtnText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: '#64748B',
    includeFontPadding: false,
  },
  urlSubmitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0284C7',
  },
  urlSubmitBtnText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
});
