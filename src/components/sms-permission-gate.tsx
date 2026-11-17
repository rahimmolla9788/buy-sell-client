import React, { useEffect, useRef } from 'react';
import { Pressable, BackHandler, Platform, Alert, Linking, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { useSMS } from '@/context/sms-context';

export function SMSPermissionGate() {
  const { hasSmsPermission, isInitialSyncing, requestSmsPermissionsAndSync, checkSmsPermissions } = useSMS();
  const isRequestingRef = useRef(false);
  const isAlertOpenRef = useRef(false);

  const showSettingsAlert = () => {
    if (isAlertOpenRef.current) return;
    isAlertOpenRef.current = true;

    Alert.alert(
      'পারমিশন প্রয়োজন',
      'অ্যাপটি ব্যবহার করতে SMS পারমিশন আবশ্যক। আপনি পূর্বে পারমিশন বন্ধ করেছেন, অনুগ্রহ করে ফোন সেটিংস থেকে SMS পারমিশন চালু (Allow) করুন।',
      [
        {
          text: 'অ্যাপ বন্ধ করুন',
          style: 'cancel',
          onPress: () => {
            isAlertOpenRef.current = false;
            if (Platform.OS === 'android') {
              BackHandler.exitApp();
            }
          },
        },
        {
          text: 'সেটিংস ওপেন করুন',
          onPress: async () => {
            isAlertOpenRef.current = false;
            try {
              await Linking.openSettings();
            } catch (e) {
              console.warn('[SMSPermissionGate] Cannot open settings:', e);
            }
          },
        },
      ],
      {
        cancelable: false,
      }
    );
  };

  const handleGrantPermission = async () => {
    if (isRequestingRef.current || isInitialSyncing || hasSmsPermission) return;
    isRequestingRef.current = true;
    try {
      const res = await requestSmsPermissionsAndSync();
      if (!res.granted) {
        if (res.neverAskAgain) {
          // Android will NOT show permission dialog because denied 2+ times.
          // Direct user to phone settings with an Alert so app doesn't auto-close!
          showSettingsAlert();
        } else {
          // User tapped "Don't allow" on system dialog -> exit app as requested
          if (Platform.OS === 'android') {
            setTimeout(() => {
              BackHandler.exitApp();
            }, 100);
          }
        }
      }
    } catch (e) {
      console.warn('[SMSPermissionGate] Permission request error:', e);
    } finally {
      isRequestingRef.current = false;
    }
  };

  useEffect(() => {
    // Hide native splash screen so the clean white background is visible
    SplashScreen.hideAsync().catch(() => {});

    // Automatically trigger permission prompt on app entry
    handleGrantPermission();

    // Listen to AppState when user returns from Settings
    const appStateSub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        const granted = await checkSmsPermissions();
        if (!granted && !isAlertOpenRef.current) {
          handleGrantPermission();
        }
      }
    });

    // If hardware back button is pressed, exit app
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });

    return () => {
      appStateSub.remove();
      backSubscription.remove();
    };
  }, []);

  return (
    <Pressable
      onPress={handleGrantPermission}
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      android_disableSound={true}>
      <StatusBar style="dark" />
    </Pressable>
  );
}
