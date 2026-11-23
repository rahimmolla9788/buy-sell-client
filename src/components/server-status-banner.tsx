import React from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useServerConnectionStatus, wakeUpServer } from '@/services/api-client';
import { useLanguage } from '@/context/language-context';

export function ServerStatusBanner() {
  const { isWaking, isOffline } = useServerConnectionStatus();
  const { isBangla } = useLanguage();

  if (!isWaking && !isOffline) {
    return null;
  }

  return (
    <View style={[styles.container, isOffline ? styles.offlineContainer : styles.wakingContainer]}>
      {isWaking ? (
        <View style={styles.contentRow}>
          <ActivityIndicator size="small" color="#0284C7" style={styles.spinner} />
          <Text style={styles.wakingText}>
            {isBangla
              ? 'সার্ভার চালু হচ্ছে, অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন...'
              : 'Server is waking up, please wait a few seconds...'}
          </Text>
        </View>
      ) : isOffline ? (
        <View style={styles.contentRow}>
          <Ionicons name="cloud-offline-outline" size={16} color="#DC2626" style={styles.spinner} />
          <Text style={styles.offlineText}>
            {isBangla ? 'সার্ভার পাওয়া যায়নি।' : 'Server is unreachable.'}
          </Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => wakeUpServer()}
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          >
            <Text style={styles.retryBtnText}>
              {isBangla ? 'পুনরায় চেষ্টা' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    zIndex: 9999,
  },
  wakingContainer: {
    backgroundColor: '#F0F9FF',
    borderBottomColor: '#BAE6FD',
  },
  offlineContainer: {
    backgroundColor: '#FEF2F2',
    borderBottomColor: '#FECACA',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: 8,
  },
  wakingText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '500',
  },
  offlineText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '500',
  },
  retryBtn: {
    marginLeft: 10,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});
