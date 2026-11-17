import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { useSMS } from '@/context/sms-context';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
import { SMSMessage } from '@/types/sms';

import { sendRealSMS } from '@/services/sms-service';

export function ConversationView() {
  const { selectedThread, selectThread, sendReply, deleteThread, settings } = useSMS();
  const theme = useTheme();
  const [inputText, setInputText] = useState('');
  const [copiedOtpId, setCopiedOtpId] = useState<string | null>(null);
  const scrollViewRef = useRef<any>(null);

  if (!selectedThread) return null;

  const handleSend = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    sendReply(selectedThread.id, text);

    if (settings.sendRealSms) {
      sendRealSMS(selectedThread.phoneNumber, text);
    }

    setInputText('');
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleCopyOtp = async (code: string, msgId: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedOtpId(msgId);
    setTimeout(() => setCopiedOtpId(null), 2500);
  };

  const confirmDeleteThread = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete conversation with ${selectedThread.contactName}?`)) {
        deleteThread(selectedThread.id);
      }
    } else {
      Alert.alert(
        'Delete Conversation',
        `Are you sure you want to delete all messages with ${selectedThread.contactName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteThread(selectedThread.id) },
        ]
      );
    }
  };

  const getQuickReplies = () => {
    if (selectedThread.category === 'banking') {
      return ['YES', 'NO', 'HELP', 'STOP'];
    }
    if (selectedThread.category === 'otp') {
      return ['RESEND', 'HELP', 'STOP'];
    }
    return ['Got it, thanks!', 'Sounds good! 👍', 'Will check soon.', 'On my way!'];
  };

  const quickReplies = getQuickReplies();

  const formatMessageTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Navigation Bar */}
      <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
        <Pressable
          hitSlop={12}
          onPress={() => selectThread(null)}
          style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color="#0A84FF" />
          <ThemedText style={styles.backText}>Messages</ThemedText>
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.headerName}>
            {selectedThread.contactName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.headerPhone}>
            {selectedThread.phoneNumber}
          </ThemedText>
        </View>

        <View style={styles.headerRightActions}>
          <Pressable
            hitSlop={12}
            onPress={() => Linking.openURL(`tel:${selectedThread.phoneNumber}`)}
            style={styles.headerActionBtn}>
            <Ionicons name="call-outline" size={19} color="#30D158" />
          </Pressable>

          <Pressable
            hitSlop={12}
            onPress={() => sendRealSMS(selectedThread.phoneNumber, '')}
            style={styles.headerActionBtn}>
            <Ionicons name="phone-portrait-outline" size={19} color="#0A84FF" />
          </Pressable>

          <Pressable hitSlop={12} onPress={confirmDeleteThread} style={styles.headerActionBtn}>
            <Ionicons name="trash-outline" size={19} color="#FF453A" />
          </Pressable>
        </View>
      </View>

      {/* Messages Stream */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.messagesScrollContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}>
        {/* Contact Info Header Card */}
        <View style={styles.contactProfileCard}>
          <View style={[styles.largeAvatar, { backgroundColor: selectedThread.avatarColor }]}>
            <ThemedText style={styles.largeAvatarText}>
              {selectedThread.contactName.slice(0, 2).toUpperCase()}
            </ThemedText>
          </View>
          <ThemedText type="smallBold" style={styles.profileName}>
            {selectedThread.contactName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            SMS / Text Message • {selectedThread.phoneNumber}
          </ThemedText>
        </View>

        {/* Message Bubbles */}
        {selectedThread.messages.map((msg: SMSMessage) => {
          const isIncoming = msg.isIncoming;
          const isCopied = copiedOtpId === msg.id;

          return (
            <View
              key={msg.id}
              style={[styles.bubbleWrapper, isIncoming ? styles.bubbleIncoming : styles.bubbleOutgoing]}>
              <View
                style={[
                  styles.bubbleContainer,
                  isIncoming
                    ? [styles.incomingBubble, { backgroundColor: theme.backgroundElement }]
                    : styles.outgoingBubble,
                ]}>
                <ThemedText
                  style={[
                    styles.bubbleText,
                    !isIncoming && styles.outgoingText,
                  ]}>
                  {msg.body}
                </ThemedText>

                {/* Highlighted OTP Box */}
                {msg.otpCode && (
                  <View style={styles.otpCardInBubble}>
                    <View style={styles.otpCardHeader}>
                      <Ionicons name="shield-checkmark" size={16} color="#30D158" />
                      <ThemedText style={styles.otpHeaderTitle}>Verification Code</ThemedText>
                    </View>
                    <ThemedText style={styles.otpCodeDisplay}>{msg.otpCode}</ThemedText>
                    <Pressable
                      onPress={() => handleCopyOtp(msg.otpCode!, msg.id)}
                      style={[styles.copyOtpButton, isCopied && styles.copyOtpButtonDone]}>
                      <Ionicons
                        name={isCopied ? 'checkmark' : 'copy-outline'}
                        size={14}
                        color="#ffffff"
                      />
                      <ThemedText style={styles.copyOtpButtonText}>
                        {isCopied ? 'Code Copied!' : 'Copy Code'}
                      </ThemedText>
                    </Pressable>
                  </View>
                )}

                {/* Time & Delivery */}
                <View style={styles.metaRow}>
                  <ThemedText
                    style={[
                      styles.timeMeta,
                      isIncoming ? { color: theme.textSecondary } : styles.outgoingMetaText,
                    ]}>
                    {formatMessageTime(msg.timestamp)}
                  </ThemedText>
                  {!isIncoming && (
                    <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" />
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Quick Reply Chips */}
      <View style={styles.quickRepliesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRepliesScroll}>
          {quickReplies.map((qr) => (
            <Pressable
              key={qr}
              onPress={() => {
                sendReply(selectedThread.id, qr);
              }}
              style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.chipText}>{qr}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Message Input Bar */}
      <View style={[styles.inputBar, { borderTopColor: theme.backgroundElement, backgroundColor: theme.background }]}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Text Message (SMS)..."
          placeholderTextColor="#A1A1AA"
          multiline
          style={[
            styles.textInput,
            {
              backgroundColor: '#27272A',
              color: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: '#3F3F46',
            },
          ]}
        />
        <Pressable
          onPress={handleSend}
          disabled={!inputText.trim()}
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}>
          <Ionicons name="arrow-up" size={20} color="#ffffff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 900,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.select({ ios: 44, android: 12, default: 12 }),
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 90,
  },
  backText: {
    color: '#0A84FF',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    textAlign: 'center',
  },
  headerPhone: {
    fontSize: 11,
    textAlign: 'center',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesScrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  contactProfileCard: {
    alignItems: 'center',
    marginVertical: 18,
    gap: 6,
  },
  largeAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  largeAvatarText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 18,
  },
  bubbleWrapper: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  bubbleIncoming: {
    justifyContent: 'flex-start',
  },
  bubbleOutgoing: {
    justifyContent: 'flex-end',
  },
  bubbleContainer: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  incomingBubble: {
    borderBottomLeftRadius: 4,
  },
  outgoingBubble: {
    backgroundColor: '#0A84FF',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  outgoingText: {
    color: '#ffffff',
  },
  otpCardInBubble: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    alignItems: 'center',
  },
  otpCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  otpHeaderTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#30D158',
  },
  otpCodeDisplay: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
    marginVertical: 4,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    color: '#30D158',
  },
  copyOtpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#30D158',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  copyOtpButtonDone: {
    backgroundColor: '#28A745',
  },
  copyOtpButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeMeta: {
    fontSize: 10,
  },
  outgoingMetaText: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  quickRepliesContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  quickRepliesScroll: {
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.15)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
});
