import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';

import models from '../models';
import config from '../config';
import { 
  ApiError, 
  ApiResponse, 
  UserRole, 
  AuditAction, 
  ThreatSeverity 
} from '../types';
import { 
  JWTUtils, 
  PasswordUtils, 
  MFAUtils, 
  SecurityHelpers, 
  TokenGenerator,
  ValidationHelpers 
} from '../utils';
import { authenticate, rbacGate } from '../middleware';
import { logger } from '../config/logger';
import { AuditLogger } from '../services/auditService';


// =============================================
// Rate Limiting for Auth Routes (Strict)
// =============================================

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes for auth endpoints
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
  },
});

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: {
    success: false,
    error: 'Too many login attempts. Account temporarily locked. Try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by both IP and email
    const ip = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    const email = req.body.email || 'unknown';
    return `${ip}_${email}`;
  },
});

// =============================================
// Validation Schemas (Zod)
// =============================================

const registerSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase().trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
  firstName: z.string().min(1, 'First name is required').max(50).trim(),
  lastName: z.string().min(1, 'Last name is required').max(50).trim(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
  mfaToken: z.string().length(6, 'MFA token must be 6 digits').optional(),
});

const mfaSetupSchema = z.object({
  token: z.string().length(6, 'MFA token must be 6 digits'),
});

