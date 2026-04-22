import { SystemLog } from '../types';

type LogCallback = (log: SystemLog) => void;
let subscriber: LogCallback | null = null;

export function subscribeToLogs(cb: LogCallback): () => void {
  subscriber = cb;
  return () => {
    if (subscriber === cb) subscriber = null;
  };
}

export function log(level: SystemLog['level'], source: string, message: string, details?: any) {
  const newLog: SystemLog = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    details
  };
  
  if (subscriber) {
    subscriber(newLog);
  }
  
  // Also console log for dev convenience
  const color = {
    info: '\x1b[36m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    success: '\x1b[32m'
  }[level];
  console.log(`${color}[${source}] ${message}\x1b[0m`, details || '');
}

export const logger = {
  info: (source: string, msg: string, details?: any) => log('info', source, msg, details),
  warn: (source: string, msg: string, details?: any) => log('warn', source, msg, details),
  error: (source: string, msg: string, details?: any) => log('error', source, msg, details),
  success: (source: string, msg: string, details?: any) => log('success', source, msg, details),
};
