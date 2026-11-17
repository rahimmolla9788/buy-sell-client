import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { SMSThread, SMSMessage } from '@/types/sms';
import { ThemedText } from './themed-text';
import { useSMS } from '@/context/sms-context';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  thread: SMSThread | SMSMessage | any;
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return new Date(timestamp).toLocaleDateString([], { weekday: 'short' });
  }
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function SMSThreadCard({ thread }: Props) {
  const { selectThread } = useSMS();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  // Normalize: handles both SMSThread and direct SMSMessage
  const isMessage = !thread.messages && (typeof thread.body === 'string' || typeof thread.sender === 'string');
  const lastMsg: SMSMessage = isMessage ? thread : (thread.lastMessage || thread);
  const isUnread = isMessage ? !thread.isRead : (thread.unreadCount || 0) > 0;
  const unreadCount = isMessage ? (thread.isRead ? 0 : 1) : (thread.unreadCount || 0);
  const contactName = thread.contactName || thread.sender || thread.phoneNumber || 'Unknown';
  const phoneNumber = thread.phoneNumber || thread.sender || '';
  const avatarColor = thread.avatarColor || '#4A90E2';
  const threadId = thread.threadId || thread.id;
  const otpCode = lastMsg?.otpCode;

  const handleCopyOtp = async () => {
    if (otpCode) {
      await Clipboard.setStringAsync(otpCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getCategoryTheme = () => {
    const cat = thread.category || lastMsg?.category || 'personal';
    switch (cat) {
      case 'banking':
        return { label: 'BANK', color: '#0A84FF', icon: 'card-outline' as const };
      case 'otp':
        return { label: 'SECURITY / OTP', color: '#30D158', icon: 'shield-checkmark-outline' as const };
      case 'personal':
        return { label: 'PERSONAL', color: '#BF5AF2', icon: 'person-outline' as const };
      case 'promotions':
        return { label: 'UPDATES', color: '#FF9F0A', icon: 'megaphone-outline' as const };
      default:
        return { label: 'MESSAGE', color: '#64D2FF', icon: 'chatbubble-outline' as const };
    }
  };

  const categoryTheme = getCategoryTheme();

  const getInitials = (name?: string) => {
    if (!name || !name.trim()) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Pressable
      onPress={() => selectThread(threadId)}
      style={({ pressed }) => [
        styles.cardContainer,
        {
          backgroundColor: isUnread ? theme.backgroundElement : theme.background,
          borderColor: isUnread ? 'rgba(10, 132, 255, 0.3)' : 'rgba(150, 150, 150, 0.12)',
          opacity: pressed ? 0.88 : 1,
        },
      ]}>
      {/* Contact Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarColor || categoryTheme.color }]}>
        <ThemedText style={styles.avatarText}>{getInitials(contactName)}</ThemedText>
      </View>

      {/* Main Content */}
      <View style={styles.contentCol}>
        {/* Top row: Name, Category tag, Timestamp */}
        <View style={styles.topRow}>
          <View style={styles.nameCategoryRow}>
            <ThemedText
              type={isUnread ? 'smallBold' : 'default'}
              numberOfLines={1}
              style={[styles.contactName, isUnread && styles.unreadName]}>
              {contactName}
            </ThemedText>
            <View style={[styles.categoryTag, { backgroundColor: categoryTheme.color + '20' }]}>
              <ThemedText style={[styles.categoryTagText, { color: categoryTheme.color }]}>
                {categoryTheme.label}
              </ThemedText>
            </View>
          </View>

          <ThemedText
            type="small"
            themeColor={isUnread ? 'text' : 'textSecondary'}
            style={[styles.timestamp, isUnread && styles.unreadTimestamp]}>
            {formatTimestamp(lastMsg?.timestamp || thread.timestamp || 0)}
          </ThemedText>
        </View>

        {/* Middle row: Phone number / sender ID */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.phoneText}>
          {phoneNumber}
        </ThemedText>

        {/* Message snippet */}
        <ThemedText
          type="small"
          numberOfLines={2}
          themeColor={isUnread ? 'text' : 'textSecondary'}
          style={[styles.snippetText, isUnread && styles.unreadSnippet]}>
          {!lastMsg?.isIncoming ? 'You: ' : ''}
          {lastMsg?.body || ''}
        </ThemedText>

        {/* Bottom Actions Row: OTP Quick copy chip + Unread badge */}
        <View style={styles.bottomRow}>
          {otpCode ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleCopyOtp();
              }}
              style={[styles.otpBadge, copied && styles.otpBadgeCopied]}>
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy'}
                size={12}
                color={copied ? '#ffffff' : '#30D158'}
              />
              <ThemedText style={[styles.otpText, copied && styles.otpTextCopied]}>
                {copied ? 'Code Copied!' : `Copy OTP: ${otpCode}`}
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}

          <View style={styles.badgesGroup}>
            {isUnread && (
              <View style={styles.unreadPill}>
                <ThemedText style={styles.unreadCountText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </ThemedText>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginVertical: 4,
    gap: 12,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  contentCol: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  contactName: {
    fontSize: 16,
  },
  unreadName: {
    fontWeight: '700',
  },
  categoryTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  categoryTagText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 12,
  },
  unreadTimestamp: {
    color: '#0A84FF',
    fontWeight: '600',
  },
  phoneText: {
    fontSize: 12,
  },
  snippetText: {
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  unreadSnippet: {
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  otpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  otpBadgeCopied: {
    backgroundColor: '#30D158',
    borderColor: '#30D158',
  },
  otpText: {
    color: '#30D158',
    fontSize: 11,
    fontWeight: '700',
  },
  otpTextCopied: {
    color: '#ffffff',
  },
  badgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadPill: {
    backgroundColor: '#0A84FF',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCountText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
