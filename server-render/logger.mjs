/**
 * Server-Side Structured Logger for AutoTube
 * 
 * Provides JSON-formatted logging for easy parsing and analysis.
 * Supports log levels, metadata, and file output.
 */

import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Log levels with numeric values for filtering
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Current log level (can be changed via environment variable)
const CURRENT_LOG_LEVEL = parseInt(process.env.LOG_LEVEL || '1', 10);

// Log file path
const LOG_DIR = join(__dirname, '..', 'logs');
const LOG_FILE = join(LOG_DIR, `autotube-render-${new Date().toISOString().split('T')[0]}.log`);

// Ensure log directory exists with restrictive permissions
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Format log entry as structured JSON
 */
function formatLogEntry(level, source, message, metadata = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'INFO',
    source,
    message,
    ...metadata,
  });
}

/**
 * Write log to console and file
 */
function writeLog(level, source, message, metadata = {}) {
  // Skip if below current log level
  if (level < CURRENT_LOG_LEVEL) return;

  const logEntry = formatLogEntry(level, source, message, metadata);
  
  // Console output with color coding
  const colors = {
    [LOG_LEVELS.DEBUG]: '\x1b[90m',   // Gray
    [LOG_LEVELS.INFO]: '\x1b[36m',    // Cyan
    [LOG_LEVELS.WARN]: '\x1b[33m',    // Yellow
    [LOG_LEVELS.ERROR]: '\x1b[31m',   // Red
  };
  
  const color = colors[level] || '\x1b[37m';
  const reset = '\x1b[0m';
  
  switch (level) {
    case LOG_LEVELS.ERROR:
      console.error(`${color}${logEntry}${reset}`);
      break;
    case LOG_LEVELS.WARN:
      console.warn(`${color}${logEntry}${reset}`);
      break;
    default:
      console.log(`${color}${logEntry}${reset}`);
  }
  
  // Append to log file
  try {
    appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (err) {
    console.error(`Failed to write to log file: ${err.message}`);
  }
}

/**
 * Logger API
 */
export const serverLogger = {
  /**
   * Debug level logging (verbose details)
   */
  debug(source, message, metadata = {}) {
    writeLog(LOG_LEVELS.DEBUG, source, message, metadata);
  },

  /**
   * Info level logging (normal operations)
   */
  info(source, message, metadata = {}) {
    writeLog(LOG_LEVELS.INFO, source, message, metadata);
  },

  /**
   * Warning level logging (potential issues)
   */
  warn(source, message, metadata = {}) {
    writeLog(LOG_LEVELS.WARN, source, message, metadata);
  },

  /**
   * Error level logging (failures)
   */
  error(source, message, error = null, metadata = {}) {
    const errorMetadata = error ? {
      errorMessage: error.message,
      errorStack: error.stack,
      ...metadata,
    } : metadata;
    
    writeLog(LOG_LEVELS.ERROR, source, message, errorMetadata);
  },

  /**
   * Success level logging (completed operations)
   */
  success(source, message, metadata = {}) {
    writeLog(LOG_LEVELS.INFO, source, message, { status: 'success', ...metadata });
  },

  /**
   * Get log file path
   */
  getLogFile() {
    return LOG_FILE;
  },

  /**
   * Clear log file
   */
  clearLog() {
    try {
      writeFileSync(LOG_FILE, '');
      this.info('Logger', 'Log file cleared');
    } catch (err) {
      console.error(`Failed to clear log file: ${err.message}`);
    }
  },
};

// Export default logger instance
export default serverLogger;
