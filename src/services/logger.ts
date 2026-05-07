import { SystemLog } from '../types';

type LogCallback = (log: SystemLog) => void;

// CR-3 fix: use a Set so multiple subscribers can coexist without silent drop.
const subscribers = new Set<LogCallback>();

export function subscribeToLogs(cb: LogCallback): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function log(level: SystemLog['level'], source: string, message: string, details?: unknown) {
  const newLog: SystemLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    details,
  };

  subscribers.forEach((cb) => {
    try {
      cb(newLog);
    } catch (err) {
      console.error('[Logger] Subscriber callback threw an error:', err);
    }
  });

  // Also console log for dev convenience
  const color = {
    info: '\x1b[36m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    success: '\x1b[32m',
  }[level];
  console.log(`${color}[${source}] ${message}\x1b[0m`, details ?? '');
}

export const logger = {
  info: (source: string, msg: string, details?: unknown) => log('info', source, msg, details),
  warn: (source: string, msg: string, details?: unknown) => log('warn', source, msg, details),
  error: (source: string, msg: string, details?: unknown) => log('error', source, msg, details),
  success: (source: string, msg: string, details?: unknown) => log('success', source, msg, details),
};
