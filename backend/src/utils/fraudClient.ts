import Redis from 'ioredis';
import { logger } from '../config/logger';
import config from '../config';
import { IFraudCheckRequest, IFraudCheckResult, FraudRiskLevel } from '../types';

/**
 * Fraud Detection Client
 * Communicates with Python ML service via Redis pub/sub
 */
export class FraudDetectionClient {
  private static instance: FraudDetectionClient;
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private isConnectedStatus: boolean = false;
  private pendingRequests: Map<string, {
    resolve: (value: IFraudCheckResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FraudDetectionClient {
    if (!FraudDetectionClient.instance) {
      FraudDetectionClient.instance = new FraudDetectionClient();
    }
    return FraudDetectionClient.instance;
  }

  /**
   * Connect to Redis
   */
  connect(): void {
    try {
      const redisConfig = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        lazyConnect: true, // Don't connect immediately
        retryStrategy: (times: number) => {
          // Stop retrying after 3 attempts in development
          if (process.env.NODE_ENV === 'development' && times > 3) {
            logger.warn('Redis connection failed after 3 retries - giving up');
            return null; // Stop reconnecting
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
      };

      // Publisher client
      this.redis = new Redis(redisConfig);

      // Subscriber client (separate connection)
      this.subscriber = new Redis(redisConfig);

      this.redis.on('connect', () => {
        this.isConnectedStatus = true;
        logger.info('Fraud detection Redis publisher connected');
      });

      this.subscriber.on('connect', () => {
        logger.info('Fraud detection Redis subscriber connected');
      });

      this.redis.on('error', (error) => {
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Redis error (dev mode - non-critical)', { error: error.message });
        } else {
          logger.error('Fraud detection Redis error', { error: error.message });
        }
        this.isConnectedStatus = false;
      });

      // Only try to connect if not in dev mode or if Redis might be available
      if (process.env.NODE_ENV !== 'development') {
        this.redis.connect();
        this.subscriber.connect();
        
        // Subscribe to fraud response channel
        this.subscriber.subscribe(config.redis.responseChannel);
        
        this.subscriber.on('message', (channel, message) => {
          if (channel === config.redis.responseChannel) {
            this.handleFraudResponse(message);
          }
        });
      }

      logger.info('Fraud detection client initialized', {
        service: 'secure-commerce-api',
        environment: process.env.NODE_ENV || 'development',
        host: config.redis.host,
        port: config.redis.port,
        pubChannel: config.redis.fraudChannel,
        subChannel: config.redis.responseChannel,
      });

    } catch (error) {
      logger.error('Failed to connect fraud detection client', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Disconnect from Redis
   */
  disconnect(): void {
    if (this.redis) {
      this.redis.disconnect();
    }
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
    this.isConnectedStatus = false;
    logger.info('Fraud detection client disconnected');
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.isConnectedStatus;
  }

  /**
   * Send transaction for fraud checking
   * Returns a promise that resolves with the fraud check result
   */
  async checkTransaction(
    request: IFraudCheckRequest,
    timeoutMs: number = 5000
  ): Promise<number> {
    if (!this.redis || !this.isConnectedStatus) {
      // Fallback to heuristic check when Redis is not available
      logger.debug('Using heuristic fraud check (Redis not connected)');
      return FraudDetectionClient.performHeuristicCheck(request);
    }

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.transactionId);
        // Fallback to heuristic on timeout
        const fallbackScore = FraudDetectionClient.performHeuristicCheck(request);
        logger.warn('Fraud check timeout - using heuristic fallback', {
          transactionId: request.transactionId,
          score: fallbackScore,
        });
        resolve(fallbackScore);
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(request.transactionId, {
        resolve: (result: IFraudCheckResult) => {
          clearTimeout(timeout);
          resolve(result.riskScore);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          const fallbackScore = FraudDetectionClient.performHeuristicCheck(request);
          logger.warn('Fraud check failed - using heuristic fallback', {
            transactionId: request.transactionId,
            error: error.message,
            score: fallbackScore,
          });
          resolve(fallbackScore);
        },
        timeout,
      });

      // Publish fraud check request
      const message = JSON.stringify(request);
      
      if (this.redis) {
           this.redis.publish(config.redis.fraudChannel, message)
        .then(() => {
          logger.debug('Fraud check request published', {
            transactionId: request.transactionId,
            amount: request.orderData.amount,
          });
        })
        .catch((error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(request.transactionId);
          const fallbackScore = FraudDetectionClient.performHeuristicCheck(request);
          logger.warn('Failed to publish fraud check - using heuristic fallback', {
            error: error.message,
            score: fallbackScore,
          });
          resolve(fallbackScore);
        });
      }
    });
  }

  /**
   * Handle fraud detection response from Python service
   */
  private handleFraudResponse(message: string): void {
    try {
      const result: IFraudCheckResult = JSON.parse(message);
      
      logger.debug('Fraud check response received', {
        transactionId: result.transactionId,
        riskScore: result.riskScore,
        isFraudulent: result.isFraudulent,
      });

      // Find and resolve pending request
      const pendingRequest = this.pendingRequests.get(result.transactionId);
      
      if (pendingRequest) {
        this.pendingRequests.delete(result.transactionId);
        
        if (result.isFraudulent) {
          logger.warn('Fraudulent transaction detected', {
            transactionId: result.transactionId,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
            reasons: result.reasons,
          });
        }
        
        pendingRequest.resolve(result);
      } else {
        logger.warn('Received response for unknown transaction', {
          transactionId: result.transactionId,
        });
      }

    } catch (error) {
      logger.error('Failed to parse fraud response', {
        error: (error as Error).message,
        message,
      });
    }
  }

  /**
   * Perform a local heuristic check (fallback when ML service is unavailable)
   */
  static performHeuristicCheck(request: IFraudCheckRequest): number {
    let riskScore = 0;

    // High amount transactions
    if (request.orderData.amount > 1000) {
      riskScore += 0.2;
    }
    if (request.orderData.amount > 5000) {
      riskScore += 0.2;
    }

    // Order velocity
    if (request.userData.recentOrders > 5) {
      riskScore += 0.2;
    }
    if (request.userData.recentOrders > 10) {
      riskScore += 0.2;
    }

    // Address mismatch
    if (!request.userData.addressMatch) {
      riskScore += 0.15;
    }

    // New account
    if (request.userData.accountAge && request.userData.accountAge < 7) {
      riskScore += 0.1;
    }

    // Unusual hours
    if (request.metadata.hourOfDay >= 0 && request.metadata.hourOfDay <= 5) {
      riskScore += 0.1;
    }

    // Round to 2 decimal places
    return Math.round(Math.min(riskScore, 1) * 100) / 100;
  }
}