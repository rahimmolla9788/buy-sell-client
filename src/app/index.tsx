import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  useWindowDimensions,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SecondHandProduct, ProductCategory, AppSettings } from '@/types/product';
import { PRODUCT_CATEGORIES, DEFAULT_PRODUCTS, DEFAULT_BOOKING_AMOUNT } from '@/constants/products';
import { fetchProducts, fetchAppSettings } from '@/services/product-service';
import { getSocket } from '@/services/socket';

const LOCATIONS = [
  'সকল বাংলাদেশ',
  'ঢাকা',
  'চট্টগ্রাম',
  'রাজশাহী',
  'সিলেট',
  'খুলনা',
  'বরিশাল',
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout, isLoading: isAuthLoading } = useAuth();
  const { t, isBangla } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();

  // Responsive Grid Card Width (2 columns with 12px gap & 16px padding)
  const cardWidth = useMemo(() => {
    return Math.floor((screenWidth - 32 - 12) / 2);
  }, [screenWidth]);

  // Products and Settings State
  const [products, setProducts] = useState<SecondHandProduct[]>(DEFAULT_PRODUCTS);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    key: 'global_settings',
    bookingPaymentAmount: DEFAULT_BOOKING_AMOUNT,
    appName: 'BuySell - সেকেন্ড হ্যান্ড বাজার',
    supportPhone: '0197272313',
    noticeBanner: 'নিরাপদে সেকেন্ড হ্যান্ড পণ্য কিনুন বা টোকেন বুকিং মানি দিয়ে বুক করে রাখুন!',
  });

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('সকল বাংলাদেশ');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Load products and settings from backend
  const loadData = useCallback(async () => {
    try {
      const [fetchedProducts, fetchedSettings] = await Promise.all([
        fetchProducts(),
        fetchAppSettings(),
      ]);

      if (fetchedProducts && fetchedProducts.length > 0) {
        setProducts(fetchedProducts);
      }
      if (fetchedSettings) {
        setAppSettings(fetchedSettings);
      }
    } catch (e) {
      console.log('[Home] Error loading backend data:', e);
    }
  }, []);

  // Initial load & socket real-time listener
  useEffect(() => {
    let active = true;
    loadData();

    try {
      const socket = getSocket();
      const onProductsUpdate = () => {
        if (active) loadData();
      };
      const onSettingsUpdate = (updated: AppSettings) => {
        if (active && updated) setAppSettings(updated);
      };

      socket.on('products-updated', onProductsUpdate);
      socket.on('settings-updated', onSettingsUpdate);

      return () => {
        active = false;
        socket.off('products-updated', onProductsUpdate);
        socket.off('settings-updated', onSettingsUpdate);
      };
    } catch {
      return () => {
        active = false;
      };
    }
  }, [loadData]);

  // Pull to refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
    await loadData();
    setIsRefreshing(false);
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      // 1. Category Filter
      if (selectedCategory !== 'all' && (prod.category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchTitle = (prod.title || '').toLowerCase().includes(q);
        const matchDesc = (prod.description || '').toLowerCase().includes(q);
        const matchLoc = (prod.location || '').toLowerCase().includes(q);
        const matchCat = (prod.categoryName || '').toLowerCase().includes(q);
        const matchPrice = String(prod.price || '').includes(q);
        return matchTitle || matchDesc || matchLoc || matchCat || matchPrice;
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  // Select Product -> Navigate to Details & Checkout
  const handleSelectProduct = (product: SecondHandProduct) => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
    }
    router.push({
      pathname: '/payment-details',
      params: { productId: product.id },
    });
  };

  // Auth Loading
  if (isAuthLoading) {
    return (
      <View style={[styles.container, styles.centerLoader]}>
        <ActivityIndicator size="large" color="#0284C7" />
        <ThemedText style={{ marginTop: 12, color: '#64748B' }}>{t('Loading...', 'লোড হচ্ছে...')}</ThemedText>
      </View>
    );
  }

  // Not Logged In
  if (!user) {
    return <AuthScreen />;
  }

  const defaultBookingAmount = appSettings.bookingPaymentAmount || DEFAULT_BOOKING_AMOUNT;

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. TOP APP BAR */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.brandLogoImage}
              resizeMode="cover"
            />
          </View>
          <View>
            <ThemedText style={styles.brandName}>BuySell</ThemedText>
            <ThemedText style={styles.brandTagline}>
              {t('Official 2nd Hand Store', 'সেকেন্ড হ্যান্ড বাজার')}
            </ThemedText>
          </View>
        </View>

        {/* Profile Avatar Button (Navigates to Profile Page) */}
        <Pressable
          style={({ pressed }) => [
            styles.profileAvatarBtn,
            pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
          ]}
          onPress={() => router.push('/profile')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Profile"
        >
          <Image
            source={{
              uri:
                user?.avatar ||
                'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            }}
            style={styles.profileAvatarImg}
            resizeMode="cover"
          />
          <View style={styles.profileOnlineDot} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#0284C7" />
        }
      >
        {/* 2. SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t(
              'Search products, brand or model (e.g. iPhone)...',
              'পণ্য, ব্র্যান্ড বা মডেল খুঁজুন (যেমন: iPhone)...'
            )}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          )}
        </View>

        {/* 3. CATEGORIES HORIZONTAL CAROUSEL */}
        <View style={styles.sectionHeaderRow}>
          <ThemedText style={styles.sectionTitle}>{t('Categories', 'ক্যাটাগরি')}</ThemedText>
          <ThemedText style={styles.sectionCount}>
            {t(`(${PRODUCT_CATEGORIES.length - 1} categories)`, `(${PRODUCT_CATEGORIES.length - 1} টি বিভাগ)`)}
          </ThemedText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          {PRODUCT_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[
                  styles.categoryPill,
                  isSelected && styles.categoryPillActive,
                ]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    try {
                      Haptics.selectionAsync();
                    } catch {}
                  }
                  setSelectedCategory(cat.id);
                }}
              >
                <Ionicons
                  name={cat.icon}
                  size={16}
                  color={isSelected ? '#FFFFFF' : '#0284C7'}
                />
                <ThemedText
                  numberOfLines={1}
                  style={[
                    styles.categoryPillText,
                    isSelected && styles.categoryPillTextActive,
                  ]}
                >
                  {isBangla ? cat.bangla : cat.title}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 6. PRODUCTS GRID FEED */}
        <View style={styles.sectionHeaderRow}>
          <ThemedText style={styles.sectionTitle}>{t('Products', 'পণ্যসমূহ')}</ThemedText>
          <ThemedText style={styles.sectionCount}>
            {t(`(${filteredProducts.length} items found)`, `(${filteredProducts.length} টি পণ্য পাওয়া গেছে)`)}
          </ThemedText>
        </View>

        {filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color="#94A3B8" />
            <ThemedText style={styles.emptyTitle}>{t('No products found', 'কোনো পণ্য পাওয়া যায়নি')}</ThemedText>
            <ThemedText style={styles.emptyDesc}>
              {t('Try selecting another category or search term.', 'অন্য কোনো ক্যাটাগরি অথবা নাম দিয়ে চেষ্টা করুন।')}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {filteredProducts.map((item) => {
              const bookingAmt = item.bookingAmount || defaultBookingAmount;
              const hasDiscount = item.originalPrice && item.originalPrice > item.price;

              return (
                <Pressable
                  key={item.id}
                  style={[styles.productCard, { width: cardWidth }]}
                  onPress={() => handleSelectProduct(item)}
                >
                  {/* Thumbnail Image */}
                  <View style={styles.cardImageWrapper}>
                    <Image
                      source={{
                        uri:
                          item.thumbnail ||
                          (item.images && item.images[0]) ||
                          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80',
                      }}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />

                    {/* Condition Badge */}
                    <View style={styles.cardConditionBadge}>
                      <ThemedText style={styles.cardConditionText} numberOfLines={1}>
                        {isBangla
                          ? item.conditionLabel || 'ভালো'
                          : item.condition === 'used-like-new'
                          ? 'Like New'
                          : item.condition === 'used-good'
                          ? 'Good Condition'
                          : 'Fair'}
                      </ThemedText>
                    </View>

                    {item.badge ? (
                      <View style={styles.cardHotBadge}>
                        <ThemedText
                          style={styles.cardHotText}
                          numberOfLines={1}
                          textBreakStrategy="simple"
                        >
                          {item.badge}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {/* Product Details */}
                  <View style={styles.cardDetails}>
                    <ThemedText style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </ThemedText>

                    <View style={styles.cardLocationRow}>
                      <Ionicons name="location-outline" size={12} color="#64748B" />
                      <ThemedText style={styles.cardLocationText} numberOfLines={1}>
                        {appSettings.shopLocation || item.location || (isBangla ? 'মিরপুর ১০, ঢাকা' : 'Mirpur 10, Dhaka')}
                      </ThemedText>
                    </View>

                    <View style={styles.cardPriceRow}>
                      <ThemedText style={styles.cardPrice}>
                        ৳ {item.price ? item.price.toLocaleString() : 0}
                      </ThemedText>
                      {hasDiscount ? (
                        <ThemedText style={styles.cardOriginalPrice}>
                          ৳{item.originalPrice?.toLocaleString()}
                        </ThemedText>
                      ) : null}
                    </View>

                    {/* Booking / Booked Tag (No price/amount shown on card) */}
                    {item.status !== 'available' ? (
                      <View style={styles.bookedTag}>
                        <ThemedText style={styles.bookedTagText} numberOfLines={1}>
                          {t('🔒 Booked', '🔒 বুক করা আছে')}
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={styles.bookingTag}>
                        <ThemedText style={styles.bookingTagText} numberOfLines={1}>
                          {t('🔖 Book Now', '🔖 বুকিং করুন')}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerLoader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  brandLogoImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '700',
  },
  profileAvatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#0284C7',
    position: 'relative',
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  profileAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  profileOnlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 0,
  },
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginTop: 14,
  },
  promoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  promoBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  promoBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  promoDesc: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionCount: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  categoriesScroll: {
    gap: 8,
    paddingVertical: 4,
    paddingRight: 16,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    flexShrink: 0,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    flexShrink: 0,
    includeFontPadding: false,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  locationsScroll: {
    gap: 8,
    paddingVertical: 8,
  },
  locationPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  locationPillActive: {
    backgroundColor: '#0F172A',
  },
  locationPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  locationPillTextActive: {
    color: '#FFFFFF',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardImageWrapper: {
    width: '100%',
    height: 125,
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardConditionBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  cardConditionText: {
    color: '#38BDF8',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    includeFontPadding: false,
  },
  cardHotBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#E1146D',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  cardHotText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    includeFontPadding: false,
    flexShrink: 0,
  },
  cardDetails: {
    padding: 10,
    gap: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    minHeight: 36,
  },
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardLocationText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A',
  },
  cardOriginalPrice: {
    fontSize: 10,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  bookingTag: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingTagText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: '#B45309',
    includeFontPadding: false,
  },
  bookedTag: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookedTagText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: '#DC2626',
    includeFontPadding: false,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
  },
});
