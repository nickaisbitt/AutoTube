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

export function clearLogSubscribers(): void {
  subscribers.clear();
}

/**
 * Structured logger with JSON output support for server-side rendering
 */
class StructuredLogger {
  private useJsonFormat: boolean = false;
  
  constructor(useJsonFormat: boolean = false) {
    this.useJsonFormat = useJsonFormat;
  }

  /**
   * Enable JSON structured logging format
   */
  enableJsonFormat() {
    this.useJsonFormat = true;
  }

  /**
   * Disable JSON structured logging format
   */
  disableJsonFormat() {
    this.useJsonFormat = false;
  }

  /**
   * Format log as structured JSON
   */
  private formatStructured(level: string, source: string, message: string, metadata?: any): string {
    const logEntry = {
      level: level.toUpperCase(),
      timestamp: new Date().toISOString(),
      source,
      message,
      ...(metadata && { metadata }),
    };
    return JSON.stringify(logEntry);
  }

  /**
   * Log with optional structured JSON output
   */
  log(level: SystemLog['level'], source: string, message: string, details?: unknown) {
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

    // Output in structured JSON format if enabled (for server-side logs)
    if (this.useJsonFormat) {
      const metadata = details && typeof details === 'object' ? details : undefined;
      const structuredLog = this.formatStructured(level, source, message, metadata);
      
      switch (level) {
        case 'error':
          console.error(structuredLog);
          break;
        case 'warn':
          console.warn(structuredLog);
          break;
        default:
          console.log(structuredLog);
      }
    } else {
      // Also console log for dev convenience (human-readable format)
      const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
      const color = (code: string, text: string) => isBrowser ? text : `${code}${text}\x1b[0m`;
      const ansiCodes: Record<string, string> = {
        info: '\x1b[36m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        success: '\x1b[32m',
      };
      console.log(color(ansiCodes[level] || '\x1b[37m', `[${source}] ${message}`), details ?? '');
    }
  }

  info(source: string, msg: string, details?: unknown) { 
    this.log('info', source, msg, details); 
  }
  
  warn(source: string, msg: string, details?: unknown) { 
    this.log('warn', source, msg, details); 
  }
  
  error(source: string, msg: string, details?: unknown) { 
    this.log('error', source, msg, details); 
  }
  
  success(source: string, msg: string, details?: unknown) { 
    this.log('success', source, msg, details); 
  }
}

// Create default logger instance
export const logger = new StructuredLogger();

// Standalone backward-compatible helper for tests and external scripts
export function log(level: SystemLog['level'], source: string, message: string, details?: unknown) {
  logger.log(level, source, message, details);
}

// Export structured logger class for server-side usage
export { StructuredLogger };
