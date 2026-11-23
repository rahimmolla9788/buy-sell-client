import { Platform } from 'react-native';

/**
 * ============================================================================
 * 💻 LOCAL DEVELOPMENT SERVER CONFIGURATION
 * ============================================================================
 * In Android Emulator, 10.0.2.2 connects directly to the host PC port 5000.
 */
// 📱 Change this SERVER_URL to your free cloud hosting URL when deploying
// (e.g. 'https://your-app.onrender.com' or 'https://your-app.up.railway.app')
const HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
const SERVER_URL = `http://${HOST}:5000`;

export const BACKEND_API = {
  // 🌐 Web App URL loaded inside the WebView:
  WEBVIEW_URL: SERVER_URL,

  // 🔧 Backend REST API for storing user messages:
  BASE_URL: `${SERVER_URL}/api`,

  // ⏱️ Free-tier hosting resilience settings (handles cold starts up to 45s)
  REQUEST_TIMEOUT_MS: 40000,
  MAX_RETRIES: 3,
  RETRY_INITIAL_DELAY_MS: 1500,

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
