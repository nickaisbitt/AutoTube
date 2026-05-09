interface MonitoringError {
  error: Error;
  context?: Record<string, unknown>;
  timestamp: number;
  level?: 'info' | 'warning' | 'error';
}

interface MonitoringUser {
  id: string;
  email?: string;
}

const MAX_ERRORS = 100;
const errorStore: MonitoringError[] = [];
const messageStore: Array<{ message: string; level: string; timestamp: number }> = [];
let currentUser: MonitoringUser | null = null;

export function initMonitoring(_dsn: string): void {
  console.log('[Monitoring] Initialized with in-memory error logger');
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  const entry: MonitoringError = {
    error,
    context,
    timestamp: Date.now(),
    level: 'error',
  };
  errorStore.push(entry);
  if (errorStore.length > MAX_ERRORS) {
    errorStore.shift();
  }
  console.error('[Monitoring] Error captured:', error.message, context);
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
): void {
  messageStore.push({ message, level, timestamp: Date.now() });
  if (messageStore.length > MAX_ERRORS) {
    messageStore.shift();
  }
  console.log(`[Monitoring][${level}] ${message}`);
}

export function setUser(user: MonitoringUser): void {
  currentUser = user;
  console.log('[Monitoring] User set:', user.id);
}

export function getRecentErrors(): MonitoringError[] {
  return [...errorStore].map((e) => ({
    ...e,
    user: currentUser ?? undefined,
  }));
}

export function getRecentMessages(): typeof messageStore {
  return [...messageStore];
}
