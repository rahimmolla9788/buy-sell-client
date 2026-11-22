import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { PaymentMethodId, PAYMENT_METHODS } from '@/app/payment-details';
import {
  PaymentGatewayView,
  PaymentConfirmData,
  PaymentMethodItem,
} from '@/components/payment-modal';

const { width } = Dimensions.get('window');

export default function PaymentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    productId?: string;
    productTitle?: string;
    productPrice?: string;
    paymentType?: string;
    deliveryOption?: string;
    deliveryArea?: string;
    amount?: string;
    bookingAmount?: string;
    deliveryFee?: string;
    remainingAmount?: string;
    method?: PaymentMethodId;
    recipientPhone?: string;
    deliveryAddress?: string;
  }>();

  const productId = params.productId || 'prod_item';
  const productTitle = params.productTitle || 'Second Hand Product';
  const productPrice = Number(params.productPrice) || 0;
  const paymentType = (params.paymentType as 'cod_delivery' | 'store_pickup' | 'booking' | 'online') || 'cod_delivery';
  const payableAmount = Number(params.amount) || (paymentType === 'store_pickup' || paymentType === 'booking' ? 50 : 70);
  const recipientPhone = params.recipientPhone || user?.phoneNumber || '';
  const deliveryAddress = params.deliveryAddress || 'মিরপুর ১০, ঢাকা';
  const selectedMethodId: PaymentMethodId = (params.method as PaymentMethodId) || 'bkash';

  const remainingAmount = params.remainingAmount
    ? Number(params.remainingAmount)
    : paymentType === 'cod_delivery'
    ? productPrice
    : paymentType === 'store_pickup' || paymentType === 'booking'
    ? Math.max(0, productPrice - payableAmount)
    : 0;

  // Find payment method object
  const methodItem: PaymentMethodItem = useMemo(() => {
    const found = PAYMENT_METHODS.find((m) => m.id === selectedMethodId);
    if (found) {
      return {
        id: found.id,
        name: found.name,
        banglaName: found.banglaName,
        color: found.color,
        iconName: 'wallet-outline',
      };
    }
    return {
      id: 'bkash',
      name: 'bKash',
      banglaName: 'বিকাশ',
      color: '#E2136E',
      iconName: 'wallet-outline',
    };
  }, [selectedMethodId]);

  // Processing & Success states
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Retry state for gateway issue screen
  const [isRetryingGateway, setIsRetryingGateway] = useState(false);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);

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

  // Copy Transaction ID
  const handleCopyTrx = async () => {
    if (transactionId) {
      await Clipboard.setStringAsync(transactionId);
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
      Alert.alert('কপি হয়েছে', `ট্রানজেকশন আইডি: ${transactionId}`);
    }
  };

  // Payment Gateway Confirmation Handler
  const handleGatewayConfirm = (data: PaymentConfirmData) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      const newTrx = `TRX${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`;
      setTransactionId(newTrx);
      setIsSuccess(true);
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
    }, 600);
  };

  // Handle Retry on Gateway Issue Screen
  const handleRetryGateway = () => {
    setIsRetryingGateway(true);
    setRetryFeedback(null);
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
    setTimeout(() => {
      setIsRetryingGateway(false);
      setRetryFeedback('Payment servers are currently busy. Our team is actively working on it. Please try again in a few moments.');
    }, 1600);
  };

  // ============================================================================
  // ⚠️ PAYMENT ISSUE SCREEN (WHEN USER IS BLOCKED - IN ENGLISH)
  // No modal, no popup, no mention of block or admin. Shows payment issue page.
  // ============================================================================
  if (user?.isBlocked) {
    return (
      <View style={styles.whiteContainer}>
        <SafeAreaView edges={['top']} style={styles.statusBarArea}>
          <View style={styles.topHeader}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </Pressable>
            <ThemedText style={styles.headerTitleText}>Payment</ThemedText>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>

        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.whiteSafeArea}>
          <ScrollView contentContainerStyle={styles.gatewayIssueScroll} showsVerticalScrollIndicator={false}>
            {/* Illustrated Icon Wrapper */}
            <View style={styles.issueIconWrapper}>
              <View style={styles.issueOuterCircle}>
                <View style={styles.issueInnerCircle}>
                  <Ionicons name="cloud-offline-outline" size={48} color="#D97706" />
                </View>
              </View>
            </View>

            {/* Main Headline in English */}
            <ThemedText style={styles.issueHeadline}>
              Payment Issue
            </ThemedText>

            {/* Subheading / Reassuring explanation in English */}
            <ThemedText style={styles.issueSubheading}>
              We are currently experiencing a technical issue with our payment servers. Our technical team is actively working to resolve it, and the service will be fixed very soon.
            </ThemedText>

            {/* Payment Status Information Card in English */}
            <View style={styles.issueStatusCard}>
              <View style={styles.issueStatusRow}>
                <ThemedText style={styles.issueStatusLabel}>Payment Status:</ThemedText>
                <View style={styles.issueStatusPill}>
                  <View style={styles.issueStatusDot} />
                  <ThemedText style={styles.issueStatusPillText}>Maintenance in Progress</ThemedText>
                </View>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.issueStatusRow}>
                <ThemedText style={styles.issueStatusLabel}>Selected Method:</ThemedText>
                <ThemedText style={styles.issueStatusValue}>
                  {methodItem.name} Payment
                </ThemedText>
              </View>

              <View style={styles.issueStatusRow}>
                <ThemedText style={styles.issueStatusLabel}>Error Reference:</ThemedText>
                <ThemedText style={[styles.issueStatusValue, { color: '#0284C7', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
                  ERR_PAYMENT_TIMEOUT_503
                </ThemedText>
              </View>

              <View style={styles.issueStatusRow}>
                <ThemedText style={styles.issueStatusLabel}>Expected Resolution:</ThemedText>
                <ThemedText style={[styles.issueStatusValue, { color: '#16A34A' }]}>
                  Within a few minutes
                </ThemedText>
              </View>

              <View style={styles.issueStatusRow}>
                <ThemedText style={styles.issueStatusLabel}>Your Payment:</ThemedText>
                <ThemedText style={styles.issueStatusValue}>
                  Safe & Uncharged
                </ThemedText>
              </View>
            </View>

            {/* Dynamic retry feedback notice */}
            {retryFeedback ? (
              <View style={styles.retryFeedbackCard}>
                <Ionicons name="information-circle-outline" size={20} color="#0284C7" />
                <ThemedText style={styles.retryFeedbackText}>
                  {retryFeedback}
                </ThemedText>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View style={styles.issueActions}>
              <Pressable
                style={[styles.retryButton, isRetryingGateway && { opacity: 0.7 }]}
                onPress={handleRetryGateway}
                disabled={isRetryingGateway}
              >
                {isRetryingGateway ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <ThemedText style={styles.retryButtonText}>Connecting...</ThemedText>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.retryButtonText}>Retry Payment</ThemedText>
                  </View>
                )}
              </Pressable>

              <Pressable
                style={styles.returnSecondaryButton}
                onPress={() => router.replace('/')}
              >
                <Ionicons name="home-outline" size={18} color="#0F172A" />
                <ThemedText style={styles.returnSecondaryButtonText}>
                  Return to Marketplace
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ============================================================================
  // 🎉 SUCCESS STATE SCREEN (CONFIRMATION RECEIPT)
  // ============================================================================
  if (isSuccess) {
    return (
      <View style={styles.whiteContainer}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.whiteSafeArea}>
          <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
            {/* Animated Celebration Icon */}
            <View style={styles.successIconWrapper}>
              <View style={styles.successOuterCircle}>
                <View style={styles.successInnerCircle}>
                  <Ionicons name="checkmark" size={48} color="#FFFFFF" />
                </View>
              </View>
            </View>

            <ThemedText style={styles.successTitle}>
              {paymentType === 'cod_delivery'
                ? 'হোম ডেলিভারি অর্ডার কনফার্ম!'
                : paymentType === 'store_pickup'
                ? 'শোরুম বুকিং সফল হয়েছে!'
                : 'পেমেন্ট সম্পন্ন হয়েছে!'}
            </ThemedText>
            <ThemedText style={styles.successSubtitle}>
              {paymentType === 'cod_delivery'
                ? `৳${payableAmount} ডেলিভারি চার্জ সফলভাবে পরিশোধ হয়েছে। পণ্যটি দ্রুত আপনার ঠিকানায় পাঠানো হচ্ছে।`
                : paymentType === 'store_pickup'
                ? `৳${payableAmount} টোকেন বুকিং ফি সফলভাবে গ্রহণ করা হয়েছে। পণ্যটি শোরুমে আপনার নামে রিজার্ভ রয়েছে।`
                : 'আপনার অর্ডারের সম্পূর্ণ মূল্য সফলভাবে গ্রহণ করা হয়েছে।'}
            </ThemedText>

            {/* Transaction Receipt Card */}
            <View style={styles.receiptCard}>
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptLabel}>পরিশোধিত টাকা</ThemedText>
                <ThemedText style={styles.receiptAmount}>৳ {payableAmount}</ThemedText>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptLabel}>পণ্যের নাম</ThemedText>
                <ThemedText style={styles.receiptValue} numberOfLines={1}>
                  {productTitle}
                </ThemedText>
              </View>

              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptLabel}>অর্ডারের ধরন</ThemedText>
                <ThemedText style={[styles.receiptValue, { color: '#0284C7', fontWeight: '800' }]}>
                  {paymentType === 'cod_delivery'
                    ? '🚚 হোম ডেলিভারি (Cash on Delivery)'
                    : paymentType === 'store_pickup'
                    ? '🏬 শোরুম পিকআপ (দোকান থেকে নেওয়া)'
                    : '💳 সম্পূর্ণ অনলাইন পেমেন্ট'}
                </ThemedText>
              </View>

              {remainingAmount > 0 ? (
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>
                    {paymentType === 'cod_delivery'
                      ? 'ক্যাশ অন ডেলিভারিতে প্রদেয়'
                      : 'দোকানে এসে দেখে প্রদেয়'}
                  </ThemedText>
                  <ThemedText style={[styles.receiptValue, { color: '#D97706', fontWeight: '800' }]}>
                    ৳ {remainingAmount.toLocaleString()}
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptLabel}>পেমেন্ট মাধ্যম</ThemedText>
                <ThemedText style={[styles.receiptValue, { color: methodItem.color, fontWeight: '800' }]}>
                  {methodItem.banglaName || methodItem.name}
                </ThemedText>
              </View>

              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptLabel}>গ্রাহকের মোবাইল</ThemedText>
                <ThemedText style={styles.receiptValue}>{recipientPhone}</ThemedText>
              </View>

              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptLabel}>
                  {paymentType === 'store_pickup' ? 'পিকআপ স্থান' : 'ডেলিভারি ঠিকানা'}
                </ThemedText>
                <ThemedText style={styles.receiptValue} numberOfLines={2}>
                  {deliveryAddress}
                </ThemedText>
              </View>

              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptLabel}>তারিখ ও সময়</ThemedText>
                <ThemedText style={styles.receiptValue}>
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                  {new Date().toLocaleDateString()}
                </ThemedText>
              </View>

              <View style={styles.receiptDivider} />

              {/* Transaction ID & Copy button */}
              <View style={styles.trxBox}>
                <View>
                  <ThemedText style={styles.trxLabel}>ট্রানজেকশন আইডি (TrxID)</ThemedText>
                  <ThemedText style={styles.trxValue}>{transactionId}</ThemedText>
                </View>
                <Pressable onPress={handleCopyTrx} style={styles.copyTrxBtn}>
                  <Ionicons name="copy-outline" size={18} color="#0284C7" />
                </Pressable>
              </View>
            </View>

            {/* Back to Home Button */}
            <Pressable
              onPress={() => router.replace('/')}
              style={[styles.returnBtn, { backgroundColor: '#0284C7' }]}
            >
              <ThemedText style={styles.returnBtnText}>মার্কেটপ্লেসে ফিরে যান</ThemedText>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ============================================================================
  // 💳 PAYMENT SCREEN
  // ============================================================================
  return (
    <View style={styles.whiteContainer}>
      <SafeAreaView edges={['top']} style={styles.statusBarArea}>
        <View style={styles.topHeader}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>
          <ThemedText style={styles.headerTitleText}>Payment</ThemedText>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.whiteSafeArea}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.gatewayWrapper}
            contentContainerStyle={styles.gatewayCenterContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <PaymentGatewayView
              method={methodItem}
              amount={payableAmount}
              paymentType={paymentType}
              productId={productId}
              productTitle={productTitle}
              productPrice={productPrice}
              bookingAmount={payableAmount}
              deliveryAddress={deliveryAddress}
              initialPhoneNumber={recipientPhone}
              userPhoneNumber={recipientPhone}
              onClose={() => router.back()}
              onFailRedirectHome={() => router.replace('/')}
              handleConfirm={handleGatewayConfirm}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  whiteContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  statusBarArea: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  whiteSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  gatewayWrapper: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  gatewayCenterContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  // ==================== GATEWAY ISSUE SCREEN STYLES ====================
  gatewayIssueScroll: {
    padding: 24,
    alignItems: 'center',
  },
  issueIconWrapper: {
    marginVertical: 18,
  },
  issueOuterCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  issueInnerCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  issueHeadline: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  issueSubheading: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
    maxWidth: 320,
  },
  issueStatusCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  issueStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  issueStatusLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  issueStatusValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  issueStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  issueStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
  },
  issueStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  retryFeedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    width: '100%',
  },
  retryFeedbackText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  issueActions: {
    width: '100%',
    marginTop: 24,
    gap: 12,
  },
  retryButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  returnSecondaryButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  returnSecondaryButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  // ==================== SUCCESS SCREEN STYLES ====================
  successScroll: {
    padding: 24,
    alignItems: 'center',
  },
  successIconWrapper: {
    marginVertical: 16,
  },
  successOuterCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successInnerCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    maxWidth: 300,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    maxWidth: 200,
    textAlign: 'right',
  },
  receiptAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#16A34A',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  trxBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  trxLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  trxValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0284C7',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  copyTrxBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnBtn: {
    marginTop: 24,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  returnBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
