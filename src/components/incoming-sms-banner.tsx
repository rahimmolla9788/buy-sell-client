import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { useSMS } from '@/context/sms-context';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';

export function IncomingSMSBanner() {
  const { latestNotification, dismissNotification, selectThread } = useSMS();
  const theme = useTheme();
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  useEffect(() => {
    if (!latestNotification) return;

    const timer = setTimeout(() => {
      dismissNotification();
    }, 7000);

    return () => clearTimeout(timer);
  }, [latestNotification, dismissNotification]);

  if (!latestNotification) return null;

  const copied = copiedMsgId === latestNotification.id;

  const handleCopyOtp = async () => {
    if (latestNotification.otpCode) {
      await Clipboard.setStringAsync(latestNotification.otpCode);
      setCopiedMsgId(latestNotification.id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  };

  const handleOpen = () => {
    selectThread(latestNotification.threadId);
    dismissNotification();
  };

  const getCategoryColor = () => {
    switch (latestNotification.category) {
      case 'banking':
        return '#0A84FF';
      case 'otp':
        return '#30D158';
      case 'personal':
        return '#BF5AF2';
      case 'promotions':
        return '#FF9F0A';
      default:
        return '#64D2FF';
    }
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutUp.duration(250)}
      style={styles.wrapper}>
      <Pressable onPress={handleOpen} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.headerRow}>
          <View style={styles.senderContainer}>
            <View style={[styles.avatar, { backgroundColor: getCategoryColor() }]}>
              <Ionicons name="chatbubble-ellipses" size={16} color="#ffffff" />
            </View>
            <View style={styles.senderInfo}>
              <View style={styles.nameRow}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.senderName}>
                  {latestNotification.sender}
                </ThemedText>
                <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor() + '25' }]}>
                  <ThemedText style={[styles.categoryText, { color: getCategoryColor() }]}>
                    {latestNotification.category.toUpperCase()}
                  </ThemedText>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.timeText}>
                Incoming SMS • Just now
              </ThemedText>
            </View>
          </View>

          <Pressable
            hitSlop={12}
            onPress={(e) => {
              e.stopPropagation();
              dismissNotification();
            }}
            style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ThemedText numberOfLines={2} style={styles.bodyText}>
          {latestNotification.body}
        </ThemedText>

        <View style={styles.actionsRow}>
          {latestNotification.otpCode && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleCopyOtp();
              }}
              style={[styles.actionBtn, styles.otpBtn]}>
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={14}
                color="#ffffff"
              />
              <ThemedText style={styles.otpBtnText}>
                {copied ? 'Code Copied!' : `Copy OTP: ${latestNotification.otpCode}`}
              </ThemedText>
            </Pressable>
          )}

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            style={[styles.actionBtn, styles.viewBtn]}>
            <ThemedText style={styles.viewBtnText}>View Message</ThemedText>
            <Ionicons name="arrow-forward" size={13} color="#0A84FF" />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: Platform.select({ ios: 54, android: 40, default: 20 }),
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 580,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  senderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  senderInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  senderName: {
    fontSize: 15,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 6,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  otpBtn: {
    backgroundColor: '#30D158',
  },
  otpBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  viewBtn: {
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  viewBtnText: {
    color: '#0A84FF',
    fontSize: 12,
    fontWeight: '600',
  },
});
