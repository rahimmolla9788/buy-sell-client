import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useSMS } from '@/context/sms-context';
import {
  checkPermissionsAsync,
  requestSmsPermissionsAsync,
} from '../../modules/real-sms';
import { syncRealDeviceInbox } from '@/services/sms-service';

export function DeviceSMSBanner() {
  const theme = useTheme();
  const { setThreads } = useSMS() as any;

  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      if (Platform.OS === 'android') {
        const perms = await checkPermissionsAsync();
        setHasPermissions(perms.allGranted);
      }
    }
    checkStatus();
  }, []);

  const handleRequestPermissions = async () => {
    setChecking(true);
    try {
      const res = await requestSmsPermissionsAsync();
      setHasPermissions(res.allGranted);
      if (res.allGranted) {
        Alert.alert('Permissions Granted', 'SMS permissions granted! You can now sync your device messages.');
      } else {
        Alert.alert('Permissions Required', 'READ_SMS and RECEIVE_SMS permissions are required to read real device messages.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not request permissions');
    } finally {
      setChecking(false);
    }
  };

  const handleSyncDeviceMessages = async () => {
    setSyncing(true);
    try {
      const result = await syncRealDeviceInbox();
      if (result.error) {
        Alert.alert('Notice', result.error);
      } else if (result.count > 0 && setThreads) {
        setThreads((prev: any) => [...result.threads, ...prev]);
        Alert.alert('Sync Successful', `Imported ${result.count} real SMS messages from your device!`);
      } else {
        Alert.alert('Device Inbox', 'No messages found or inbox is empty.');
      }
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Failed to sync device SMS');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.topRow}>
        <View style={styles.platformBadge}>
          <Ionicons
            name={
              Platform.OS === 'android'
                ? 'logo-android'
                : Platform.OS === 'ios'
                ? 'logo-apple'
                : 'globe-outline'
            }
            size={16}
            color="#0A84FF"
          />
          <ThemedText style={styles.platformText}>
            {Platform.OS === 'android'
              ? 'Real Android Telephony'
              : Platform.OS === 'ios'
              ? 'iOS Apple Messages'
              : 'Web SMS Mode'}
          </ThemedText>
        </View>

        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: Platform.OS === 'android' && hasPermissions ? '#30D158' : '#FF9F0A' },
            ]}
          />
          <ThemedText style={styles.statusLabel}>
            {Platform.OS === 'android'
              ? hasPermissions
                ? 'Permissions Active'
                : 'Permissions Needed'
              : 'SMS Capable'}
          </ThemedText>
        </View>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.descriptionText}>
        {Platform.OS === 'android'
          ? 'Reads incoming & existing SMS directly from Android telephony content provider.'
          : Platform.OS === 'ios'
          ? 'Apple iOS restricts reading the SMS inbox. You can send real SMS via the native Apple Messages sheet.'
          : 'Ready for real device execution. Native permissions and background receiver configured.'}
      </ThemedText>

      {Platform.OS === 'android' && (
        <View style={styles.actionsRow}>
          {!hasPermissions ? (
            <Pressable
              onPress={handleRequestPermissions}
              disabled={checking}
              style={[styles.btn, styles.primaryBtn]}>
              {checking ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={14} color="#ffffff" />
                  <ThemedText style={styles.primaryBtnText}>Grant SMS Permissions</ThemedText>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSyncDeviceMessages}
              disabled={syncing}
              style={[styles.btn, styles.syncBtn]}>
              {syncing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={14} color="#ffffff" />
                  <ThemedText style={styles.syncBtnText}>Sync Device Inbox</ThemedText>
                </>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 14,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.2)',
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  platformText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A84FF',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 12,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  primaryBtn: {
    backgroundColor: '#0A84FF',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  syncBtn: {
    backgroundColor: '#30D158',
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
