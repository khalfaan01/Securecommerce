import React, { useState, useEffect, useCallback } from 'react';
import { AdminLayout, Sidebar } from '../components/layout';
import { Card, Badge, StatusBadge, Table, Button } from '../components/ui';
import { AuditLog, ThreatAlert, FraudAlert, ThreatSeverity } from '../types';
import api from '../api';

// =============================================
// Security Sidebar
// =============================================

const SecuritySidebar: React.FC = () => {
  const items = [
    { 
      label: 'Live Audit Feed', 
      path: '/security',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    { 
      label: 'Failed Login Map', 
      path: '/security/failed-logins',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    { 
      label: 'Threat Alerts', 
      path: '/security/threats',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
    },
    { 
      label: 'Fraud Review Queue', 
      path: '/security/fraud',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    { 
      label: 'System Health', 
      path: '/security/health',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return <Sidebar items={items} title="Security Center" />;
};

// =============================================
// Live Audit Feed
// =============================================

export const AuditFeed: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [page, setPage] = useState(1);

  const loadLogs = useCallback(async () => {
    try {
      const params: any = { page, limit: 50, sort: 'timestamp', order: 'desc' };
      if (severityFilter) params.severity = severityFilter;
      const response = await api.getAuditLogs(params);
      // response.data is AuditLog[] directly
      const logsData = response.data as AuditLog[];
      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, severityFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

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
    <AdminLayout sidebar={<SecuritySidebar />}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Live Audit Feed</h1>
        <div className="flex items-center space-x-4">
          <Button 
            variant={autoRefresh ? 'success' : 'secondary'} 
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
          </Button>
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <Card>
        <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
          {logs.map((log) => (
            <div 
              key={log._id}
              className={`p-3 rounded border-l-4 ${
                log.severity === 'critical' ? 'border-red-600 bg-red-50' :
                log.severity === 'high' ? 'border-orange-500 bg-orange-50' :
                log.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                'border-blue-500 bg-blue-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2">
                    {getSeverityBadge(log.severity)}
                    <span className="text-sm font-medium text-gray-900">{log.action}</span>
                    {!log.success && <Badge text="Failed" variant="danger" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {log.resource}{log.resourceId ? ` #${log.resourceId}` : ''} • 
                    IP: {log.ip?.substring(0, 12)}... • 
                    {log.userId ? ` User: ${log.userId}` : ' Anonymous'}
                  </p>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {JSON.stringify(log.details).substring(0, 100)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AdminLayout>
  );
};

// =============================================
// Failed Login Map
// =============================================

export const FailedLoginMap: React.FC = () => {
  const [failedLogins, setFailedLogins] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFailedLogins();
  }, []);

  const loadFailedLogins = async () => {
    try {
      const response = await api.getFailedLoginMap();
      // response.data could be { ipAddresses: [...] } or array directly
      const data = response.data as any;
      setFailedLogins(Array.isArray(data) ? data : (data?.ipAddresses || []));
    } catch (error) {
      console.error('Failed to load failed login data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminLayout sidebar={<SecuritySidebar />}>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Failed Login Map</h1>

      <Card title="IP Addresses with Multiple Failed Attempts" subtitle="Last 24 hours">
        {failedLogins.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No suspicious login activity detected</p>
        ) : (
          <div className="space-y-4">
            <Table
              columns={[
                { key: 'ip', label: 'IP Address' },
                { 
                  key: 'count', 
                  label: 'Failed Attempts',
                  render: (item: any) => (
                    <Badge 
                      text={item.count.toString()} 
                      variant={item.count > 10 ? 'danger' : item.count > 5 ? 'warning' : 'info'} 
                    />
                  )
                },
                { 
                  key: 'lastAttempt', 
                  label: 'Last Attempt',
                  render: (item: any) => new Date(item.lastAttempt).toLocaleString()
                },
                {
                  key: 'recentAttempts',
                  label: 'Recent Attempts',
                  render: (item: any) => (
                    <div className="text-xs text-gray-500">
                      {item.recentAttempts?.slice(0, 3).map((attempt: any, i: number) => (
                        <div key={i}>{new Date(attempt.timestamp).toLocaleTimeString()}</div>
                      ))}
                    </div>
                  ),
                },
              ]}
              data={failedLogins}
              isLoading={isLoading}
            />
          </div>
        )}
      </Card>
    </AdminLayout>
  );
};

// =============================================
// Threat Alerts
// =============================================

export const ThreatAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadThreats();
  }, []);

  const loadThreats = async () => {
    try {
      const response = await api.getThreatAlerts({ isResolved: false });
      // response.data is ThreatAlert[] directly
      const alertsData = response.data as ThreatAlert[];
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
    } catch (error) {
      console.error('Failed to load threat alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      await api.put(`/fraud/threats/${alertId}/resolve`);
      loadThreats();
    } catch (error) {
      console.error('Failed to resolve threat:', error);
    }
  };

  const getSeverityBadge = (severity: ThreatSeverity) => {
    const config = {
      low: { text: 'Low', variant: 'info' as const },
      medium: { text: 'Medium', variant: 'warning' as const },
      high: { text: 'High', variant: 'danger' as const },
      critical: { text: 'CRITICAL', variant: 'danger' as const },
    };
    return <Badge text={config[severity].text} variant={config[severity].variant} />;
  };

  return (
    <AdminLayout sidebar={<SecuritySidebar />}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Threat Alerts</h1>
        <Button onClick={loadThreats} variant="secondary" size="sm">Refresh</Button>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="mt-2 text-gray-500">No active threats detected</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card key={alert._id} className={`border-l-4 ${
              alert.severity === 'critical' ? 'border-red-600' :
              alert.severity === 'high' ? 'border-orange-500' :
              'border-yellow-500'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    {getSeverityBadge(alert.severity)}
                    <h3 className="text-lg font-semibold">{alert.ruleName}</h3>
                    {!alert.isResolved && <Badge text="Active" variant="danger" />}
                  </div>
                  <p className="text-sm text-gray-600">{alert.action}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Occurrences: {alert.count} • 
                    First seen: {new Date(alert.createdAt).toLocaleString()}
                  </p>
                  {alert.sourceIp && (
                    <p className="text-xs text-gray-400 mt-1">Source IP: {alert.sourceIp}</p>
                  )}
                </div>
                {!alert.isResolved && (
                  <Button size="sm" onClick={() => handleResolve(alert._id)}>
                    Resolve
                  </Button>
                )}
              </div>
              {alert.details && (
                <div className="mt-3 p-3 bg-gray-50 rounded text-xs">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(alert.details, null, 2)}</pre>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

// =============================================
// Fraud Review Queue
// =============================================

export const FraudReviewQueue: React.FC = () => {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');

  useEffect(() => {
    loadFraudAlerts();
  }, [statusFilter]);

  const loadFraudAlerts = async () => {
    try {
      const params: any = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const response = await api.getFraudAlerts(params);
      // response.data is FraudAlert[] directly
      const alertsData = response.data as FraudAlert[];
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
    } catch (error) {
      console.error('Failed to load fraud alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async (alertId: string, resolution: string) => {
    try {
      await api.updateFraudAlert(alertId, { resolution, status: 'resolved' });
      loadFraudAlerts();
    } catch (error) {
      console.error('Failed to resolve fraud alert:', error);
    }
  };

  const getRiskBadge = (level: string) => {
    const config: any = {
      low: { text: 'Low', variant: 'success' as const },
      medium: { text: 'Medium', variant: 'warning' as const },
      high: { text: 'High', variant: 'danger' as const },
      critical: { text: 'CRITICAL', variant: 'danger' as const },
    };
    return <Badge text={config[level].text} variant={config[level].variant} />;
  };

  return (
    <AdminLayout sidebar={<SecuritySidebar />}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Fraud Review Queue</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md"
        >
          <option value="open">Open</option>
          <option value="reviewing">In Review</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-500">No fraud alerts in queue</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card key={alert._id} className={alert.status === 'open' ? 'border-l-4 border-red-500' : ''}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-xs text-gray-400">{alert.alertId}</span>
                    {getRiskBadge(alert.riskLevel)}
                    <Badge text={alert.status} variant={alert.status === 'open' ? 'danger' : 'info'} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Risk Score</p>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                        <div 
                          className={`h-2.5 rounded-full ${
                            alert.riskScore > 0.8 ? 'bg-red-600' :
                            alert.riskScore > 0.6 ? 'bg-orange-500' :
                            'bg-yellow-500'
                          }`}
                          style={{ width: `${alert.riskScore * 100}%` }}
                        />
                      </div>
                      <p className="text-xl font-bold mt-1">{(alert.riskScore * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Order</p>
                      <p className="font-medium">
                        {typeof alert.orderId === 'object' ? `#${(alert.orderId as any).orderNumber}` : alert.orderId}
                      </p>
                      <p className="text-sm text-gray-500 mt-2">User</p>
                      <p className="font-medium">
                        {typeof alert.userId === 'object' ? (alert.userId as any).email : alert.userId}
                      </p>
                    </div>
                  </div>

                  {alert.reasons.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-1">Reasons:</p>
                      <ul className="list-disc list-inside text-sm text-gray-600">
                        {alert.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 mt-2">
                    Detected: {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>

                {alert.status !== 'resolved' && (
                  <div className="flex flex-col space-y-2 ml-4">
                    <Button 
                      variant="success" 
                      size="sm"
                      onClick={() => handleResolve(alert._id, 'approved')}
                    >
                      Approve
                    </Button>
                    <Button 
                      variant="danger" 
                      size="sm"
                      onClick={() => handleResolve(alert._id, 'rejected')}
                    >
                      Reject
                    </Button>
                    <Button 
                      variant="warning" 
                      size="sm"
                      onClick={() => handleResolve(alert._id, 'refunded')}
                    >
                      Refund
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

// =============================================
// System Health
// =============================================

export const SystemHealth: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHealth();
  }, []);

  const loadHealth = async () => {
    try {
      const response = await api.getSystemHealth();
      setHealth(response.data);
    } catch (error) {
      console.error('Failed to load system health:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout sidebar={<SecuritySidebar />}>
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout sidebar={<SecuritySidebar />}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
        <Button onClick={loadHealth} variant="secondary" size="sm">Refresh</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card title="Database">
          <div className="flex items-center">
            <span className={`h-3 w-3 rounded-full mr-2 ${health?.serviceStatus?.database === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-lg font-semibold capitalize">{health?.serviceStatus?.database || 'Unknown'}</span>
          </div>
        </Card>
        <Card title="Redis">
          <div className="flex items-center">
            <span className={`h-3 w-3 rounded-full mr-2 ${health?.serviceStatus?.redis === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-lg font-semibold capitalize">{health?.serviceStatus?.redis || 'Unknown'}</span>
          </div>
        </Card>
        <Card title="Fraud Service">
          <div className="flex items-center">
            <span className={`h-3 w-3 rounded-full mr-2 ${health?.serviceStatus?.fraudService === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-lg font-semibold capitalize">{health?.serviceStatus?.fraudService || 'Unknown'}</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <p className="text-sm text-gray-500">Rate Limiter Hits (1h)</p>
          <p className="text-2xl font-bold">{health?.rateLimiterHits || 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Active Tokens</p>
          <p className="text-2xl font-bold">{health?.activeTokens || 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Recent Errors (1h)</p>
          <p className="text-2xl font-bold text-red-600">{health?.recentErrors1h || 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Uptime</p>
          <p className="text-2xl font-bold">{health?.uptime ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : 'N/A'}</p>
        </Card>
      </div>

      <Card title="Collection Statistics">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {health?.collectionStats && Object.entries(health.collectionStats).map(([key, value]: any) => (
            <div key={key} className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="System Information" className="mt-6">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Node.js Version</span>
            <span>{health?.nodeVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Memory Usage</span>
            <span>
              {health?.memoryUsage ? `${(health.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(health.memoryUsage.heapTotal / 1024 / 1024).toFixed(1)} MB` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Last Updated</span>
            <span>{health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}</span>
          </div>
        </div>
      </Card>
    </AdminLayout>
  );
};