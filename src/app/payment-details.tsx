import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { SecondHandProduct, PaymentType, DeliveryArea, AppSettings } from '@/types/product';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_BOOKING_AMOUNT,
  DEFAULT_DELIVERY_INSIDE_DHAKA,
  DEFAULT_DELIVERY_OUTSIDE_DHAKA,
  OFFICIAL_SHOP_LOCATION,
  OFFICIAL_SHOP_ADDRESS,
} from '@/constants/products';
import { fetchProductById, fetchAppSettings } from '@/services/product-service';
import { getSocket } from '@/services/socket';

const { width } = Dimensions.get('window');

export type PaymentMethodId = 'bkash' | 'nagad' | 'rocket';

export interface PaymentMethodItem {
  id: PaymentMethodId;
  name: string;
  banglaName: string;
  color: string;
  bgColor: string;
  logo: any;
  tag: string;
  subtitle: string;
}

export const PAYMENT_METHODS: PaymentMethodItem[] = [
  {
    id: 'bkash',
    name: 'bKash',
    banglaName: 'বিকাশ',
    color: '#E2136E',
    bgColor: '#FFF0F5',
    logo: require('../../assets/images/bkash-bn.png'),
    tag: 'ক্যাশব্যাক অফার',
    subtitle: 'বিকাশ ওয়ালেট থেকে তাৎক্ষণিক পেমেন্ট',
  },
  {
    id: 'nagad',
    name: 'Nagad',
    banglaName: 'নগদ',
    color: '#D0392C',
    bgColor: '#FFF5F5',
    logo: require('../../assets/images/nagad.png'),
    tag: 'দ্রুত প্রসেসিং',
    subtitle: 'ডাক বিভাগের ডিজিটাল লেনদেন',
  },
  {
    id: 'rocket',
    name: 'Rocket',
    banglaName: 'রকেট',
    color: '#8C3494',
    bgColor: '#FAF5FF',
    logo: require('../../assets/images/rocket.png'),
    tag: 'DBBL সিকিউরড',
    subtitle: 'ডাচ-বাংলা মোবাইল ব্যাংকিং',
  },
];

// Responsive Skeleton Item for Product Details Screen
function DetailsSkeletonItem({ style }: { style: any }) {
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: pulseAnim,
          backgroundColor: '#E2E8F0',
        },
      ]}
    />
  );
}

