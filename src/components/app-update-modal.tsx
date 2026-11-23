import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { useLanguage } from '@/context/language-context';
import { BACKEND_API } from '@/constants/api';
import {
  fetchAppVersionInfo,
  AppVersionInfo,
  CURRENT_VERSION_CODE,
  CURRENT_APP_VERSION,
} from '@/services/app-update-service';

export function AppUpdateModal() {
  const { t, isBangla } = useLanguage();
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);

  const checkVersion = useCallback(async () => {
    const info = await fetchAppVersionInfo();
    if (info) {
      setVersionInfo(info);
    }
  }, []);

  useEffect(() => {
    checkVersion();

    // Check again when app comes to foreground
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkVersion();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      sub.remove();
    };
  }, [checkVersion]);

  // Check if update is mandatory or available
  const isUpdateRequired =
    versionInfo !== null &&
    (versionInfo.version_code > CURRENT_VERSION_CODE ||
      (versionInfo.force_update && CURRENT_VERSION_CODE < versionInfo.version_code));

  // Auto-close handler: hardware back button exits app if update is required
  useEffect(() => {
    if (!isUpdateRequired) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [isUpdateRequired]);

  if (!isUpdateRequired || !versionInfo) {
    return null;
  }

  const handleExitApp = () => {
    BackHandler.exitApp();
  };

  const handleUpdateNow = async () => {
    let url = versionInfo.download_url?.trim();
    if (!url) {
      url = `${BACKEND_API.WEBVIEW_URL}/downloads/app-latest.apk`;
    } else if (url.startsWith('/')) {
      url = `${BACKEND_API.WEBVIEW_URL}${url}`;
    } else if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
      const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileDMatch && fileDMatch[1]) {
        url = `https://drive.google.com/uc?export=download&confirm=t&id=${fileDMatch[1]}`;
      } else {
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
          url = `https://drive.google.com/uc?export=download&confirm=t&id=${idMatch[1]}`;
        }
      }
    }

    try {
      await Linking.openURL(url);
    } catch (err) {
      console.warn('[AppUpdate] Failed to open download url:', err);
    }
  };

  return (
    <Modal
      visible={true}
      transparent={false}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={handleExitApp}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          {/* Top Badge Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download" size={38} color="#0284C7" />
          </View>

          {/* Heading */}
          <ThemedText style={styles.title}>
            {t('Update Required', 'নতুন আপডেট আবশ্যক')}
          </ThemedText>

          {/* Version Pills */}
          <View style={styles.versionRow}>
            <View style={styles.currentVersionPill}>
              <ThemedText style={styles.currentVersionText}>
                {t(`Current: v${CURRENT_APP_VERSION}`, `বর্তমান: v${CURRENT_APP_VERSION}`)}
              </ThemedText>
            </View>
            <Ionicons name="arrow-forward" size={14} color="#94A3B8" />
            <View style={styles.newVersionPill}>
              <ThemedText style={styles.newVersionText}>
                {t(`Latest: v${versionInfo.latest_version}`, `নতুন: v${versionInfo.latest_version}`)}
              </ThemedText>
            </View>
          </View>

          <ThemedText style={styles.subtitle}>
            {t(
              'A new and improved version of the app is available. Please update to continue using the marketplace.',
              'অ্যাপটির একটি নতুন ও উন্নত ভার্সন প্রকাশিত হয়েছে। অ্যাপটি ব্যবহার চালিয়ে যেতে অনুগ্রহ করে এখনই আপডেট করুন।'
            )}
          </ThemedText>

          {/* Release Notes Box */}
          {Boolean(versionInfo.release_notes) && (
            <View style={styles.notesBox}>
              <View style={styles.notesHeader}>
                <Ionicons name="sparkles" size={14} color="#D97706" />
                <ThemedText style={styles.notesTitle}>
                  {t("What's New in This Version:", 'নতুন যা যুক্ত হয়েছে:')}
                </ThemedText>
              </View>
              <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
                <ThemedText style={styles.notesContent}>
                  {versionInfo.release_notes}
                </ThemedText>
              </ScrollView>
            </View>
          )}

          {/* Strict Warning Alert */}
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={16} color="#DC2626" style={{ marginTop: 1 }} />
            <ThemedText style={styles.warningText}>
              {t(
                'This is a required update. The app cannot run on outdated versions and will close.',
                'এটি একটি বাধ্যতামূলক আপডেট। আপডেট না করলে অ্যাপটি ব্যবহার করা যাবে না এবং বন্ধ হয়ে যাবে।'
              )}
            </ThemedText>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <Pressable
              style={({ pressed }) => [styles.updateButton, pressed && styles.btnPressed]}
              onPress={handleUpdateNow}
            >
              <Ionicons name="download-outline" size={19} color="#FFFFFF" style={{ marginRight: 6 }} />
              <ThemedText style={styles.updateButtonText}>
                {t('Update Now', 'এখনই আপডেট করুন')}
              </ThemedText>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.exitButton, pressed && styles.btnPressed]}
              onPress={handleExitApp}
            >
              <Ionicons name="exit-outline" size={18} color="#64748B" style={{ marginRight: 6 }} />
              <ThemedText style={styles.exitButtonText}>
                {t('Exit App', 'অ্যাপ বন্ধ করুন')}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#BAE6FD',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  currentVersionPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentVersionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  newVersionPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  newVersionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  notesBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 14,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  notesScroll: {
    maxHeight: 90,
  },
  notesContent: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#475569',
  },
  warningBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#B91C1C',
    fontWeight: '600',
  },
  actionsContainer: {
    width: '100%',
    gap: 10,
  },
  updateButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#0284C7',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  exitButton: {
    width: '100%',
    height: 44,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  exitButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