const mfaVerifySchema = z.object({
  token: z.string().length(6, 'MFA token must be 6 digits'),
  sessionToken: z.string().min(1, 'Session token required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase().trim(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
});

// =============================================
// Auth Controller
// =============================================

class AuthController {
  
  /**
   * Register new user
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await models.User.findOne({ email: validatedData.email });
      if (existingUser) {
        throw ApiError.badRequest('Email already registered', {
          field: 'email',
          message: 'An account with this email already exists',
        });
      }
      
      // Create user
      const user = new models.User({
        ...validatedData,
        role: UserRole.CUSTOMER,
      });
      
      await user.save();
      
      // Generate tokens
      const sessionId = SecurityHelpers.generateSessionId();
      const accessToken = JWTUtils.generateAccessToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      });
      const refreshToken = JWTUtils.generateRefreshToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      });
      
      // Store refresh token
      const refreshTokenDoc = {
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdAt: new Date(),
        isRevoked: false,
      };
      
      await models.User.findByIdAndUpdate(user._id, {
        $push: { refreshTokens: refreshTokenDoc },
      });
      
      // Audit log
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.USER_REGISTER,
        resource: 'auth',
        resourceId: user._id.toString(),
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.LOW,
      });
      
      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/v1/auth',
      });
      
      logger.info('User registered successfully', {
        userId: user._id,
        email: user.email,
      });
      
      return res.status(201).json(ApiResponse.success({
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isVerified: user.isVerified,
          mfaEnabled: user.mfaEnabled,
        },
        accessToken,
        sessionId,
        expiresIn: 900, // 15 minutes in seconds
      }, 'Registration successful'));
      
    } catch (error) {
      return next(error);
    }
  }
  
  /**
   * Login user
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const { email, password, mfaToken } = validatedData;
      
      // Find user with password field
      const user = await models.User.findOne({ email }).select('+password +mfaSecret');
      
      if (!user) {
        // Use constant-time comparison to prevent timing attacks
        await bcrypt.compare(password, '$2b$12$invalidhashforconstanttime');
        throw ApiError.unauthorized('Invalid email or password');
      }
      
      // Check if account is active
      if (!user.isActive) {
        throw ApiError.forbidden('Account has been disabled. Contact support.');
      }
      
      // Check if account is locked
      if (user.isLocked()) {
        const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        
        await AuditLogger.log({
          userId: user._id.toString(),
          action: AuditAction.LOGIN_FAILED,
          resource: 'auth',
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: false,
          severity: ThreatSeverity.HIGH,
          details: { reason: 'Account locked', minutesRemaining: minutesLeft },
        });
        
        throw ApiError.tooManyRequests(
          `Account is temporarily locked. Try again in ${minutesLeft} minutes.`
        );
      }
      
      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      
      if (!isPasswordValid) {
        // Increment failed login attempts
        user.failedLoginAttempts += 1;
        
        // Check if account should be locked
        if (user.failedLoginAttempts >= config.security.maxFailedLoginAttempts) {
          user.lockedUntil = new Date(Date.now() + config.security.loginBlockDuration * 60 * 1000);
          
          // Create threat alert
          await models.ThreatAlert.create({
            ruleId: 'account_lock',
            ruleName: 'Account Lockout',
            severity: ThreatSeverity.HIGH,
            userId: user._id,
            action: 'account_locked',
            details: {
              email,
              failedAttempts: user.failedLoginAttempts,
              lockedUntil: user.lockedUntil,
              ip: req.ip || '0.0.0.0',
            },
            count: 1,
          });
        }
        
        await user.save();
        
        // Audit log
        await AuditLogger.log({
          userId: user._id.toString(),
          action: AuditAction.LOGIN_FAILED,
          resource: 'auth',
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: false,
          severity: user.failedLoginAttempts >= 5 ? ThreatSeverity.HIGH : ThreatSeverity.MEDIUM,
          details: { 
            reason: 'Invalid password',
            attemptNumber: user.failedLoginAttempts,
          },
        });
        
        throw ApiError.unauthorized('Invalid email or password');
      }
      
      // Check if MFA is required
      if (user.mfaEnabled) {
        if (!mfaToken) {
          // MFA is required but not provided - return partial auth
          const mfaSessionToken = JWTUtils.generateAccessToken({
            userId: user._id.toString(),
            email: user.email,
            role: user.role,
            sessionId: 'mfa_pending',
          });
          
          return res.json(ApiResponse.success({
            requireMfa: true,
            mfaSessionToken,
            message: 'MFA token required',
          }, 'MFA verification required'));
        }
        
        // Verify MFA token
        const isMfaValid = MFAUtils.verifyToken(user.mfaSecret, mfaToken);
        
        if (!isMfaValid) {
          await AuditLogger.log({
            userId: user._id.toString(),
            action: AuditAction.MFA_VERIFY,
            resource: 'auth',
            ip: req.ip || '0.0.0.0',
            userAgent: req.get('user-agent'),
            success: false,
            severity: ThreatSeverity.MEDIUM,
            details: { reason: 'Invalid MFA token' },
          });
          
          throw ApiError.unauthorized('Invalid MFA token');
        }
      }
      
      // Successful login - reset failed attempts
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      user.lastLogin = new Date();
      user.lastLoginIp = req.ip;
      await user.save();
      
      // Generate tokens
      const sessionId = SecurityHelpers.generateSessionId();
      const accessToken = JWTUtils.generateAccessToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      });
      const refreshToken = JWTUtils.generateRefreshToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      });
      
      // Store refresh token (limit to 5 active tokens per user)
      const activeTokens = user.refreshTokens.filter((rt: any) => !rt.isRevoked && rt.expiresAt > new Date());
      const refreshTokenDoc = {
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        isRevoked: false,
      };
      
      if (activeTokens.length >= 5) {
        // Revoke oldest token
        const oldestToken = activeTokens.sort((a: any, b: any) => 
          a.createdAt.getTime() - b.createdAt.getTime()
        )[0];
        oldestToken.isRevoked = true;
      }
      
      user.refreshTokens.push(refreshTokenDoc);
      await user.save();
      
      // Audit log
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.LOGIN_SUCCESS,
        resource: 'auth',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.LOW,
        details: { sessionId },
      });
      
      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/v1/auth',
      });
      
      logger.info('User logged in successfully', {
        userId: user._id,
        email: user.email,
        sessionId,
      });
      
      return res.json(ApiResponse.success({
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isVerified: user.isVerified,
          mfaEnabled: user.mfaEnabled,
          lastLogin: user.lastLogin,
        },
        accessToken,
        sessionId,
        expiresIn: 900,
      }, 'Login successful'));
      
    } catch (error) {
      return next(error);
    }
  }
  
  /**
   * Setup MFA for user
   */
  static async setupMfa(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const user = await models.User.findById(userId).select('+mfaSecret');
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      if (user.mfaEnabled) {
        throw ApiError.badRequest('MFA is already enabled');
      }
      
      // Generate MFA secret
      const { secret, otpauth_url } = MFAUtils.generateSecret();
      
      // Store secret temporarily (not yet enabled until verified)
      user.mfaSecret = secret;
      await user.save();
      
      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(otpauth_url);
      
      // Generate recovery codes
      const recoveryCodes = MFAUtils.generateRecoveryCodes(8);
      const hashedRecoveryCodes = await MFAUtils.hashRecoveryCodes(recoveryCodes);
      
      // Store hashed recovery codes
      user.mfaRecoveryCodes = hashedRecoveryCodes;
      await user.save();
      
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.MFA_SETUP,
        resource: 'auth',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.LOW,
      });
      
      res.json(ApiResponse.success({
        secret,
        qrCodeUrl,
        recoveryCodes, // Only shown once during setup
        message: 'Scan QR code with authenticator app and verify with a token',
      }, 'MFA setup initiated'));
      
    } catch (error) {
      return next(error);
    }
  }
  
  /**
   * Verify and enable MFA
   */
  static async verifyMfa(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = mfaSetupSchema.parse(req.body);
      const userId = req.user!.userId;
      
      const user = await models.User.findById(userId).select('+mfaSecret +mfaRecoveryCodes');
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      if (!user.mfaSecret) {
        throw ApiError.badRequest('MFA setup not initiated');
      }
      
      // Verify token
      const isValid = MFAUtils.verifyToken(user.mfaSecret, token);
      
      if (!isValid) {
        throw ApiError.badRequest('Invalid verification code');
      }
      
      // Enable MFA
      user.mfaEnabled = true;
      await user.save();
      
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.MFA_VERIFY,
        resource: 'auth',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.LOW,
        details: { enabled: true },
      });
      
      res.json(ApiResponse.success({
        mfaEnabled: true,
        message: 'MFA has been enabled successfully',
      }, 'MFA enabled'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Disable MFA
   */
  static async disableMfa(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = z.object({
        token: z.string().length(6),
        password: z.string().min(1),
      }).parse(req.body);
      
      const userId = req.user!.userId;
      const user = await models.User.findById(userId).select('+password +mfaSecret');
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      // Verify password first
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw ApiError.unauthorized('Invalid password');
      }
      
      // Verify MFA token
      const isMfaValid = MFAUtils.verifyToken(user.mfaSecret, token);
      if (!isMfaValid) {
        throw ApiError.badRequest('Invalid MFA token');
      }
      
      // Disable MFA
      user.mfaEnabled = false;
      user.mfaSecret = null;
      user.mfaRecoveryCodes = [];
      await user.save();
      
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.MFA_VERIFY,
        resource: 'auth',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.MEDIUM,
        details: { disabled: true },
      });
      
      res.json(ApiResponse.success({
        mfaEnabled: false,
        message: 'MFA has been disabled',
      }, 'MFA disabled'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Refresh access token
   */
  static async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      // Get token from cookie OR body - handle both cases safely
      let token: string | undefined;
      
      // Check cookie first
      if (req.cookies && req.cookies.refreshToken) {
        token = req.cookies.refreshToken;
      } 
      // Then check body
      else if (req.body && req.body.refreshToken) {
        token = req.body.refreshToken;
      }
      
      // Validate we have a token
      if (!token) {
        throw ApiError.unauthorized('Refresh token is required');
      }
      
      // Verify refresh token
      let decoded;
      try {
        decoded = JWTUtils.verifyRefreshToken(token);
      } catch (error) {
        throw ApiError.unauthorized('Invalid or expired refresh token');
      }
      
      // Find user with the refresh token
      const user = await models.User.findOne({
        _id: decoded.userId,
        'refreshTokens.token': token,
      });
      
      if (!user) {
        // Possible token reuse attack
        logger.warn('Refresh token reuse detected', {
          userId: decoded.userId,
          token: token.substring(0, 10) + '...',
          ip: req.ip || '0.0.0.0',
        });
        
        // Revoke all tokens for this user (security measure)
        await models.User.findByIdAndUpdate(decoded.userId, {
          $set: { 'refreshTokens.$[].isRevoked': true },
        });
        
        await AuditLogger.log({
          userId: decoded.userId,
          action: AuditAction.REFRESH_TOKEN_REUSE,
          resource: 'auth',
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: false,
          severity: ThreatSeverity.CRITICAL,
          details: { tokenSubstring: token.substring(0, 10) + '...' },
        });
        
        throw ApiError.unauthorized('Token reuse detected. All sessions terminated.');
      }
      
      // Check if token is revoked
      const tokenDoc = user.refreshTokens.find((rt: any) => rt.token === token);
      if (!tokenDoc || tokenDoc.isRevoked) {
        throw ApiError.unauthorized('Token has been revoked');
      }
      
      // Check if token is expired
      if (tokenDoc.expiresAt < new Date()) {
        throw ApiError.unauthorized('Token has expired');
      }
      
      // Generate new tokens (rotation)
      const newSessionId = SecurityHelpers.generateSessionId();
      const newAccessToken = JWTUtils.generateAccessToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId: newSessionId,
      });
      const newRefreshToken = JWTUtils.generateRefreshToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId: newSessionId,
      });
      
      // Revoke old token and add new token
      tokenDoc.isRevoked = true;
      tokenDoc.replacedBy = newRefreshToken;
      
      user.refreshTokens.push({
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        isRevoked: false,
      });
      
      await user.save();
      
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.REFRESH_TOKEN,
        resource: 'auth',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.LOW,
      });
      
      // Set new refresh token as HTTP-only cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/v1/auth',
      });
      
      res.json(ApiResponse.success({
        accessToken: newAccessToken,
        sessionId: newSessionId,
        expiresIn: 900,
      }, 'Token refreshed successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Logout user
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
      
      if (refreshToken) {
        // Revoke the specific refresh token
        await models.User.findOneAndUpdate(
          { 'refreshTokens.token': refreshToken },
          { $set: { 'refreshTokens.$.isRevoked': true } }
        );
      }
      
      // Clear cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
      });
      
      if (req.user) {
        await AuditLogger.log({
          userId: req.user!.userId,
          action: AuditAction.LOGOUT,
          resource: 'auth',
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: true,
          severity: ThreatSeverity.LOW,
        });
      }
      
      res.json(ApiResponse.success(null, 'Logged out successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Forgot password - send reset token
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      
      // Always return success to prevent email enumeration
      const user = await models.User.findOne({ email, isActive: true });
      let resetToken: string | null = null;
      
      if (user) {
        // Generate reset token
        resetToken = JWTUtils.generateResetToken(user._id.toString(), user.email);
        
        // In production, send email with reset link
        // For now, return token in development
        if (process.env.NODE_ENV === 'development') {
          logger.info('Password reset token generated', {
            userId: user._id,
            email: user.email,
            resetToken: resetToken.substring(0, 20) + '...',
          });
        }
        
        await AuditLogger.log({
          userId: user._id.toString(),
          action: AuditAction.PASSWORD_RESET,
          resource: 'auth',
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: true,
          severity: ThreatSeverity.MEDIUM,
        });
      }
      
      res.json(ApiResponse.success(
        process.env.NODE_ENV === 'development' ? { resetToken } : null,
        'If the email exists, a password reset link has been sent'
      ));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Reset password with token
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);
      
      // Verify reset token
      let decoded;
      try {
        decoded = JWTUtils.verifyAccessToken(token);
      } catch (error) {
        throw ApiError.badRequest('Invalid or expired reset token');
      }
      
      if (decoded.type !== 'reset') {
        throw ApiError.badRequest('Invalid token type');
      }
      
      // Find user
      const user = await models.User.findById(decoded.userId);
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      if (!user.isActive) {
        throw ApiError.forbidden('Account is disabled');
      }
      
      // CRITICAL FIX: Hash password BEFORE setting to prevent double-hash
      // Update password directly to trigger pre-save hook properly
      user.password = newPassword;
      user.refreshTokens.forEach((rt: any) => { rt.isRevoked = true; });
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      
      await user.save();
      
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.PASSWORD_RESET,
        resource: 'auth',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.MEDIUM,
        details: { method: 'reset_token' },
      });
      
      res.json(ApiResponse.success(null, 'Password reset successful'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Change password (authenticated)
   */
  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const userId = req.user!.userId;
      
      const user = await models.User.findById(userId).select('+password');
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      // Verify current password
      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        throw ApiError.unauthorized('Current password is incorrect');
      }
      
      // Don't allow same password
      const isSamePassword = await user.comparePassword(newPassword);
      if (isSamePassword) {
        throw ApiError.badRequest('New password must be different from current password');
      }
      
      // Update password
      user.password = newPassword;
      logger.debug('Password change', {
      userId,
      isPasswordModified: user.isModified('password'),
      passwordLength: newPassword.length
      });
      await user.save();
      
      await AuditLogger.log({
        userId: user._id.toString(),
        action: AuditAction.PASSWORD_RESET,
        resource: 'auth',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.MEDIUM,
        details: { method: 'authenticated_change' },
      });
      
      res.json(ApiResponse.success(null, 'Password changed successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get current user profile
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await models.User.findById(req.user!.userId);
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      res.json(ApiResponse.success({
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          isVerified: user.isVerified,
          mfaEnabled: user.mfaEnabled,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
      }));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Auth Routes
// =============================================

const router = Router();

// Public routes
router.post('/register', authRateLimiter, AuthController.register);
router.post('/login', loginRateLimiter, AuthController.login);
router.post('/refresh-token', authRateLimiter, AuthController.refreshToken);
router.post('/forgot-password', authRateLimiter, AuthController.forgotPassword);
router.post('/reset-password', authRateLimiter, AuthController.resetPassword);

// Protected routes (require authentication)
router.post('/logout', authenticate, AuthController.logout);
router.get('/profile', authenticate, AuthController.getProfile);
router.post('/change-password', authenticate, AuthController.changePassword);
router.post('/mfa/setup', authenticate, AuthController.setupMfa);
router.post('/mfa/verify', authenticate, AuthController.verifyMfa);
router.post('/mfa/disable', authenticate, AuthController.disableMfa);

export default router;