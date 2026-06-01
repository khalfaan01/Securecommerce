import winston from 'winston';
import path from 'path';
import fs from 'fs';
import config from './index';

// Create logs directory if it doesn't exist
const logDirectory = config.logging.directory;
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Custom log format for security auditing
const securityFormat = winston.format((info) => {
  // Mask sensitive data in logs
  if (info.password) info.password = '******';
  if (info.token && typeof info.token === 'string') {
    info.token = info.token.substring(0, 10) + '...';
  }
  if (info.secret) info.secret = '******';
  return info;
});

// Define log levels with custom colors
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    fatal: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'gray',
  },
};

winston.addColors(customLevels.colors);

// Create formatters
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  securityFormat(),
  winston.format.json()
);

// Create the logger instance
export const logger = winston.createLogger({
  levels: customLevels.levels,
  level: config.logging.level || 'info',
  format: config.logging.format === 'json' ? jsonFormat : consoleFormat,
  defaultMeta: {
    service: 'secure-commerce-api',
    environment: config.server.nodeEnv,
  },
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: true,
    }),
    
    // File transport for production logging
    ...(config.server.nodeEnv === 'production' || config.server.nodeEnv === 'staging'
      ? [
          // Error log
          new winston.transports.File({
            filename: path.join(logDirectory, 'error.log'),
            level: 'error',
            format: jsonFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
          }),
          
          // Combined log
          new winston.transports.File({
            filename: path.join(logDirectory, 'combined.log'),
            format: jsonFormat,
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 10,
          }),
          
          // Security audit log (separate file for security events)
          new winston.transports.File({
            filename: path.join(logDirectory, 'security-audit.log'),
            level: 'warn',
            format: jsonFormat,
            maxsize: 50 * 1024 * 1024, // 50MB
            maxFiles: 30,
          }),
          
          // HTTP access log
          new winston.transports.File({
            filename: path.join(logDirectory, 'access.log'),
            level: 'info',
            format: jsonFormat,
            maxsize: 20 * 1024 * 1024,
            maxFiles: 10,
          }),
        ]
      : []),
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDirectory, 'exceptions.log'),
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDirectory, 'rejections.log'),
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  
  exitOnError: false,
});

// Create a stream for Morgan HTTP logging integration
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim(), { type: 'http' });
  },
};

// Security-specific logger
export const securityLogger = {
  /**
   * Log authentication events
   */
  auth(event: string, userId?: string, details?: any): void {
    logger.info(`[AUTH] ${event}`, {
      category: 'authentication',
      userId,
      ...details,
    });
  },

  /**
   * Log authorization failures
   */
  accessDenied(userId: string, resource: string, requiredRole: string, userRole: string): void {
    logger.warn(`[ACCESS_DENIED] User ${userId} attempted to access ${resource}`, {
      category: 'authorization',
      userId,
      resource,
      requiredRole,
      userRole,
    });
  },

  /**
   * Log suspicious activities
   */
  suspicious(activity: string, ip?: string, details?: any): void {
    logger.warn(`[SUSPICIOUS] ${activity}`, {
      category: 'security',
      ip,
      ...details,
    });
  },

  /**
   * Log threat detections
   */
  threat(threatName: string, severity: string, details?: any): void {
    const logMethod = severity === 'critical' ? logger.error.bind(logger) : logger.warn.bind(logger);
    logMethod(`[THREAT] ${threatName}`, {
      category: 'threat',
      severity,
      ...details,
    });
  },

  /**
   * Log fraud detection events
   */
  fraud(transactionId: string, riskScore: number, details?: any): void {
    const level = riskScore > 0.8 ? 'error' : riskScore > 0.6 ? 'warn' : 'info';
    logger.log(level, `[FRAUD] Transaction ${transactionId} scored ${riskScore}`, {
      category: 'fraud',
      transactionId,
      riskScore,
      ...details,
    });
  },
};

// Performance logger
export const performanceLogger = {
  /**
   * Log API request performance
   */
  request(method: string, path: string, durationMs: number, statusCode: number): void {
    const level = durationMs > 3000 ? 'warn' : 'debug';
    logger.log(level, `${method} ${path} completed in ${durationMs}ms with status ${statusCode}`, {
      category: 'performance',
      method,
      path,
      durationMs,
      statusCode,
    });
  },

  /**
   * Log database query performance
   */
  query(collection: string, operation: string, durationMs: number): void {
    if (durationMs > 1000) {
      logger.warn(`Slow query on ${collection}.${operation}: ${durationMs}ms`, {
        category: 'performance',
        type: 'database',
        collection,
        operation,
        durationMs,
      });
    }
  },
};

// Export default logger
export default logger;