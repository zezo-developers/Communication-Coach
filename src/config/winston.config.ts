import winston from 'winston';

/**
 * Winston logger configuration factory
 * Creates a structured logger with different transports based on environment
 */
export const createWinstonLogger = (): winston.Logger => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Define log format
  const logFormat = winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS',
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(
      ({ timestamp, level, message, context, trace, ...meta }) => {
        const logObject: Record<string, unknown> = {
          timestamp,
          level: level.toUpperCase(),
          context: context || 'Application',
          message,
        };
        if (trace) {
          logObject.trace = trace;
        }
        if (Object.keys(meta).length > 0) {
          logObject.meta = meta;
        }
        return JSON.stringify(logObject);
      },
    ),
  );

  // Console format for development
  const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({
      format: 'HH:mm:ss',
    }),
    winston.format.printf(({ timestamp, level, message, context }: any) => {
      const ctx = context ? `[${context}]` : '';
      return `${timestamp} ${level} ${ctx} ${message}`;
    }),
  );

  // Create transports array
  const transports: winston.transport[] = [];

  // Console transport (always enabled)
  transports.push(
    new winston.transports.Console({
      level: logLevel,
      format: nodeEnv === 'production' ? logFormat : consoleFormat,
    }),
  );

  // File transports for production
  if (nodeEnv === 'production') {
    // Error log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    );

    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 10,
      }),
    );
  }

  return winston.createLogger({
    level: logLevel,
    format: logFormat,
    defaultMeta: { service: 'stm-server' },
    transports,
    // Don't exit on handled exceptions
    exitOnError: false,
  });
};
