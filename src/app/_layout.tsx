import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useColorScheme, Platform, View, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/context/auth-context';
import { LanguageProvider } from '@/context/language-context';
import { SMSProvider, useSMS } from '@/context/sms-context';
import { SMSPermissionGate } from '@/components/sms-permission-gate';
import { AppUpdateModal } from '@/components/app-update-modal';

SplashScreen.preventAutoHideAsync();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FFFFFF',
    card: '#FFFFFF',
    text: '#111827',
    border: '#E2E8F0',
  },
};

function RootNavigator() {
  const { hasSmsPermission, isPermissionChecking } = useSMS();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync('#FFFFFF').catch(() => {});
    if (Platform.OS === 'android') {
      try {
        (RNStatusBar as any).setBackgroundColor?.('#FFFFFF', true);
        (RNStatusBar as any).setBarStyle?.('dark-content', true);
      } catch {}
    }
  }, []);

  // If currently checking permissions on launch on Android
  if (Platform.OS === 'android' && isPermissionChecking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <StatusBar style="dark" />
        <AppUpdateModal />
      </View>
    );
  }

  // Mandatory Permission Gate: Nobody can use the app without granting SMS permissions!
  if (Platform.OS === 'android' && !hasSmsPermission) {
    return (
      <>
        <SMSPermissionGate />
        <AppUpdateModal />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <AnimatedSplashOverlay />
      <AppUpdateModal />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="payment-details" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="payment" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={AppTheme}>
      <LanguageProvider>
        <AuthProvider>
          <SMSProvider>
            <RootNavigator />
          </SMSProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
