import dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables - Docker env vars take priority over .env files
// Only try to load .env if not in Docker/production
if (!process.env.CONTAINER && process.env.NODE_ENV !== 'production') {
  const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  dotenv.config({ path: join(__dirname, '..', '..', envFile) });
} else {
  // In Docker, environment variables are injected by docker-compose
  // Just load any defaults from .env but don't override
  dotenv.config({ path: join(__dirname, '..', '..', '.env'), override: false });
}

export interface Config {
  server: {
    port: number;
    host: string;
    nodeEnv: string;
  };
  database: {
    uri: string;
    options: {
      useNewUrlParser: boolean;
      useUnifiedTopology: boolean;
    };
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiry: string;
    refreshExpiry: string;
    resetExpiry: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    fraudChannel: string;
    responseChannel: string;
  };
  security: {
    rateLimitGeneral: {
      windowMs: number;
      max: number;
    };
    rateLimitAuth: {
      windowMs: number;
      max: number;
    };
    bcryptRounds: number;
    mfaIssuer: string;
    maxFailedLoginAttempts: number;
    loginBlockDuration: number;
    fraudThreshold: number;
  };
  email: {
    from: string;
    smtp?: {
      host: string;
      port: number;
      auth: {
        user: string;
        pass: string;
      };
    };
  };
  logging: {
    level: string;
    format: string;
    directory: string;
  };
  cors: {
    origin: string;
    credentials: boolean;
  };
}

const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '5000', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  
  database: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/secure_commerce',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    resetExpiry: process.env.JWT_RESET_EXPIRY || '1h',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    fraudChannel: 'fraud_check',
    responseChannel: 'fraud_response',
  },
  
  security: {
    rateLimitGeneral: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_GENERAL || '100', 10),
    },
    rateLimitAuth: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_AUTH || '5', 10),
    },
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    mfaIssuer: process.env.MFA_ISSUER || 'SecureCommerce',
    maxFailedLoginAttempts: parseInt(process.env.MAX_FAILED_LOGINS || '10', 10),
    loginBlockDuration: parseInt(process.env.LOGIN_BLOCK_MINUTES || '15', 10),
    fraudThreshold: parseFloat(process.env.FRAUD_THRESHOLD || '0.7'),
  },
  
  email: {
    from: process.env.EMAIL_FROM || 'noreply@securecommerce.com',
    smtp: process.env.SMTP_HOST ? {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    } : undefined,
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIRECTORY || join(__dirname, '..', '..', 'logs'),
  },
  
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
};

const validateConfig = (config: Config): void => {
  const warnings: string[] = [];
  
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_ACCESS_SECRET || config.jwt.accessSecret === 'dev-access-secret-change-in-production') {
      warnings.push('JWT_ACCESS_SECRET is not set or is using default value');
    }
    if (!process.env.JWT_REFRESH_SECRET || config.jwt.refreshSecret === 'dev-refresh-secret-change-in-production') {
      warnings.push('JWT_REFRESH_SECRET is not set or is using default value');
    }
    if (!process.env.MONGO_URI) {
      warnings.push('MONGO_URI is not set');
    }
    if (!process.env.REDIS_PASSWORD && process.env.REDIS_HOST !== 'localhost') {
      warnings.push('Redis password not set for remote Redis host');
    }
  }
  
  if (warnings.length > 0) {
    console.warn('\n  Configuration warnings:');
    warnings.forEach(w => console.warn(`  • ${w}`));
    console.warn('');
  }
};

validateConfig(config);

export default config;