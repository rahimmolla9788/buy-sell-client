import { Platform } from 'react-native';

/**
 * ============================================================================
 * 🌐 PRODUCTION / CLOUD SERVER CONFIGURATION (Railway)
 * ============================================================================
 * Deployed on Railway: https://buy-sell-server-production.up.railway.app
 */
const SERVER_URL = 'https://buy-sell-server-production.up.railway.app';

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
