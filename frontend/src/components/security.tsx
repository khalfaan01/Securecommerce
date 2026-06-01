import React from 'react';
import { Badge, Card, Button } from './ui';
import { AuditLog, ThreatAlert, FraudAlert, ThreatSeverity } from '../types';
import { formatDateTime, formatRelativeTime, SEVERITY_COLORS } from '../utils';

// =============================================
// Audit Log Entry Component
// =============================================

interface AuditLogEntryProps {
  log: AuditLog;
  detailed?: boolean;
}

export const AuditLogEntry: React.FC<AuditLogEntryProps> = ({ log, detailed = false }) => {
  const getSeverityColor = (severity: ThreatSeverity) => {
    const colors = {
      low: 'border-blue-500 bg-blue-50',
      medium: 'border-yellow-500 bg-yellow-50',
      high: 'border-orange-500 bg-orange-50',
      critical: 'border-red-500 bg-red-50',
    };
    return colors[severity] || colors.low;
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return '🔑';
    if (action.includes('fraud')) return '🚨';
    if (action.includes('delete')) return '🗑️';
    if (action.includes('create')) return '➕';
    if (action.includes('update')) return '✏️';
    if (action.includes('unauthorized')) return '🚫';
    return '📝';
  };

  return (
    <div className={`p-3 rounded-lg border-l-4 ${getSeverityColor(log.severity)} mb-2`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getActionIcon(log.action)}</span>
            <span className="font-medium text-sm text-gray-900">
              {log.action.replace(/_/g, ' ').toUpperCase()}
            </span>
            <Badge 
              text={log.success ? 'Success' : 'Failed'} 
              variant={log.success ? 'success' : 'danger'} 
            />
            <Badge 
              text={log.severity.toUpperCase()} 
              variant={
                log.severity === 'critical' ? 'danger' :
                log.severity === 'high' ? 'danger' :
                log.severity === 'medium' ? 'warning' : 'info'
              } 
            />
          </div>
          
          <p className="text-sm text-gray-600 mt-1">
            {log.resource}
            {log.resourceId && <span className="font-mono text-xs"> #{log.resourceId}</span>}
            {' • '}
            <span className="text-xs text-gray-400">{log.ip?.substring(0, 16)}...</span>
            {log.userId && <span className="text-xs text-gray-400"> • User: {log.userId}</span>}
          </p>

          {detailed && log.details && Object.keys(log.details).length > 0 && (
            <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-xs">
              <pre className="whitespace-pre-wrap font-mono text-gray-600">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
        
        <div className="text-right ml-4">
          <p className="text-xs text-gray-400">{formatRelativeTime(log.timestamp)}</p>
          {log.correlationId && (
            <p className="text-xs text-gray-400 font-mono mt-1">{log.correlationId}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================
// Live Audit Feed Component
// =============================================

interface LiveAuditFeedProps {
  logs: AuditLog[];
  autoRefresh?: boolean;
  onRefreshToggle?: () => void;
  isLoading?: boolean;
  maxHeight?: string;
}

export const LiveAuditFeed: React.FC<LiveAuditFeedProps> = ({ 
  logs, 
  autoRefresh = true, 
  onRefreshToggle,
  isLoading = false,
  maxHeight = '600px'
}) => {
  return (
    <Card 
      title="Live Audit Feed" 
      actions={
        <div className="flex items-center space-x-2">
          <Button
            variant={autoRefresh ? 'success' : 'secondary'}
            size="sm"
            onClick={onRefreshToggle}
          >
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
          </Button>
        </div>
      }
    >
      <div className="space-y-1" style={{ maxHeight, overflowY: 'auto' }}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No audit events to display</p>
        ) : (
          logs.map((log) => (
            <AuditLogEntry key={log._id} log={log} />
          ))
        )}
      </div>
    </Card>
  );
};

// =============================================
// Threat Alert Card Component
// =============================================

interface ThreatAlertCardProps {
  alert: ThreatAlert;
  onResolve?: (alertId: string) => void;
}

export const ThreatAlertCard: React.FC<ThreatAlertCardProps> = ({ alert, onResolve }) => {
  const severityConfig = {
    low: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'info' as const },
    medium: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', badge: 'warning' as const },
    high: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'warning' as const },
    critical: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'danger' as const },
  };

  const config = severityConfig[alert.severity] || severityConfig.low;

  return (
    <div className={`p-4 rounded-lg border ${config.bg} mb-4`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <Badge text={alert.severity.toUpperCase()} variant={config.badge} />
            <h4 className="font-semibold text-gray-900">{alert.ruleName}</h4>
            {!alert.isResolved && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 mr-1 status-active" />
                Active
              </span>
            )}
          </div>
          
          <p className="text-sm text-gray-600">{alert.action}</p>
          
          <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Occurrences:</span>
              <span className="ml-2 font-semibold">{alert.count}</span>
            </div>
            <div>
              <span className="text-gray-500">First Seen:</span>
              <span className="ml-2">{formatRelativeTime(alert.createdAt)}</span>
            </div>
            {alert.sourceIp && (
              <div className="col-span-2">
                <span className="text-gray-500">Source IP:</span>
                <code className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">{alert.sourceIp}</code>
              </div>
            )}
          </div>

          {alert.details && Object.keys(alert.details).length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                View Details
              </summary>
              <pre className="mt-2 p-3 bg-white bg-opacity-50 rounded text-xs overflow-x-auto">
                {JSON.stringify(alert.details, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {!alert.isResolved && onResolve && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onResolve(alert._id)}
          >
            Resolve
          </Button>
        )}
      </div>
    </div>
  );
};

// =============================================
// Fraud Alert Card Component
// =============================================

interface FraudAlertCardProps {
  alert: FraudAlert;
  onApprove?: (alertId: string) => void;
  onReject?: (alertId: string) => void;
  onRefund?: (alertId: string) => void;
  onAssign?: (alertId: string) => void;
}

export const FraudAlertCard: React.FC<FraudAlertCardProps> = ({ 
  alert, 
  onApprove, 
  onReject, 
  onRefund,
  onAssign 
}) => {
  const riskConfig = {
    low: { color: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
    medium: { color: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50' },
    high: { color: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
    critical: { color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  };

  const config = riskConfig[alert.riskLevel] || riskConfig.medium;
  const isOpen = alert.status === 'open' || alert.status === 'reviewing';

  return (
    <Card className={`border-l-4 ${isOpen ? 'border-red-500' : 'border-green-500'}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-4">
            <span className="text-xs text-gray-400 font-mono">{alert.alertId}</span>
            <Badge text={alert.riskLevel.toUpperCase()} variant={
              alert.riskLevel === 'critical' ? 'danger' :
              alert.riskLevel === 'high' ? 'danger' : 'warning'
            } />
            <Badge text={alert.status} variant={isOpen ? 'danger' : 'success'} />
            {alert.resolution && (
              <Badge text={alert.resolution} variant="info" />
            )}
          </div>

          {/* Risk Score Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Risk Score</span>
              <span className="font-bold">{(alert.riskScore * 100).toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 risk-bar ${config.color}`}
                style={{ width: `${alert.riskScore * 100}%` }}
              />
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Order</p>
              <p className="font-medium">
                {typeof alert.orderId === 'object' 
                  ? `#${(alert.orderId as any).orderNumber}` 
                  : alert.orderId}
              </p>
            </div>
            <div>
              <p className="text-gray-500">User</p>
              <p className="font-medium">
                {typeof alert.userId === 'object' 
                  ? (alert.userId as any).email 
                  : alert.userId}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Detected</p>
              <p className="text-sm">{formatRelativeTime(alert.createdAt)}</p>
            </div>
            <div>
              <p className="text-gray-500">Model</p>
              <p className="text-sm font-mono">random_forest_v1</p>
            </div>
          </div>

          {/* Reasons */}
          {alert.reasons.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Reasons:</p>
              <ul className="space-y-1">
                {alert.reasons.map((reason, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start">
                    <svg className="h-4 w-4 text-red-500 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {isOpen && (
          <div className="ml-6 flex flex-col space-y-2">
            {onApprove && (
              <Button variant="success" size="sm" onClick={() => onApprove(alert._id)}>
                Approve
              </Button>
            )}
            {onReject && (
              <Button variant="danger" size="sm" onClick={() => onReject(alert._id)}>
                Reject
              </Button>
            )}
            {onRefund && (
              <Button variant="warning" size="sm" onClick={() => onRefund(alert._id)}>
                Refund
              </Button>
            )}
            {onAssign && (
              <Button variant="secondary" size="sm" onClick={() => onAssign(alert._id)}>
                Assign
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

// =============================================
// Security Stats Grid Component
// =============================================

interface SecurityStatsProps {
  stats: {
    totalEvents: number;
    criticalAlerts: number;
    failedLogins: number;
    fraudAlerts: number;
    systemHealth: 'healthy' | 'degraded' | 'critical';
  };
}

export const SecurityStatsGrid: React.FC<SecurityStatsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <StatBox
        title="Total Events (24h)"
        value={stats.totalEvents}
        icon="📊"
        color="blue"
      />
      <StatBox
        title="Critical Alerts"
        value={stats.criticalAlerts}
        icon="🚨"
        color="red"
        highlight={stats.criticalAlerts > 0}
      />
      <StatBox
        title="Failed Logins"
        value={stats.failedLogins}
        icon="🔑"
        color="orange"
        highlight={stats.failedLogins > 10}
      />
      <StatBox
        title="Fraud Alerts"
        value={stats.fraudAlerts}
        icon="🔍"
        color="purple"
        highlight={stats.fraudAlerts > 5}
      />
      <StatBox
        title="System Health"
        value={stats.systemHealth.toUpperCase()}
        icon="💚"
        color={stats.systemHealth === 'healthy' ? 'green' : stats.systemHealth === 'degraded' ? 'yellow' : 'red'}
      />
    </div>
  );
};

// Helper for stat boxes
const StatBox: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
  highlight?: boolean;
}> = ({ title, value, icon, color, highlight }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue} ${
      highlight ? 'ring-2 ring-red-400' : ''
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {highlight && (
          <span className="h-2 w-2 rounded-full bg-red-500 status-active" />
        )}
      </div>
      <p className="text-sm opacity-75">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
};

// =============================================
// IP Threat Table Component
// =============================================

interface IPThreatTableProps {
  threats: Array<{
    ip: string;
    count: number;
    lastAttempt: string;
    severity: ThreatSeverity;
  }>;
}

export const IPThreatTable: React.FC<IPThreatTableProps> = ({ threats }) => {
  const getSeverityBadge = (severity: ThreatSeverity) => {
    const config = {
      low: { text: 'Low', variant: 'info' as const },
      medium: { text: 'Medium', variant: 'warning' as const },
      high: { text: 'High', variant: 'danger' as const },
      critical: { text: 'Critical', variant: 'danger' as const },
    };
    return <Badge text={config[severity].text} variant={config[severity].variant} />;
  };

  return (
    <Card title="IP Threat Analysis">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Threat Level</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {threats.map((threat, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono">{threat.ip}</td>
                <td className="px-4 py-3 text-sm font-bold">{threat.count}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatRelativeTime(threat.lastAttempt)}
                </td>
                <td className="px-4 py-3">{getSeverityBadge(threat.severity)}</td>
                <td className="px-4 py-3">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        threat.count > 20 ? 'bg-red-500' :
                        threat.count > 10 ? 'bg-orange-500' :
                        threat.count > 5 ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, threat.count * 4)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {threats.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No threats detected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};