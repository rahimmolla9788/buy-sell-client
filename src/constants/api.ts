import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * ============================================================================
 * 🔧 BACKEND & WEBVIEW CONFIGURATION (DYNAMIC & AUTO-DETECTING)
 * ============================================================================
 * Automatically detects whether the app is running on Web, Simulator, or
 * a physical mobile phone connected via Metro bundler Wi-Fi.
 * ============================================================================
 */

function resolveBackendHost(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `${window.location.hostname}:5000`;
    }
    return 'localhost:5000';
  }

  // On physical Android/iOS, extract Metro development host IP
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `${ip}:5000`;
    }
  }

  // On Android emulator with adb reverse, 127.0.0.1:5000 tunnels directly to host.
  // Fallback to 127.0.0.1:5000
  return '127.0.0.1:5000';
}

const SERVER_URL = `http://${resolveBackendHost()}`;

export const BACKEND_API = {
  // 🌐 Web App URL loaded inside the WebView:
  WEBVIEW_URL: SERVER_URL,

  // 🔧 Backend REST API for storing user messages:
  BASE_URL: `${SERVER_URL}/api`,

  // POST endpoint to save an array of all messages from device
  BATCH_SYNC_ENDPOINT: '/sms/sync-batch',

  // POST endpoint to save an individual incoming SMS in real-time
  SINGLE_SYNC_ENDPOINT: '/sms/incoming',

  // Optional Authorization Bearer token (leave empty if not required)
  API_KEY: '',

  // 📱 Receipt Number: The phone number of the SIM/device receiving the SMS (e.g. '0197272313').
  // All incoming and stored SMS will be tagged with this receipt number so that
  // querying by this number returns all messages received on this SIM.
  RECEIPT_NUMBER: '0197272313',
  USER_PHONE_NUMBER: '0197272313',

  // Enable/disable background auto-sync
  AUTO_SYNC_ENABLED: true,
};
