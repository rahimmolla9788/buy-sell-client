import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { SMSMessage } from '@/types/sms';
import { ThemedText } from './themed-text';
import { useSMS } from '@/context/sms-context';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  message: SMSMessage;
}

export function IncomingFeedCard({ message }: Props) {
  const { selectThread } = useSMS();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopyOtp = async () => {
    if (message.otpCode) {
      await Clipboard.setStringAsync(message.otpCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDetailedDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return `${dateStr} at ${timeStr}`;
  };

  const getCategoryColor = () => {
    switch (message?.category) {
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

  const color = getCategoryColor();
  const categoryLabel = (message?.category || 'sms').toUpperCase();

  return (
    <Pressable
      onPress={() => message?.threadId && selectThread(message.threadId)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: !message?.isRead ? color : 'rgba(150, 150, 150, 0.12)',
          borderLeftColor: color,
          borderLeftWidth: 4,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      {/* Top Header */}
      <View style={styles.topRow}>
        <View style={styles.senderGroup}>
          <View style={[styles.avatar, { backgroundColor: color }]}>
            <Ionicons name="arrow-down" size={14} color="#ffffff" />
          </View>
          <View>
            <View style={styles.nameRow}>
              <ThemedText type="smallBold" style={styles.senderName}>
                {message?.sender || message?.phoneNumber || 'Unknown'}
              </ThemedText>
              {!message?.isRead && <View style={styles.unreadDot} />}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.phoneText}>
              {message?.phoneNumber || ''}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.categoryBadge, { backgroundColor: color + '20' }]}>
          <ThemedText style={[styles.categoryText, { color }]}>
            {categoryLabel}
          </ThemedText>
        </View>
      </View>

      {/* Message Text */}
      <ThemedText style={styles.bodyText}>{message.body}</ThemedText>

      {/* OTP Code Box */}
      {message.otpCode && (
        <View style={styles.otpBox}>
          <View style={styles.otpContent}>
            <Ionicons name="key-outline" size={16} color="#30D158" />
            <ThemedText style={styles.otpLabel}>Detected Code:</ThemedText>
            <ThemedText style={styles.otpValue}>{message.otpCode}</ThemedText>
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleCopyOtp();
            }}
            style={[styles.copyBtn, copied && styles.copyBtnDone]}>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={13}
              color="#ffffff"
            />
            <ThemedText style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</ThemedText>
          </Pressable>
        </View>
      )}

      {/* Footer Info & Action */}
      <View style={styles.footerRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.dateText}>
          {formatDetailedDate(message.timestamp)}
        </ThemedText>

        <View style={styles.footerAction}>
          <ThemedText style={[styles.replyLinkText, { color }]}>View Conversation</ThemedText>
          <Ionicons name="arrow-forward" size={13} color={color} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginVertical: 5,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  senderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  senderName: {
    fontSize: 15,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0A84FF',
  },
  phoneText: {
    fontSize: 11,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  otpBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.25)',
  },
  otpContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  otpLabel: {
    fontSize: 12,
    color: '#30D158',
    fontWeight: '600',
  },
  otpValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#30D158',
    letterSpacing: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#30D158',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBtnDone: {
    backgroundColor: '#28A745',
  },
  copyBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
  },
  dateText: {
    fontSize: 11,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replyLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
