import models from '../models';
import { IAuditLog, AuditAction, ThreatSeverity } from '../types';
import { SecurityHelpers } from '../utils';
import { logger } from '../config/logger';

interface AuditLogInput {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  ip: string;
  userAgent?: string;
  success: boolean;
  severity?: ThreatSeverity;
  details?: Record<string, any>;
  correlationId?: string;
}

export class AuditLogger {
  /**
   * Create an audit log entry
   */
  static async log(input: AuditLogInput): Promise<void> {
    try {
      const auditLog = new models.AuditLog({
        userId: input.userId || null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId || null,
        ip: SecurityHelpers.hashForAudit(input.ip), // Hash IP for privacy
        userAgent: input.userAgent?.substring(0, 200) || null, // Truncate for security
        success: input.success,
        severity: input.severity || this.determineSeverity(input.action, input.success),
        details: input.details || {},
        correlationId: input.correlationId || null,
        timestamp: new Date(),
      });
      
      await auditLog.save();
      
      // Log critical/high severity events to logger
      if (auditLog.severity === ThreatSeverity.CRITICAL || 
          auditLog.severity === ThreatSeverity.HIGH) {
        logger.warn('Security event', {
          action: auditLog.action,
          userId: auditLog.userId,
          resource: auditLog.resource,
          success: auditLog.success,
          severity: auditLog.severity,
          correlationId: auditLog.correlationId,
        });
      }
      
    } catch (error) {
      // Don't let audit logging failures break the application
      logger.error('Failed to create audit log', {
        error: (error as Error).message,
        action: input.action,
        userId: input.userId,
      });
    }
  }
  
  /**
   * Batch log multiple audit entries (for bulk operations)
   */
  static async logBatch(inputs: AuditLogInput[]): Promise<void> {
    try {
      const auditLogs = inputs.map(input => ({
        userId: input.userId || null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId || null,
        ip: SecurityHelpers.hashForAudit(input.ip),
        userAgent: input.userAgent?.substring(0, 200) || null,
        success: input.success,
        severity: input.severity || AuditLogger.determineSeverity(input.action, input.success),
        details: input.details || {},
        correlationId: input.correlationId || null,
        timestamp: new Date(),
      }));
      
      await models.AuditLog.insertMany(auditLogs, { ordered: false });
      
    } catch (error) {
      logger.error('Failed to create batch audit logs', {
        error: (error as Error).message,
        count: inputs.length,
      });
    }
  }
  
  /**
   * Determine severity based on action and success
   */
  private static determineSeverity(action: AuditAction, success: boolean): ThreatSeverity {
    // Critical security events
    if (
      action === AuditAction.REFRESH_TOKEN_REUSE ||
      action === AuditAction.FRAUD_DETECTED ||
      (action === AuditAction.UNAUTHORIZED_ACCESS && !success)
    ) {
      return ThreatSeverity.CRITICAL;
    }
    
    // High severity events
    if (
      action === AuditAction.LOGIN_FAILED ||
      action === AuditAction.ADMIN_MASS_DELETE ||
      action === AuditAction.ADMIN_BULK_OPERATION ||
      action === AuditAction.USER_DELETE ||
      (action === AuditAction.RATE_LIMIT_EXCEEDED)
    ) {
      return ThreatSeverity.HIGH;
    }
    
    // Medium severity events
    if (
      action === AuditAction.PASSWORD_RESET ||
      action === AuditAction.MFA_VERIFY ||
      action === AuditAction.ADMIN_CONFIG_CHANGE ||
      action === AuditAction.USER_DISABLE ||
      action === AuditAction.USER_ENABLE ||
      (action === AuditAction.UNAUTHORIZED_ACCESS && success)
    ) {
      return ThreatSeverity.MEDIUM;
    }
    
    // Default low severity
    return ThreatSeverity.LOW;
  }
}