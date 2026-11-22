import { BACKEND_API } from '@/constants/api';
import Constants from 'expo-constants';

export interface AppVersionInfo {
  success: boolean;
  latest_version: string;
  version_code: number;
  min_version_code: number;
  download_url: string;
  force_update: boolean;
  release_notes: string;
}

export const CURRENT_APP_VERSION = Constants.expoConfig?.version || '1.0.0';
export const CURRENT_VERSION_CODE = (Constants.expoConfig?.android as any)?.versionCode || 1;

/**
 * Fetch latest app version information from backend server.
 */
export async function fetchAppVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    const res = await fetch(`${BACKEND_API.BASE_URL}/app/version`, {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.success) {
      return json as AppVersionInfo;
    }
    return null;
  } catch (err) {
    console.warn('[AppUpdate] Failed to fetch version info:', err);
    return null;
  }
}
