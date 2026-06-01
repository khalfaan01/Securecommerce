import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import * as crypto from 'crypto';
import config from '../config';

// =============================================
// JWT Utilities
// =============================================

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  type?: 'access' | 'refresh' | 'reset';
}

export class JWTUtils {
  /**
   * Generate access token (short-lived)
   */
  static generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
    return jwt.sign(
      { ...payload, type: 'access' },
      config.jwt.accessSecret as jwt.Secret,
      { expiresIn: '15m' } as jwt.SignOptions
    );
  }

  /**
   * Generate refresh token (long-lived)
   */
  static generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
    return jwt.sign(
      { ...payload, type: 'refresh' },
      config.jwt.refreshSecret as jwt.Secret,
      { expiresIn: '7d' } as jwt.SignOptions
    );
  }

  /**
   * Generate password reset token
   */
  static generateResetToken(userId: string, email: string): string {
    return jwt.sign(
      { userId, email, type: 'reset' },
      config.jwt.accessSecret as jwt.Secret,
      { expiresIn: '1h' } as jwt.SignOptions
    );
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token: string): TokenPayload {
    return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
  }

  /**
   * Decode token without verification (for debugging)
   */
  static decodeToken(token: string): TokenPayload | null {
    return jwt.decode(token) as TokenPayload | null;
  }
}

// =============================================
// Password Utilities
// =============================================

export class PasswordUtils {
  /**
   * Hash password with bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(config.security.bcryptRounds);
    return bcrypt.hash(password, salt);
  }

  /**
   * Compare password with hash
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength
   * Requirements:
   * - Minimum 8 characters
   * - At least 1 uppercase letter
   * - At least 1 lowercase letter
   * - At least 1 number
   * - At least 1 special character
   */
  static validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one special character' };
    }
    return { valid: true };
  }
}

// =============================================
// MFA (TOTP) Utilities
// =============================================

export class MFAUtils {
  /**
   * Generate MFA secret for user
   */
  static generateSecret(): { secret: string; otpauth_url: string } {
    const secret = speakeasy.generateSecret({
      name: `SecureCommerce:${config.security.mfaIssuer}`,
      issuer: config.security.mfaIssuer,
    });

    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url || '',
    };
  }

  /**
   * Generate QR code URL for MFA setup
   */
  static generateQRCodeUrl(email: string, secret: string): string {
    const appName = encodeURIComponent(config.security.mfaIssuer);
    const userEmail = encodeURIComponent(email);
    return `otpauth://totp/${appName}:${userEmail}?secret=${secret}&issuer=${appName}`;
  }

  /**
   * Verify TOTP token
   */
  static verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1, // Allow 1 step before/after for clock drift
    });
  }

  /**
   * Generate recovery codes
   */
  static generateRecoveryCodes(count: number = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Hash recovery codes for storage
   */
  static async hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map(code => PasswordUtils.hashPassword(code)));
  }
}

// =============================================
// API Response & Error Classes
// =============================================

export class ApiError extends Error {
  public statusCode: number;
  public details?: any;
  public isOperational: boolean;

  constructor(statusCode: number, message: string, details?: any, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: any): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message: string = 'Authentication required'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message: string = 'Insufficient permissions'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message: string = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static tooManyRequests(message: string = 'Too many requests'): ApiError {
    return new ApiError(429, message);
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError(500, message);
  }
}

export class ApiResponse {
  static success(data: any, message: string = 'Success', meta?: any) {
    return {
      success: true,
      message,
      data,
      ...(meta && { meta }),
    };
  }

  static paginated(data: any[], page: number, limit: number, total: number) {
    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }
}

// =============================================
// Random Token / ID Generators
// =============================================

export class TokenGenerator {
  /**
   * Generate a cryptographically secure random token
   */
  static generateRandomToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a short numeric code (e.g., for email verification)
   */
  static generateNumericCode(length: number = 6): string {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += digits[crypto.randomInt(0, digits.length)];
    }
    return code;
  }

  /**
   * Generate a unique request/correlation ID
   */
  static generateCorrelationId(): string {
    return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}

// =============================================
// Security Helpers
// =============================================

export class SecurityHelpers {
  /**
   * Generate a cryptographically secure session ID
   */
  static generateSessionId(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Create a hash of sensitive data for auditing (e.g., IP addresses)
   */
  static hashForAudit(data: string): string {
    return crypto.createHash('sha256').update(data + config.jwt.accessSecret).digest('hex');
  }

  /**
   * Sanitize filename for uploads
   */
  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  /**
   * Calculate risk score based on heuristics
   */
  static calculateHeuristicRisk(
    failedLogins: number,
    orderVelocity: number,
    isNewAccount: boolean,
    ipChanged: boolean
  ): number {
    let score = 0;
    if (failedLogins > 5) score += 0.3;
    if (failedLogins > 10) score += 0.2;
    if (orderVelocity > 10) score += 0.3;
    if (isNewAccount && orderVelocity > 3) score += 0.2;
    if (ipChanged) score += 0.1;
    return Math.min(score, 1.0);
  }
}

// =============================================
// Type Checking / Validation Helpers
// =============================================

export class ValidationHelpers {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidMongoId(id: string): boolean {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(id);
  }
}