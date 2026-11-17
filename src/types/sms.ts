export type SMSCategory = 'all' | 'personal' | 'banking' | 'otp' | 'promotions';

export interface SMSMessage {
  id: string;
  threadId: string;
  sender: string;
  phoneNumber: string;
  body: string;
  timestamp: number;
  isIncoming: boolean;
  isRead: boolean;
  category: SMSCategory;
  recipientPhone?: string; // 📱 User's SIM phone number that received this message
  receiptNumber?: string; // 📱 Receipt number (e.g. 0197272313)
  otpCode?: string;
  isStarred?: boolean;
}

export interface SMSThread {
  id: string;
  contactName: string;
  phoneNumber: string;
  category: SMSCategory;
  avatarColor: string;
  unreadCount: number;
  lastMessage: SMSMessage;
  messages: SMSMessage[];
}

export interface IncomingSMSPayload {
  sender: string;
  phoneNumber: string;
  body: string;
  category: SMSCategory;
}

export interface SMSSettings {
  enableSound: boolean;
  enableVibration: boolean;
  autoSimulateIncoming: boolean;
  simulationIntervalSec: number;
  sendRealSms?: boolean;
}
