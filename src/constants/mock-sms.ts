import { SMSThread, SMSCategory } from '@/types/sms';

export function extractOTP(text: string): string | undefined {
  // Matches "G-123456"
  const googleMatch = text.match(/\b(G-\d{6})\b/i);
  if (googleMatch) return googleMatch[1];

  // Matches 4-8 digit codes after keywords like code, otp, pin, secret
  const keywordMatch = text.match(/(?:code|otp|pin|verification|password|token)[^0-9]{1,12}([0-9]{4,8})\b/i);
  if (keywordMatch) return keywordMatch[1];

  // Matches standalone 6-digit codes
  const sixDigitMatch = text.match(/\b\d{6}\b/);
  if (sixDigitMatch) return sixDigitMatch[0];

  // Matches standalone 4 or 5 digit codes
  const fourDigitMatch = text.match(/\b\d{4,5}\b/);
  if (fourDigitMatch) return fourDigitMatch[0];

  return undefined;
}

// All dummy messages removed - only real device messages will be displayed
export const INITIAL_SMS_THREADS: SMSThread[] = [];

export const INCOMING_SIMULATION_TEMPLATES: {
  sender: string;
  phoneNumber: string;
  body: string;
  category: SMSCategory;
}[] = [];
