import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSMS } from '@/context/sms-context';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
import { sendRealSMS } from '@/services/sms-service';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ComposeSMSModal({ visible, onClose }: Props) {
  const { receiveIncomingSMS, sendReply, threads, selectThread } = useSMS();
  const theme = useTheme();

  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sendMethod, setSendMethod] = useState<'system' | 'direct' | 'app_only'>('system');
  const [sending, setSending] = useState(false);

  if (!visible) return null;

  const handleSend = async () => {
    if (!recipient.trim() || !message.trim()) {
      Alert.alert('Missing Info', 'Please enter a recipient phone number and message.');
      return;
    }

    setSending(true);

    try {
      if (sendMethod !== 'app_only') {
        const result = await sendRealSMS(
          recipient.trim(),
          message.trim(),
          sendMethod === 'direct'
        );

        if (!result.success && result.error) {
          Alert.alert('Send Notice', result.error);
        }
      }

      // Check if thread exists for this recipient
      const existingThread = threads.find(
        (t) =>
          t.phoneNumber.replace(/[^\d]/g, '') === recipient.replace(/[^\d]/g, '') ||
          t.contactName.toLowerCase() === recipient.toLowerCase()
      );

      let targetThreadId = existingThread?.id;

      if (existingThread) {
        sendReply(existingThread.id, message.trim());
      } else {
        // Create new thread by receiving initial mock message or sending
        const newMsg = receiveIncomingSMS({
          sender: recipient.trim(),
          phoneNumber: recipient.trim(),
          body: 'Conversation started',
          category: 'personal',
        });
        targetThreadId = newMsg.threadId;
        sendReply(newMsg.threadId, message.trim());
      }

      setRecipient('');
      setMessage('');
      onClose();

      if (targetThreadId) {
        selectThread(targetThreadId);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send SMS');
    } finally {
      setSending(false);
    }
  };

  const sampleContacts = [
    { name: 'Mom', phone: '+1 (555) 728-1992' },
    { name: 'Sarah Miller', phone: '+1 (555) 382-9012' },
    { name: 'David (Uber)', phone: '82371' },
    { name: 'Chase Bank', phone: '24273' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.backgroundElement }]}>
            <View style={styles.titleRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="paper-plane" size={18} color="#0A84FF" />
              </View>
              <ThemedText type="smallBold" style={styles.headerTitle}>
                Compose Real SMS
              </ThemedText>
            </View>
            <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Quick Contacts Chips */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Quick Select Recipient
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {sampleContacts.map((c) => (
                <Pressable
                  key={c.name}
                  onPress={() => setRecipient(c.phone)}
                  style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText style={styles.chipName}>{c.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.chipPhone}>
                    {c.phone}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>

            {/* Recipient Input */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              To (Phone Number or Name)
            </ThemedText>
            <TextInput
              value={recipient}
              onChangeText={setRecipient}
              placeholder="e.g. +1 (555) 019-2831 or shortcode"
              placeholderTextColor="#A1A1AA"
              keyboardType="phone-pad"
              style={[
                styles.input,
                { backgroundColor: '#27272A', color: '#FFFFFF', borderWidth: 1.5, borderColor: '#3F3F46' },
              ]}
            />

            {/* Sending Method Selector */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Delivery Method
            </ThemedText>
            <View style={styles.methodsGrid}>
              <Pressable
                onPress={() => setSendMethod('system')}
                style={[
                  styles.methodCard,
                  { backgroundColor: theme.backgroundElement },
                  sendMethod === 'system' && styles.methodCardActive,
                ]}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={20}
                  color={sendMethod === 'system' ? '#0A84FF' : theme.textSecondary}
                />
                <View style={styles.methodInfo}>
                  <ThemedText type="smallBold">Real System SMS (SIM)</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.methodDesc}>
                    Uses native SMS app to send via cellular carrier (iOS & Android)
                  </ThemedText>
                </View>
                {sendMethod === 'system' && <Ionicons name="checkmark-circle" size={18} color="#0A84FF" />}
              </Pressable>

              {Platform.OS === 'android' && (
                <Pressable
                  onPress={() => setSendMethod('direct')}
                  style={[
                    styles.methodCard,
                    { backgroundColor: theme.backgroundElement },
                    sendMethod === 'direct' && styles.methodCardActive,
                  ]}>
                  <Ionicons
                    name="flash-outline"
                    size={20}
                    color={sendMethod === 'direct' ? '#30D158' : theme.textSecondary}
                  />
                  <View style={styles.methodInfo}>
                    <ThemedText type="smallBold">Direct Android SMS</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.methodDesc}>
                      Sends in background via SmsManager
                    </ThemedText>
                  </View>
                  {sendMethod === 'direct' && <Ionicons name="checkmark-circle" size={18} color="#30D158" />}
                </Pressable>
              )}

              <Pressable
                onPress={() => setSendMethod('app_only')}
                style={[
                  styles.methodCard,
                  { backgroundColor: theme.backgroundElement },
                  sendMethod === 'app_only' && styles.methodCardActive,
                ]}>
                <Ionicons
                  name="chatbubble-outline"
                  size={20}
                  color={sendMethod === 'app_only' ? '#BF5AF2' : theme.textSecondary}
                />
                <View style={styles.methodInfo}>
                  <ThemedText type="smallBold">Local App Mode</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.methodDesc}>
                    Simulate sending inside the app without carrier charge
                  </ThemedText>
                </View>
                {sendMethod === 'app_only' && <Ionicons name="checkmark-circle" size={18} color="#BF5AF2" />}
              </Pressable>
            </View>

            {/* Message Body */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Message
            </ThemedText>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Type your SMS message..."
              placeholderTextColor="#A1A1AA"
              multiline
              numberOfLines={4}
              style={[
                styles.textArea,
                { backgroundColor: '#27272A', color: '#FFFFFF', borderWidth: 1.5, borderColor: '#3F3F46' },
              ]}
            />

            {/* Send Button */}
            <Pressable
              onPress={handleSend}
              disabled={sending || !recipient.trim() || !message.trim()}
              style={[
                styles.sendBtn,
                (!recipient.trim() || !message.trim()) && styles.sendBtnDisabled,
              ]}>
              <Ionicons name="paper-plane" size={18} color="#ffffff" />
              <ThemedText style={styles.sendBtnText}>
                {sending ? 'Sending...' : 'Send SMS'}
              </ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: Platform.select({ ios: 40, default: 24 }),
  },
  label: {
    fontSize: 12,
    marginTop: 4,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.15)',
  },
  chipName: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipPhone: {
    fontSize: 10,
    marginTop: 1,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  methodsGrid: {
    gap: 8,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  methodCardActive: {
    borderColor: '#0A84FF',
  },
  methodInfo: {
    flex: 1,
  },
  methodDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  textArea: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  sendBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A84FF',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 10,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
