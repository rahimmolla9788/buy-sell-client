import { io, Socket } from 'socket.io-client';
import { BACKEND_API } from '@/constants/api';

let socketInstance: Socket | null = null;
let activeSessionId: string | null = null;
let activeUserPhone: string | null = null;
let lastErrorLogTime = 0;

export function getSocket(): Socket {
  if (!socketInstance) {
    const serverUrl = BACKEND_API.WEBVIEW_URL || BACKEND_API.BASE_URL.replace(/\/api\/?$/, '');
    const isVercel = serverUrl.includes('vercel.app');

    // On Vercel serverless, WebSockets are unsupported by Vercel infrastructure.
    // Use polling on Vercel, or WebSocket on persistent servers (VPS / Node dev).
    const transports = isVercel ? ['polling'] : ['websocket', 'polling'];

    socketInstance = io(serverUrl, {
      transports,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: isVercel ? 5 : Infinity,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 20000,
      timeout: 15000,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO Client] Connected to server! Socket ID:', socketInstance?.id);
      // Auto re-join rooms upon connection/reconnection
      if (activeSessionId) {
        socketInstance?.emit('join-session', activeSessionId);
      }
      if (activeUserPhone) {
        socketInstance?.emit('join-user', activeUserPhone);
      }
    });

    socketInstance.on('disconnect', (_reason) => {
      // Disconnected
    });

    socketInstance.on('connect_error', (error) => {
      const now = Date.now();
      // Throttle error logs to once every 60 seconds to avoid console flood
      if (now - lastErrorLogTime > 60000) {
        lastErrorLogTime = now;
        if (isVercel) {
          console.log('[Socket.IO Client] WebSockets not supported on Vercel serverless. Operating with HTTP fallback.');
        } else {
          console.log('[Socket.IO Client] Reconnecting to socket server...', error?.message);
        }
      }
    });
  }

  return socketInstance;
}

/**
 * Join a specific payment session room to receive instant live updates
 */
export function joinPaymentSession(sessionId: string) {
  activeSessionId = sessionId;
  const socket = getSocket();
  if (socket && sessionId) {
    socket.emit('join-session', sessionId);
  }
}

/**
 * Leave payment session room
 */
export function leavePaymentSession(sessionId: string) {
  if (activeSessionId === sessionId) {
    activeSessionId = null;
  }
  const socket = getSocket();
  if (socket && sessionId) {
    socket.emit('leave-session', sessionId);
  }
}

/**
 * Join user room for real-time status updates (block/unblock)
 */
export function joinUserRoom(phoneNumber: string) {
  activeUserPhone = phoneNumber;
  const socket = getSocket();
  if (socket && phoneNumber) {
    socket.emit('join-user', phoneNumber);
  }
}

/**
 * Leave user room & mark offline upon logout
 */
export function leaveUserRoom() {
  if (activeUserPhone) {
    const socket = getSocket();
    if (socket) {
      socket.emit('user-offline', activeUserPhone);
    }
    activeUserPhone = null;
  }
}

/**
 * Send presence heartbeat while app is active
 */
export function sendUserHeartbeat() {
  if (activeUserPhone) {
    const socket = getSocket();
    if (socket) {
      socket.emit('user-heartbeat', activeUserPhone);
    }
  }
}
