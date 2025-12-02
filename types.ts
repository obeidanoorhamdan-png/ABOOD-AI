
export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export interface AuthUser {
  username: string;
  isUnlimited: boolean;
  expiryDate: number | null; // Timestamp or null for permanent
  isActive: boolean;
  createdAt: number;
  deviceId?: string; // unique device identifier
  isFreeTrial?: boolean; // helps distinguish free vs paid in admin
}