export default function PaymentDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, isBangla } = useLanguage();
  const params = useLocalSearchParams<{
    productId?: string;
    offerId?: string;
    type?: string;
  }>();

  const activeId = params.productId || params.offerId;

  // Product and Settings State (Starts empty, no dummy data flash)
  const [product, setProduct] = useState<SecondHandProduct | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    key: 'global_settings',
    bookingPaymentAmount: DEFAULT_BOOKING_AMOUNT,
    deliveryFeeInsideDhaka: DEFAULT_DELIVERY_INSIDE_DHAKA,
    deliveryFeeOutsideDhaka: DEFAULT_DELIVERY_OUTSIDE_DHAKA,
    shopLocation: OFFICIAL_SHOP_LOCATION,
    shopAddress: OFFICIAL_SHOP_ADDRESS,
    appName: 'BuySell - সেকেন্ড হ্যান্ড বাজার',
    supportPhone: '0197272313',
  });
  const [isLoading, setIsLoading] = useState(true);

  // Delivery Option: 'home_delivery' (Cash on Delivery) | 'store_pickup' (দোকান থেকে নেওয়া) | 'online' (সম্পূর্ণ অনলাইন)
  const [deliveryOption, setDeliveryOption] = useState<'home_delivery' | 'store_pickup' | 'online'>(
    params.type === 'online' ? 'online' : (params.type === 'pickup' ? 'store_pickup' : 'home_delivery')
  );

  // Delivery Area: 'inside_dhaka' (৳70) | 'outside_dhaka' (৳120)
  const [deliveryArea, setDeliveryArea] = useState<DeliveryArea>('inside_dhaka');

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('bkash');

  // Buyer Info
  const [buyerPhone, setBuyerPhone] = useState(user?.phoneNumber || '');
  const [deliveryAddress, setDeliveryAddress] = useState('মিরপুর, ঢাকা');
  const [pickupNote, setPickupNote] = useState('');

  // Multi-Image Slider State (Lomba / Portrait Aspect Ratio)
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [sliderWidth, setSliderWidth] = useState(width - 32);
  const sliderHeight = useMemo(() => Math.round(sliderWidth / 0.85), [sliderWidth]);
  const imageSliderRef = useRef<any>(null);

  const productImages = useMemo(() => {
    const list: string[] = [];
    if (product?.images && Array.isArray(product.images)) {
      product.images.forEach((img) => {
        if (img && typeof img === 'string' && img.trim() && !list.includes(img.trim())) {
          list.push(img.trim());
        }
      });
    }
    if (product?.thumbnail && product.thumbnail.trim()) {
      const thumb = product.thumbnail.trim();
      const idx = list.indexOf(thumb);
      if (idx > 0) {
        list.splice(idx, 1);
        list.unshift(thumb);
      } else if (idx === -1) {
        list.unshift(thumb);
      }
    }
    if (list.length === 0) {
      list.push('https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80');
    }
    return list;
  }, [product?.images, product?.thumbnail]);

  useEffect(() => {
    setActiveImageIndex(0);
    imageSliderRef.current?.scrollTo({ x: 0, animated: false });
  }, [product?.id]);

  const handleSelectSlide = (index: number) => {
    setActiveImageIndex(index);
    imageSliderRef.current?.scrollTo({ x: index * sliderWidth, animated: true });
  };

  // Load product and settings dynamically
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [fetchedSettings, fetchedProduct] = await Promise.all([
          fetchAppSettings(),
          activeId ? fetchProductById(activeId) : Promise.resolve(undefined),
        ]);

        if (mounted) {
          if (fetchedSettings) setAppSettings(fetchedSettings);
          if (fetchedProduct) {
            setProduct(fetchedProduct);
          } else if (activeId) {
            const fallback = DEFAULT_PRODUCTS.find((p) => p.id === activeId);
            if (fallback) setProduct(fallback);
          }
        }
      } catch (err) {
        console.log('[PaymentDetails] Load error:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadData();
    const socket = getSocket();
    const handleSettingsUpdated = (updated: AppSettings) => {
      if (mounted && updated) setAppSettings((prev) => ({ ...prev, ...updated }));
    };
    const handleProductsUpdated = (updatedList: SecondHandProduct[]) => {
      if (mounted && Array.isArray(updatedList) && activeId) {
        const found = updatedList.find((p) => p.id === activeId);
        if (found) setProduct(found);
      }
    };
    socket.on('settings-updated', handleSettingsUpdated);
    socket.on('products-updated', handleProductsUpdated);
    return () => {
      mounted = false;
      socket.off('settings-updated', handleSettingsUpdated);
      socket.off('products-updated', handleProductsUpdated);
    };
  }, [activeId]);

  // Sync buyer phone if user changes
  useEffect(() => {
    if (user?.phoneNumber && !buyerPhone) {
      setBuyerPhone(user.phoneNumber);
    }
  }, [user?.phoneNumber]);

  // Delivery Fees & Calculations
  const bookingFee = useMemo(() => {
    if (product?.bookingAmount && product.bookingAmount > 0) {
      return product.bookingAmount;
    }
    return appSettings.bookingPaymentAmount || DEFAULT_BOOKING_AMOUNT;
  }, [product?.bookingAmount, appSettings.bookingPaymentAmount]);

  const deliveryFeeInsideDhaka = appSettings.deliveryFeeInsideDhaka || DEFAULT_DELIVERY_INSIDE_DHAKA;
  const deliveryFeeOutsideDhaka = appSettings.deliveryFeeOutsideDhaka || DEFAULT_DELIVERY_OUTSIDE_DHAKA;
  const currentDeliveryFee = deliveryArea === 'inside_dhaka' ? deliveryFeeInsideDhaka : deliveryFeeOutsideDhaka;

  const productPrice = product?.price || 0;
  const isProductBooked = !product || product.status !== 'available';

  const productBadges = useMemo(() => {
    if (Array.isArray(product?.badges) && product.badges.length > 0) return product.badges;
    if (product?.badge) return product.badge.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
  }, [product?.badges, product?.badge]);

  // Payable amount & Remaining amount calculation
  const { payableAmount, remainingAmount, paymentTypeForBackend } = useMemo(() => {
    if (deliveryOption === 'home_delivery') {
      // Cash on Delivery: Pay delivery fee to book, product price payable on delivery
      return {
        payableAmount: currentDeliveryFee,
        remainingAmount: productPrice,
        paymentTypeForBackend: 'cod_delivery' as PaymentType,
      };
    } else if (deliveryOption === 'store_pickup') {
      // Store Pickup: Pay booking token now, remaining at shop
      return {
        payableAmount: bookingFee,
        remainingAmount: Math.max(0, productPrice - bookingFee),
        paymentTypeForBackend: 'store_pickup' as PaymentType,
      };
    } else {
      // Full online payment
      return {
        payableAmount: productPrice + currentDeliveryFee,
        remainingAmount: 0,
        paymentTypeForBackend: 'online' as PaymentType,
      };
    }
  }, [deliveryOption, currentDeliveryFee, bookingFee, productPrice]);

  // Handle Proceed to Payment
  const handleProceedToPayment = () => {
    if (isProductBooked) {
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {}
      }
      Alert.alert(
        t('Product Already Booked', 'পণ্যটি বুক করা আছে'),
        t(
          'This product is currently booked and cannot be booked or ordered right now.',
          'এই পণ্যটি বর্তমানে বুক করা অবস্থায় আছে, তাই এখন বুকিং বা পেমেন্ট করা যাবে না।'
        )
      );
      return;
    }

    if (!buyerPhone || buyerPhone.length < 11) {
      Alert.alert(
        t('Enter Mobile Number', 'নম্বর দিন'),
        t('Please enter a valid 11-digit mobile number.', 'অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন।')
      );
      return;
    }

    if (deliveryOption !== 'store_pickup' && !deliveryAddress.trim()) {
      Alert.alert(
        t('Enter Address', 'ঠিকানা দিন'),
        t('Please enter delivery area or address.', 'অনুগ্রহ করে ডেলিভারি এলাকা বা ঠিকানা দিন।')
      );
      return;
    }

    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
    }

    const finalAddress =
      deliveryOption === 'store_pickup'
        ? `${appSettings.shopAddress || OFFICIAL_SHOP_ADDRESS} (${t('Showroom Pickup', 'শোরুম পিকআপ')})`
        : `${deliveryAddress.trim()} [${deliveryArea === 'inside_dhaka' ? t('Inside Dhaka', 'ঢাকার ভেতরে') : t('Outside Dhaka', 'ঢাকার বাইরে')}]`;

    // Navigate to payment execution
    router.push({
      pathname: '/payment',
      params: {
        productId: product?.id || 'prod_item',
        productTitle: product?.title || 'Second Hand Product',
        productPrice: String(productPrice),
        paymentType: paymentTypeForBackend,
        deliveryOption,
        deliveryArea,
        amount: String(payableAmount),
        bookingAmount: String(bookingFee),
        deliveryFee: String(currentDeliveryFee),
        remainingAmount: String(remainingAmount),
        method: selectedMethod,
        recipientPhone: buyerPhone,
        deliveryAddress: finalAddress,
      },
    });
  };

  if (isLoading && !product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <ThemedText style={styles.headerTitle} numberOfLines={1}>
              {t('Product Details', 'পণ্যের বিস্তারিত')}
            </ThemedText>
          </View>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Main Image Slider Skeleton */}
          <DetailsSkeletonItem
            style={{
              width: '100%',
              height: sliderHeight,
              borderRadius: 16,
              marginBottom: 12,
            }}
          />

          {/* Details & Price Card Skeleton */}
          <View style={styles.sectionCard}>
            <DetailsSkeletonItem style={{ width: '40%', height: 16, borderRadius: 4, marginBottom: 8 }} />
            <DetailsSkeletonItem style={{ width: '80%', height: 22, borderRadius: 4, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              <DetailsSkeletonItem style={{ width: 70, height: 20, borderRadius: 4 }} />
              <DetailsSkeletonItem style={{ width: 80, height: 20, borderRadius: 4 }} />
            </View>
            <DetailsSkeletonItem style={{ width: '45%', height: 26, borderRadius: 6 }} />
          </View>

          {/* Guarantee Card Skeleton */}
          <View style={styles.sectionCard}>
            <DetailsSkeletonItem style={{ width: '55%', height: 18, borderRadius: 4, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <DetailsSkeletonItem style={{ width: 44, height: 44, borderRadius: 22 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <DetailsSkeletonItem style={{ width: '60%', height: 16, borderRadius: 4 }} />
                <DetailsSkeletonItem style={{ width: '40%', height: 12, borderRadius: 4 }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <DetailsSkeletonItem style={{ width: 110, height: 20, borderRadius: 4 }} />
              <DetailsSkeletonItem style={{ width: 100, height: 20, borderRadius: 4 }} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Header */}
        <View style={styles.topBar}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <ThemedText style={styles.headerTitle} numberOfLines={1}>
              {isProductBooked
                ? t('Product Details', 'পণ্যের বিস্তারিত')
                : t('Product Details & Payment', 'পণ্যের বিস্তারিত ও পেমেন্ট')}
            </ThemedText>
            {!isProductBooked ? (
              <ThemedText style={styles.headerSubtitle}>
                {deliveryOption === 'home_delivery'
                  ? t(`Delivery Charge (৳${payableAmount})`, `ডেলিভারি চার্জ (৳${payableAmount})`)
                  : deliveryOption === 'store_pickup'
                  ? t(`Token Booking (৳${payableAmount})`, `টোকেন বুকিং (৳${payableAmount})`)
                  : t(`Full Payment (৳${payableAmount.toLocaleString()})`, `ফুল পেমেন্ট (৳${payableAmount.toLocaleString()})`)}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. Product Multi-Image Slider (Lomba / Portrait Aspect Ratio) */}
          <View
            style={[styles.imageCard, { height: sliderHeight }]}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - sliderWidth) > 1) {
                setSliderWidth(w);
              }
            }}
          >
            <ScrollView
              ref={imageSliderRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              bounces={false}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / Math.max(1, sliderWidth));
                const clamped = Math.max(0, Math.min(idx, productImages.length - 1));
                setActiveImageIndex(clamped);
              }}
              style={{ width: sliderWidth, height: sliderHeight }}
            >
              {productImages.map((imgUri, idx) => (
                <Image
                  key={`${imgUri}-${idx}`}
                  source={{ uri: imgUri }}
                  style={{ width: sliderWidth, height: sliderHeight }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>

            {/* Pagination Dots & Image Counter */}
            {productImages.length > 1 ? (
              <View style={styles.sliderBottomBar} pointerEvents="none">
                <View style={{ width: 40 }} />
                <View style={styles.sliderDotsRow}>
                  {productImages.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.sliderDot,
                        i === activeImageIndex && styles.sliderDotActive,
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.sliderCounterPill}>
                  <ThemedText style={styles.sliderCounterText}>
                    {activeImageIndex + 1}/{productImages.length}
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </View>

          {/* Mini Thumbnail Strip (tap to jump to any photo) */}
          {productImages.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbStripContent}
              style={styles.thumbStrip}
            >
              {productImages.map((imgUri, idx) => {
                const isActive = idx === activeImageIndex;
                return (
                  <Pressable
                    key={`thumb-${idx}`}
                    onPress={() => handleSelectSlide(idx)}
                    style={[
                      styles.thumbItem,
                      isActive && styles.thumbItemActive,
                    ]}
                  >
                    <Image
                      source={{ uri: imgUri }}
                      style={styles.thumbImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* 2. Product Title & Price Header (Location, Original Price & Discount Removed) */}
          <View style={styles.detailsCard}>
            <ThemedText style={styles.productTitle}>{product?.title}</ThemedText>

            <View style={styles.categoryRow}>
              <View style={styles.categoryBadge}>
                <ThemedText style={styles.categoryBadgeText} numberOfLines={1}>
                  {product?.categoryName || product?.category || ''}
                </ThemedText>
              </View>
            </View>

            {/* Product Multi Badges Row */}
            {productBadges.length > 0 && (
              <View style={styles.detailBadgeRow}>
                {productBadges.map((bg, idx) => (
                  <View key={idx} style={styles.detailBadgePill}>
                    <ThemedText style={styles.detailBadgeText} numberOfLines={1}>{bg}</ThemedText>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.priceContainer}>
              <View>
                <ThemedText style={styles.priceLabel}>{t('Selling Price', 'বিক্রয় মূল্য')}</ThemedText>
                <ThemedText style={styles.mainPrice}>
                  ৳ {productPrice.toLocaleString()}
                </ThemedText>
              </View>
              {isProductBooked ? (
                <View style={styles.bookedStatusPill}>
                  <Ionicons name="lock-closed" size={13} color="#DC2626" />
                  <ThemedText style={styles.bookedStatusPillText} numberOfLines={1}>
                    {t('Booked', 'বুক করা আছে')}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          {/* 3-5. Checkout & Payment Sections (Only shown when product is available) */}
          {!isProductBooked ? (
            <>
          {/* 3. Choose Delivery & Payment Option (Compact Cards + Fit Badges) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cube-outline" size={20} color="#0284c7" />
              <ThemedText style={styles.sectionTitle}>
                {t('Delivery & Payment Option *', 'পণ্য গ্রহণের মাধ্যম ও পেমেন্ট *')}
              </ThemedText>
            </View>

            {/* OPTION 1: HOME DELIVERY (CASH ON DELIVERY - PAY DELIVERY CHARGE TO BOOK) */}
            <Pressable
              style={[
                styles.optionCard,
                deliveryOption === 'home_delivery' && styles.optionCardActive,
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  try {
                    Haptics.selectionAsync();
                  } catch {}
                }
                setDeliveryOption('home_delivery');
              }}
            >
              <View style={styles.optionTopRow}>
                <View style={styles.radioRow}>
                  <View
                    style={[
                      styles.radioCircle,
                      deliveryOption === 'home_delivery' && styles.radioCircleActive,
                    ]}
                  >
                    {deliveryOption === 'home_delivery' && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1, marginLeft: 8, marginRight: 6 }}>
                    <ThemedText style={styles.optionTitle} numberOfLines={1}>
                      {t('🚚 Home Delivery (Cash on Delivery)', '🚚 হোম ডেলিভারি (Cash on Delivery)')}
                    </ThemedText>
                    <View style={[styles.optionTagBadge, { backgroundColor: '#FEF3C7' }]}>
                      <ThemedText style={[styles.optionTagText, { color: '#D97706' }]} numberOfLines={1}>
                        {t('🔥 Pay Delivery Charge Only', '🔥 ডেলিভারি চার্জ অগ্রিম')}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <ThemedText style={styles.optionPrice}>৳ {currentDeliveryFee}</ThemedText>
              </View>

              <ThemedText style={styles.optionExplanation}>
                {t(
                  `Pay delivery fee now to confirm. Pay ৳${productPrice.toLocaleString()} on delivery.`,
                  `অগ্রিম ডেলিভারি চার্জ দিয়ে বুক করুন, বাকি ৳${productPrice.toLocaleString()} হাতে পেয়ে দিন।`
                )}
              </ThemedText>
            </Pressable>

            {/* OPTION 2: STORE PICKUP (PAY TOKEN BOOKING CHARGE, INSPECT AT STORE) */}
            <Pressable
              style={[
                styles.optionCard,
                deliveryOption === 'store_pickup' && styles.optionCardActive,
                { marginTop: 8 },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  try {
                    Haptics.selectionAsync();
                  } catch {}
                }
                setDeliveryOption('store_pickup');
              }}
            >
              <View style={styles.optionTopRow}>
                <View style={styles.radioRow}>
                  <View
                    style={[
                      styles.radioCircle,
                      deliveryOption === 'store_pickup' && styles.radioCircleActive,
                    ]}
                  >
                    {deliveryOption === 'store_pickup' && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1, marginLeft: 8, marginRight: 6 }}>
                    <ThemedText style={styles.optionTitle} numberOfLines={1}>
                      {t('🏬 Store Pickup (Inspect at Shop)', '🏬 দোকানে এসে নেওয়া (শপ পিকআপ)')}
                    </ThemedText>
                    <View style={[styles.optionTagBadge, { backgroundColor: '#EFF6FF' }]}>
                      <ThemedText style={[styles.optionTagText, { color: '#1D4ED8' }]} numberOfLines={1}>
                        {t('✨ Check Before You Buy', '✨ দেখে বুঝে নেওয়ার সুযোগ')}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <ThemedText style={styles.optionPrice}>৳ {bookingFee}</ThemedText>
              </View>

              <ThemedText style={styles.optionExplanation}>
                {t(
                  `Reserve with ৳${bookingFee} booking fee. Inspect at shop & pay ৳${(productPrice - bookingFee).toLocaleString()}.`,
                  `৳${bookingFee} বুকিং দিয়ে রিজার্ভ রাখুন, দোকানে দেখে বাকি ৳${(productPrice - bookingFee).toLocaleString()} দিন।`
                )}
              </ThemedText>
            </Pressable>

            {/* OPTION 3: FULL ONLINE PAYMENT */}
            <Pressable
              style={[
                styles.optionCard,
                deliveryOption === 'online' && styles.optionCardActive,
                { marginTop: 8 },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  try {
                    Haptics.selectionAsync();
                  } catch {}
                }
                setDeliveryOption('online');
              }}
            >
              <View style={styles.optionTopRow}>
                <View style={styles.radioRow}>
                  <View
                    style={[
                      styles.radioCircle,
                      deliveryOption === 'online' && styles.radioCircleActive,
                    ]}
                  >
                    {deliveryOption === 'online' && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1, marginLeft: 8, marginRight: 6 }}>
                    <ThemedText style={styles.optionTitle} numberOfLines={1}>
                      {t('💳 Full Online Payment', '💳 সম্পূর্ণ অনলাইন পেমেন্ট')}
                    </ThemedText>
                    <View style={[styles.optionTagBadge, { backgroundColor: '#DCFCE7' }]}>
                      <ThemedText style={[styles.optionTagText, { color: '#16A34A' }]} numberOfLines={1}>
                        {t('Direct Home Delivery', 'সরাসরি হোম ডেলিভারি')}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <ThemedText style={styles.optionPrice}>
                  ৳ {(productPrice + currentDeliveryFee).toLocaleString()}
                </ThemedText>
              </View>

              <ThemedText style={styles.optionExplanation}>
                {t(
                  'Pay full price & delivery fee upfront. Zero due on delivery.',
                  'সম্পূর্ণ মূল্য ও ডেলিভারি চার্জ অগ্রিম পরিশোধ, ডেলিভারিতে বাড়তি খরচ নেই।'
                )}
              </ThemedText>
            </Pressable>
          </View>

          {/* 4. Delivery Area & Address OR Store Details */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name={deliveryOption === 'store_pickup' ? 'storefront-outline' : 'location-outline'}
                size={20}
                color="#0284c7"
              />
              <ThemedText style={styles.sectionTitle}>
                {deliveryOption === 'store_pickup'
                  ? t('Customer Info & Showroom *', 'গ্রাহক তথ্য ও শোরুম লোকেশন *')
                  : t('Delivery Area & Address *', 'ডেলিভারি এলাকা ও ঠিকানা *')}
              </ThemedText>
            </View>

            {/* If Home Delivery or Online: Choose Delivery Area */}
            {deliveryOption !== 'store_pickup' ? (
              <View style={styles.areaSelectorContainer}>
                <ThemedText style={styles.inputLabel}>
                  {t('Select Delivery Area:', 'ডেলিভারি এলাকা নির্বাচন করুন:')}
                </ThemedText>
                <View style={styles.areaRow}>
                  {/* Inside Dhaka */}
                  <Pressable
                    style={[
                      styles.areaPill,
                      deliveryArea === 'inside_dhaka' && styles.areaPillActive,
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        try {
                          Haptics.selectionAsync();
                        } catch {}
                      }
                      setDeliveryArea('inside_dhaka');
                    }}
                  >
                    <View style={styles.areaPillHeader}>
                      <Ionicons
                        name="location"
                        size={14}
                        color={deliveryArea === 'inside_dhaka' ? '#0284C7' : '#64748B'}
                      />
                      <ThemedText
                        style={[
                          styles.areaPillTitle,
                          deliveryArea === 'inside_dhaka' && styles.areaPillTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {t('Inside Dhaka', 'ঢাকার ভেতরে')}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.areaPillFee,
                        deliveryArea === 'inside_dhaka' && styles.areaPillFeeActive,
                      ]}
                      numberOfLines={1}
                    >
                      {t(`Charge: ৳${deliveryFeeInsideDhaka}`, `চার্জ: ৳${deliveryFeeInsideDhaka}`)}
                    </ThemedText>
                  </Pressable>

                  {/* Outside Dhaka */}
                  <Pressable
                    style={[
                      styles.areaPill,
                      deliveryArea === 'outside_dhaka' && styles.areaPillActive,
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        try {
                          Haptics.selectionAsync();
                        } catch {}
                      }
                      setDeliveryArea('outside_dhaka');
                    }}
                  >
                    <View style={styles.areaPillHeader}>
                      <Ionicons
                        name="map"
                        size={14}
                        color={deliveryArea === 'outside_dhaka' ? '#0284C7' : '#64748B'}
                      />
                      <ThemedText
                        style={[
                          styles.areaPillTitle,
                          deliveryArea === 'outside_dhaka' && styles.areaPillTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {t('Outside Dhaka', 'ঢাকার বাইরে')}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.areaPillFee,
                        deliveryArea === 'outside_dhaka' && styles.areaPillFeeActive,
                      ]}
                      numberOfLines={1}
                    >
                      {t(`Charge: ৳${deliveryFeeOutsideDhaka}`, `চার্জ: ৳${deliveryFeeOutsideDhaka}`)}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* If Store Pickup: Show Store Details Card */
              <View style={styles.storePickupCard}>
                <View style={styles.storeHeaderRow}>
                  <View style={[styles.storeIconCircle, { backgroundColor: '#FFFFFF', overflow: 'hidden', padding: 0 }]}>
                    <Image
                      source={require('@/assets/images/icon.png')}
                      style={{ width: 38, height: 38, borderRadius: 19 }}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <ThemedText style={styles.storeName}>
                      {t('Buy & Sell BD Main Showroom', 'Buy & Sell BD প্রধান শোরুম')}
                    </ThemedText>
                    <ThemedText style={styles.storeAddress}>
                      {appSettings.shopAddress || OFFICIAL_SHOP_ADDRESS}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.storeMetaRow}>
                  <View style={styles.storeMetaItem}>
                    <Ionicons name="time-outline" size={14} color="#16A34A" />
                    <ThemedText style={styles.storeMetaText}>
                      {t('10:00 AM - 9:00 PM (Daily)', 'সকাল ১০টা - রাত ৯টা (প্রতিদিন)')}
                    </ThemedText>
                  </View>
                  <View style={styles.storeMetaItem}>
                    <Ionicons name="call-outline" size={14} color="#0284C7" />
                    <ThemedText style={styles.storeMetaText}>
                      {t('Helpline:', 'হেল্পলাইন:')} {appSettings.supportPhone || '0197272313'}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.pickupNoticeBox}>
                  <Ionicons name="information-circle-outline" size={16} color="#0284C7" />
                  <ThemedText style={styles.pickupNoticeText}>
                    {t(
                      'After booking is complete, the product will be reserved in your name for 3 working days at the showroom. You can inspect and collect it.',
                      'বুকিং সম্পন্ন হলে পণ্যটি ৩ কার্যদিবস আপনার নামে শোরুমে সংরক্ষিত থাকবে। এসে চেক করে নিয়ে যাবেন।'
                    )}
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Customer Phone Input */}
            <View style={[styles.inputGroup, { marginTop: 12 }]}>
              <ThemedText style={styles.inputLabel}>
                {t('Customer Mobile Number *', 'গ্রাহকের মোবাইল নম্বর *')}
              </ThemedText>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={buyerPhone}
                  onChangeText={setBuyerPhone}
                  placeholder="01XXXXXXXXX"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>
            </View>

            {/* Delivery Address Input (Home Delivery only) */}
            {deliveryOption !== 'store_pickup' ? (
              <View style={[styles.inputGroup, { marginTop: 12 }]}>
                <ThemedText style={styles.inputLabel}>
                  {t('Full Delivery Address *', 'বিস্তারিত ডেলিভারি ঠিকানা *')}
                </ThemedText>
                <View style={styles.inputContainer}>
                  <Ionicons name="home-outline" size={18} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                    placeholder={t('e.g. House 12, Road 4, Mirpur 10, Dhaka', 'যেমন: বাসা নং ১২, রোড ৪, মিরপুর ১০, ঢাকা')}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
            ) : (
              <View style={[styles.inputGroup, { marginTop: 12 }]}>
                <ThemedText style={styles.inputLabel}>
                  {t('Preferred Visit Time / Note (Optional)', 'আসার সম্ভাব্য সময় / নোট (ঐচ্ছিক)')}
                </ThemedText>
                <View style={styles.inputContainer}>
                  <Ionicons name="calendar-outline" size={18} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={pickupNote}
                    onChangeText={setPickupNote}
                    placeholder={t('e.g. Will visit this afternoon', 'যেমন: আজ বিকেলে আসব')}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
            )}
          </View>

          {/* 5. Select Payment Method */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet-outline" size={20} color="#0284c7" />
              <ThemedText style={styles.sectionTitle}>
                {t('Select Payment Method *', 'পেমেন্ট মেথড নির্বাচন করুন *')}
              </ThemedText>
            </View>

            <View style={styles.methodList}>
              {PAYMENT_METHODS.map((m) => {
                const isSelected = selectedMethod === m.id;
                return (
                  <Pressable
                    key={m.id}
                    style={[
                      styles.methodCard,
                      isSelected && { borderColor: m.color, backgroundColor: m.bgColor },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        try {
                          Haptics.selectionAsync();
                        } catch {}
                      }
                      setSelectedMethod(m.id);
                    }}
                  >
                    <Image source={m.logo} style={styles.methodLogo} resizeMode="contain" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <ThemedText style={styles.methodName}>
                        {isBangla ? `${m.banglaName} (${m.name})` : m.name}
                      </ThemedText>
                      <ThemedText style={styles.methodSubtitle}>
                        {isBangla ? m.subtitle : `Instant ${m.name} Wallet Payment`}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.methodRadio,
                        isSelected && { borderColor: m.color, backgroundColor: m.color },
                      ]}
                    >
                      {isSelected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
            </>
          ) : null}

          {/* 6. Official Store & Product Details (Single Vendor) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#0284c7" />
              <ThemedText style={styles.sectionTitle}>
                {t('Product Details & Guarantee', 'পণ্যের বিবরণ ও নিশ্চয়তা')}
              </ThemedText>
            </View>

            <View style={styles.sellerRow}>
              {/* Top Row: Logo Icon on Left, Official Badge on Right */}
              <View style={styles.sellerTopRow}>
                <View style={styles.sellerAvatar}>
                  <Image
                    source={require('@/assets/images/icon.png')}
                    style={{ width: 44, height: 44, borderRadius: 22 }}
                    resizeMode="cover"
                  />
                </View>
                <View style={styles.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
                  <ThemedText style={styles.verifiedText}>{t('Official', 'অফিসিয়াল')}</ThemedText>
                </View>
              </View>

              {/* Store Name Below Logo */}
              <ThemedText style={styles.sellerName}>
                {t('Buy & Sell BD Official Store', 'Buy & Sell BD অফিসিয়াল শপ')}
              </ThemedText>

              {/* Quality & Verification info under Name */}
              <ThemedText style={styles.sellerPhone}>
                {t('100% Quality Tested & Verified', '১০০% কোয়ালিটি টেস্টেড ও ভেরিফাইড')}
              </ThemedText>
            </View>

            {/* Single Vendor Guarantee Highlights (Row 1 has 2 badges, Row 2 has 1 badge) */}
            <View style={styles.assuranceContainer}>
              <View style={styles.assuranceGridRow}>
                <View style={styles.assuranceBadgeFlex}>
                  <Ionicons name="shield-checkmark-outline" size={13} color="#15803D" />
                  <ThemedText style={styles.assuranceText} numberOfLines={1}>
                    {t('7-Day Replacement', '৭ দিনের রিপ্লেসমেন্ট')}
                  </ThemedText>
                </View>
                <View style={styles.assuranceBadgeFlex}>
                  <Ionicons name="checkmark-done-circle-outline" size={13} color="#15803D" />
                  <ThemedText style={styles.assuranceText} numberOfLines={1}>
                    {t('100% Authentic', '১০০% অরিজিনাল')}
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.assuranceGridRow, { marginTop: 6 }]}>
                <View style={styles.assuranceBadgeFlex}>
                  <Ionicons name="cube-outline" size={13} color="#15803D" />
                  <ThemedText style={styles.assuranceText} numberOfLines={1}>
                    {t('Inspect on Delivery', 'ডেলিভারিতে দেখে নেওয়ার সুযোগ')}
                  </ThemedText>
                </View>
              </View>
            </View>

            {product?.description ? (
              <View style={styles.descriptionBox}>
                <ThemedText style={styles.descHeading}>{t('Description:', 'পণ্যের বিবরণ:')}</ThemedText>
                <ThemedText style={styles.descText}>{product.description}</ThemedText>
              </View>
            ) : null}

            {product?.specifications && product.specifications.length > 0 ? (
              <View style={styles.specsContainer}>
                {product.specifications.map((spec, i) => (
                  <View key={i} style={styles.specItem}>
                    <ThemedText style={styles.specLabel}>{spec.label}:</ThemedText>
                    <ThemedText style={styles.specVal}>{spec.value}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* 7. Order Summary Box (Only shown when available) */}
          {!isProductBooked ? (
          <View style={styles.summaryCard}>
            <ThemedText style={styles.summaryTitle}>{t('Order Summary', 'অর্ডার সামারি')}</ThemedText>

            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>{t('Product', 'পণ্যের নাম')}</ThemedText>
              <ThemedText style={styles.summaryVal} numberOfLines={1}>
                {product?.title}
              </ThemedText>
            </View>

            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>{t('Price', 'পণ্যের মূল্য')}</ThemedText>
              <ThemedText style={styles.summaryVal}>
                ৳ {productPrice.toLocaleString()}
              </ThemedText>
            </View>

            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>{t('Method', 'পণ্য গ্রহণের মাধ্যম')}</ThemedText>
              <ThemedText style={styles.summaryValHighlight}>
                {deliveryOption === 'home_delivery'
                  ? t(
                      `🚚 Home Delivery (${deliveryArea === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'})`,
                      `🚚 হোম ডেলিভারি (${deliveryArea === 'inside_dhaka' ? 'ঢাকার ভেতরে' : 'ঢাকার বাইরে'})`
                    )
                  : deliveryOption === 'store_pickup'
                  ? t('🏬 Store Pickup', '🏬 শোরুম পিকআপ')
                  : t('💳 Full Online Payment', '💳 সম্পূর্ণ অনলাইন পেমেন্ট')}
              </ThemedText>
            </View>

            {deliveryOption !== 'store_pickup' ? (
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>{t('Delivery Fee', 'ডেলিভারি চার্জ')}</ThemedText>
                <ThemedText style={styles.summaryVal}>
                  ৳ {currentDeliveryFee} ({deliveryArea === 'inside_dhaka' ? t('Inside Dhaka', 'ঢাকার ভেতরে') : t('Outside Dhaka', 'ঢাকার বাইরে')})
                </ThemedText>
              </View>
            ) : (
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>{t('Delivery Fee', 'ডেলিভারি চার্জ')}</ThemedText>
                <ThemedText style={[styles.summaryVal, { color: '#16A34A', fontWeight: '700' }]}>
                  {t('৳ 0 (Free Shop Pickup)', '৳ ০ (ফ্রি শপ পিকআপ)')}
                </ThemedText>
              </View>
            )}

            <View style={styles.receiptDivider} />

            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, { fontWeight: '700', color: '#F8FAFC' }]}>
                {deliveryOption === 'home_delivery'
                  ? t('Pay Now (Delivery Charge)', 'এখন প্রদেয় (ডেলিভারি চার্জ)')
                  : deliveryOption === 'store_pickup'
                  ? t('Pay Now (Token Booking)', 'এখন প্রদেয় (টোকেন বুকিং)')
                  : t('Total Payable Now', 'এখন মোট পরিশোধ')}
              </ThemedText>
              <ThemedText style={styles.summaryPayable}>
                ৳ {payableAmount.toLocaleString()}
              </ThemedText>
            </View>

            {remainingAmount > 0 ? (
              <View style={[styles.summaryRow, { marginBottom: 0 }]}>
                <ThemedText style={styles.summaryLabel}>
                  {deliveryOption === 'home_delivery'
                    ? t('Due on Delivery (COD)', 'ক্যাশ অন ডেলিভারিতে প্রদেয়')
                    : t('Due at Shop', 'দোকানে এসে দেখে প্রদেয়')}
                </ThemedText>
                <ThemedText style={styles.summaryRemaining}>
                  ৳ {remainingAmount.toLocaleString()}
                </ThemedText>
              </View>
            ) : null}
          </View>
          ) : null}
        </ScrollView>

        {/* Bottom Sticky Action Bar */}
        <View style={styles.bottomBar}>
          {isProductBooked ? (
            <View style={styles.bookedBottomBanner}>
              <Ionicons name="lock-closed" size={18} color="#DC2626" />
              <ThemedText style={styles.bookedBottomBannerText} numberOfLines={1}>
                {t('This product is already booked', 'এই পণ্যটি ইতিমধ্যে বুক করা আছে')}
              </ThemedText>
            </View>
          ) : (
            <>
              <View style={styles.bottomBarInfo}>
                <ThemedText style={styles.bottomBarLabel}>
                  {deliveryOption === 'home_delivery'
                    ? t('Delivery Charge:', 'প্রদেয় ডেলিভারি চার্জ:')
                    : deliveryOption === 'store_pickup'
                    ? t('Booking Fee:', 'প্রদেয় বুকিং ফি:')
                    : t('Total Payable:', 'মোট পরিশোধ মূল্য:')}
                </ThemedText>
                <ThemedText style={styles.bottomBarAmount}>
                  ৳ {payableAmount.toLocaleString()}
                </ThemedText>
              </View>

              <Pressable style={styles.payButton} onPress={handleProceedToPayment}>
                <ThemedText style={styles.payButtonText} numberOfLines={1}>
                  {deliveryOption === 'home_delivery'
                    ? t(`Pay Delivery (৳${payableAmount})`, `ডেলিভারি চার্জ পরিশোধ (৳${payableAmount})`)
                    : deliveryOption === 'store_pickup'
                    ? t(`Book Now (৳${payableAmount})`, `বুকিং সম্পন্ন করুন (৳${payableAmount})`)
                    : t(`Pay Now (৳${payableAmount.toLocaleString()})`, `পেমেন্ট সম্পন্ন করুন (৳${payableAmount.toLocaleString()})`)}
                </ThemedText>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 6 }} />
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 16,
  },
  imageCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlayBadges: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conditionTag: {
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    alignSelf: 'flex-start',
  },
  conditionText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    includeFontPadding: false,
  },
  hotDealTag: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    alignSelf: 'flex-start',
  },
  hotDealText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    includeFontPadding: false,
  },
  sliderBottomBar: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  sliderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  sliderDotActive: {
    width: 16,
    backgroundColor: '#FFFFFF',
  },
  sliderCounterPill: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 38,
    alignItems: 'center',
  },
  sliderCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    includeFontPadding: false,
  },
  thumbStrip: {
    marginTop: 10,
  },
  thumbStripContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  thumbItem: {
    width: 50,
    height: 62,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#E2E8F0',
  },
  thumbItemActive: {
    borderColor: '#0284C7',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 23,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  categoryBadge: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    fontSize: 9.5,
    lineHeight: 12,
    color: '#0284C7',
    fontWeight: '700',
    includeFontPadding: false,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  detailBadgePill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  detailBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#0284C7',
    includeFontPadding: false,
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  priceLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#64748B',
    fontWeight: '600',
    includeFontPadding: false,
  },
  mainPrice: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
    includeFontPadding: false,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 8,
    includeFontPadding: false,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 17,
  },
  optionCard: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  optionCardActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  optionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioCircleActive: {
    borderColor: '#0284C7',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#0284C7',
  },
  optionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#0F172A',
    includeFontPadding: false,
  },
  optionTagBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 3,
  },
  optionTagText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  optionPrice: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: '#0F172A',
    includeFontPadding: false,
    flexShrink: 0,
  },
  optionExplanation: {
    fontSize: 11,
    color: '#475569',
    marginTop: 6,
    lineHeight: 16,
    includeFontPadding: false,
  },
  areaSelectorContainer: {
    marginBottom: 8,
  },
  areaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  areaPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  areaPillActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  areaPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  areaPillTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#334155',
    includeFontPadding: false,
  },
  areaPillTitleActive: {
    color: '#0284C7',
  },
  areaPillFee: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#0284C7',
    marginTop: 3,
    includeFontPadding: false,
  },
  areaPillFeeActive: {
    color: '#0369A1',
  },
  storePickupCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
  },
  storeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  storeAddress: {
    fontSize: 12,
    color: '#0369A1',
    marginTop: 2,
  },
  storeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0F2FE',
  },
  storeMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  storeMetaText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  pickupNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  pickupNoticeText: {
    fontSize: 11,
    color: '#0369A1',
    flex: 1,
    lineHeight: 16,
  },
  inputGroup: {
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  methodList: {
    gap: 8,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  methodLogo: {
    width: 36,
    height: 36,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  methodSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  methodRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerRow: {
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  sellerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sellerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  sellerPhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'center',
  },
  verifiedText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '700',
    color: '#16A34A',
    includeFontPadding: false,
  },
  assuranceContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  assuranceGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  assuranceBadgeFlex: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignSelf: 'flex-start',
  },
  assuranceText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '700',
    color: '#15803D',
    includeFontPadding: false,
  },
  descriptionBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  descHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  descText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  specsContainer: {
    marginTop: 12,
    gap: 6,
  },
  specItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  specLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  specVal: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#0F172A',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: '#94A3B8',
    flexShrink: 0,
    includeFontPadding: false,
  },
  summaryVal: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'right',
    includeFontPadding: false,
  },
  summaryValHighlight: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#38BDF8',
    flex: 1,
    textAlign: 'right',
    includeFontPadding: false,
  },
  summaryPayable: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#38BDF8',
    flexShrink: 0,
    includeFontPadding: false,
  },
  summaryRemaining: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#F59E0B',
    flexShrink: 0,
    includeFontPadding: false,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 10,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  bottomBarInfo: {
    flex: 1,
  },
  bottomBarLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  bottomBarAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  bookedStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'center',
  },
  bookedStatusPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#DC2626',
    includeFontPadding: false,
    flexShrink: 0,
  },
  bookedBottomBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  bookedBottomBannerText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#DC2626',
    includeFontPadding: false,
  },
});
