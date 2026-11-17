export interface AuthUser {
  id: string;
  phoneNumber: string;
  username?: string;
  name: string;
  avatar?: string;
  role?: string;
  token?: string;
  isBlocked?: boolean;
  blockedReason?: string;
  createdAt?: number;
  lastLogin?: number;
}

export interface LoginInput {
  phoneNumber: string;
  password?: string;
}

export interface RegisterInput {
  phoneNumber: string;
  name: string;
  password?: string;
}

export interface RequestRegisterOtpInput {
  phoneNumber: string;
  name: string;
  password?: string;
}

export interface VerifyRegisterOtpInput {
  phoneNumber: string;
  otp: string;
  name: string;
  password?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<{ success: boolean; error?: string; isBlocked?: boolean }>;
  register: (input: RegisterInput) => Promise<{ success: boolean; error?: string; isBlocked?: boolean }>;
  requestRegisterOtp: (input: RequestRegisterOtpInput) => Promise<{ success: boolean; error?: string; devOtp?: string }>;
  verifyRegisterOtp: (input: VerifyRegisterOtpInput) => Promise<{ success: boolean; error?: string; isBlocked?: boolean }>;
  requestForgotPasswordOtp: (phoneNumber: string) => Promise<{ success: boolean; error?: string; devOtp?: string }>;
  verifyForgotPasswordOtp: (phoneNumber: string, otp: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  resendOtp: (phoneNumber: string, type: 'register' | 'forgot_password') => Promise<{ success: boolean; error?: string; devOtp?: string }>;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<AuthUser>) => Promise<void>;
  updateProfile: (data: { name?: string; avatar?: string }) => Promise<{ success: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshStatus: () => Promise<boolean>;
}
