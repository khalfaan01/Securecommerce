import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import { createServer } from 'http';

// Configuration
import config from './config';
import { logger } from './config/logger';

// Types
import { ApiError, ApiResponse, UserRole } from './types';

// Middleware
import { applySecurityMiddleware, rbacGate } from './middleware';

// Modules (route imports)
import authRoutes from './modules/auth';
import userRoutes from './modules/users';
import productRoutes from './modules/products';
import categoryRoutes from './modules/categories';
import cartRoutes from './modules/cart';
import orderRoutes from './modules/orders';
import auditRoutes from './modules/audit';
import analyticsRoutes from './modules/analytics';
import fraudRoutes from './modules/fraud';

// Fraud detection client (Redis pub/sub)
import { FraudDetectionClient } from './utils/fraudClient';

class SecureCommerceServer {
  private app: Application;
  private httpServer: any;
  private fraudClient: FraudDetectionClient;
  private isDevMode: boolean;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.fraudClient = FraudDetectionClient.getInstance();
    this.isDevMode = process.env.NODE_ENV !== 'production';
    
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeDatabaseConnection();
    this.initializeFraudClient();
  }

  private initializeMiddlewares(): void {
    // == CRITICAL: CORS MUST BE ABSOLUTE FIRST
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // In development, allow all origins
          if (process.env.NODE_ENV === 'development') {
            callback(null, true);
            return;
          }
          
          const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',');
          
          // Allow requests with no origin (mobile apps, curl, server-to-server, nginx proxy)
          if (!origin) {
            callback(null, true);
            return;
          }
          
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn('CORS blocked request', { origin, allowedOrigins });
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
          'content-type',
          'authorization',
          'x-correlation-id',
          'x-requested-with',
          'accept',
          'x-session-id',
        ],
        exposedHeaders: [
          'x-ratelimit-limit',
          'x-ratelimit-remaining',
          'x-ratelimit-reset',
          'x-correlation-id',
        ],
        maxAge: 86400,
      })
    );

    // == CRITICAL: Handle preflight for ALL routes
    this.app.options('*', (_req: Request, res: Response) => {
      res.status(204).end();
    });

    // == SECURITY: Helmet with PERMISSIVE CSP for development
    this.app.use(
    helmet({
    // DISABLE CSP COMPLETELY in development since nginx handles it
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    } : false,  // Keep false for development
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    hsts: false,
  })
);

    // == SECURITY: Global rate limiter
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000, // Increased for development
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: 'Too many requests, please try again later.',
      },
    });
    this.app.use(globalLimiter);

    // == SECURITY: NoSQL injection prevention
    this.app.use(mongoSanitize());

    // Body parsing
    this.app.use(express.json({ limit: '10kb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10kb' }));

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent')?.substring(0, 50),
      });
      next();
    });

    // Apply additional security middleware
    applySecurityMiddleware(this.app);
  }

  private initializeRoutes(): void {
    const API_PREFIX = '/api/v1';

    // Root endpoint
    this.app.get('/', (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: 'SecureCommerce API',
        version: '1.0.0',
        documentation: '/api/v1',
        health: '/health',
        timestamp: new Date().toISOString(),
      });
    });

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: 'SecureCommerce API running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          redis: this.fraudClient.isConnected() ? 'connected' : 'disconnected',
        },
      });
    });

    // API Routes
    this.app.use(`${API_PREFIX}/auth`, authRoutes);
    this.app.use(`${API_PREFIX}/users`, rbacGate(UserRole.ADMIN), userRoutes);
    this.app.use(`${API_PREFIX}/products`, productRoutes);
    this.app.use(`${API_PREFIX}/categories`, categoryRoutes);
    this.app.use(`${API_PREFIX}/cart`, cartRoutes);
    this.app.use(`${API_PREFIX}/orders`, orderRoutes);
    this.app.use(`${API_PREFIX}/audit`, rbacGate(UserRole.AUDITOR), auditRoutes);
    this.app.use(`${API_PREFIX}/analytics`, rbacGate(UserRole.ADMIN, UserRole.AUDITOR), analyticsRoutes);
    this.app.use(`${API_PREFIX}/fraud`, rbacGate(UserRole.ADMIN, UserRole.AUDITOR), fraudRoutes);

    // 404 handler - MUST be last
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((err: Error | ApiError, _req: Request, res: Response, _next: NextFunction): void => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });

      // Check if headers already sent
      if (res.headersSent) {
        return;
      }

      if (err instanceof ApiError) {
        res.status(err.statusCode).json({
          success: false,
          error: err.message,
          ...(process.env.NODE_ENV === 'development' && { details: err.details }),
        });
        return;
      }

      // Handle Mongoose validation errors
      if (err.name === 'ValidationError') {
        const mongooseErr = err as any;
        const details = Object.keys(mongooseErr.errors || {}).map(key => ({
          field: key,
          message: mongooseErr.errors[key]?.message || 'Validation failed',
        }));
        
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details,
        });
        return;
      }

      // Handle Mongoose duplicate key errors
      if ((err as any).code === 11000) {
        res.status(409).json({
          success: false,
          error: 'Duplicate entry',
          details: process.env.NODE_ENV === 'development' ? (err as any).keyValue : undefined,
        });
        return;
      }

      // Handle JSON parse errors
      if (err.name === 'SyntaxError' && (err as any).status === 400) {
        res.status(400).json({
          success: false,
          error: 'Invalid JSON in request body',
        });
        return;
      }

      // Generic server error
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { 
          details: err.message,
          stack: err.stack,
        }),
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: Error) => {
      logger.error('Unhandled Promise Rejection', {
        error: reason?.message || 'Unknown reason',
        stack: reason?.stack,
      });
      // Don't exit in dev mode
      if (!this.isDevMode) {
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });
      // Always exit on uncaught exception
      process.exit(1);
    });
  }

  private initializeDatabaseConnection(): void {
    const mongoURI = config.database.uri;
    
    logger.info('Attempting MongoDB connection...', { 
      uri: mongoURI.replace(/\/\/.*@/, '//*****@') // Hide credentials in logs
    });

    mongoose.connect(mongoURI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 10000,
    })
    .then(() => {
      logger.info('MongoDB connected successfully');
    })
    .catch((error) => {
      if (this.isDevMode) {
        logger.warn('MongoDB not available - running without database', {
          error: error.message,
        });
        // Don't exit - let the server run without DB for testing
      } else {
        logger.error('Failed to connect to MongoDB', {
          error: error.message,
        });
        process.exit(1);
      }
    });

    // Connection event handlers
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error', { error: error.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected successfully');
    });
  }

  private initializeFraudClient(): void {
    if (this.isDevMode) {
      logger.info('Development mode: Skipping Redis fraud client connection');
      return;
    }

    try {
      this.fraudClient.connect();
      logger.info('Fraud detection client initialized');
    } catch (error) {
      logger.error('Failed to initialize fraud detection client', {
        error: (error as Error).message,
      });
      // Don't crash - fraud detection will use fallback
    }
  }

  public async start(): Promise<void> {
    const PORT = config.server.port || 5000;
    const HOST = config.server.host || '0.0.0.0';

    this.httpServer.listen(PORT, HOST, () => {
      logger.info(`SecureCommerce server running on http://${HOST}:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      if (process.env.NODE_ENV === 'development') {
        logger.info('API Documentation: http://localhost:5000/api/v1');
        logger.info('Health check: http://localhost:5000/health');
        if (mongoose.connection.readyState !== 1) {
          logger.warn('  MongoDB not connected - database features disabled');
        }
        if (!this.fraudClient.isConnected()) {
          logger.warn('  Redis not connected - fraud detection using fallback');
        }
      }
    });
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down server...');
    
    try {
      this.fraudClient.disconnect();
      await mongoose.disconnect();
      
      this.httpServer.close(() => {
        logger.info('Server shut down complete');
        process.exit(0);
      });
    } catch (error) {
      logger.error('Error during shutdown', { error: (error as Error).message });
      process.exit(1);
    }
  }
}

// Graceful shutdown handler
const gracefulShutdown = (server: SecureCommerceServer) => {
  return async () => {
    logger.info('Received shutdown signal');
    await server.stop();
  };
};

// Start server if this is the main module
if (require.main === module) {
  const server = new SecureCommerceServer();
  server.start();

  // Handle shutdown signals
  process.on('SIGTERM', gracefulShutdown(server));
  process.on('SIGINT', gracefulShutdown(server));
}

export default SecureCommerceServer;