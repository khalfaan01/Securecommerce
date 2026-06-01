import React from 'react';
import { Card } from './ui';

// =============================================
// Chart Props Interfaces
// =============================================

interface ChartProps {
  data: ChartDataPoint[];
  title: string;
  subtitle?: string;
  type?: 'bar' | 'line' | 'pie' | 'area' | 'doughnut';
  height?: number;
  className?: string;
  showLegend?: boolean;
}

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  secondaryValue?: number;
}

// =============================================
// Simple Bar Chart
// =============================================

export const BarChart: React.FC<ChartProps> = ({ 
  data, 
  title, 
  subtitle, 
  height = 300,
  className = '',
  showLegend = true 
}) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

  return (
    <Card title={title} subtitle={subtitle} className={className}>
      <div style={{ height: `${height}px` }} className="relative">
        <div className="absolute inset-0 flex items-end justify-around px-4">
          {data.map((point, index) => {
            const barHeight = (point.value / maxValue) * 100;
            const color = point.color || colors[index % colors.length];
            
            return (
              <div key={index} className="flex flex-col items-center flex-1 mx-1">
                <span className="text-xs text-gray-600 mb-1">
                  {point.value.toLocaleString()}
                </span>
                <div className="w-full max-w-[60px] relative group">
                  <div
                    className="w-full rounded-t-md transition-all duration-500 hover:opacity-80 cursor-pointer"
                    style={{
                      height: `${barHeight}%`,
                      backgroundColor: color,
                      minHeight: point.value > 0 ? '4px' : '0',
                    }}
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                      bg-gray-900 text-white text-xs rounded px-2 py-1 opacity-0 
                      group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {point.label}: {point.value.toLocaleString()}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-500 mt-2 text-center truncate w-full">
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

// =============================================
// Simple Line Chart
// =============================================

export const LineChart: React.FC<ChartProps> = ({ 
  data, 
  title, 
  subtitle, 
  height = 300,
  className = '' 
}) => {
  const maxValue = Math.max(...data.map(d => Math.max(d.value, d.secondaryValue || 0)), 1);
  const width = 100;
  const padding = 10;
  
  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
    const y = height - 40 - (point.value / maxValue) * (height - 80);
    return `${x},${y}`;
  }).join(' ');

  const secondaryPoints = data.some(d => d.secondaryValue !== undefined)
    ? data.map((point, index) => {
        const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
        const y = height - 40 - ((point.secondaryValue || 0) / maxValue) * (height - 80);
        return `${x},${y}`;
      }).join(' ')
    : null;

  return (
    <Card title={title} subtitle={subtitle} className={className}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: `${height}px` }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - 40 - ratio * (height - 80);
          return (
            <g key={ratio}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} 
                stroke="#E5E7EB" strokeWidth="0.5" />
              <text x={padding - 2} y={y + 3} textAnchor="end" fontSize="3" fill="#9CA3AF">
                {Math.round(maxValue * ratio)}
              </text>
            </g>
          );
        })}
        
        {/* Main line */}
        <polyline
          points={points}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {data.map((point, index) => {
          const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
          const y = height - 40 - (point.value / maxValue) * (height - 80);
          return (
            <g key={index}>
              <circle cx={x} cy={y} r="1.5" fill="#3B82F6" stroke="white" strokeWidth="0.5" />
              <text x={x} y={height - 10} textAnchor="middle" fontSize="3" fill="#6B7280">
                {point.label}
              </text>
            </g>
          );
        })}
        
        {/* Secondary line */}
        {secondaryPoints && (
          <polyline
            points={secondaryPoints}
            fill="none"
            stroke="#10B981"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2,1"
          />
        )}
      </svg>
      
      {data.some(d => d.secondaryValue !== undefined) && (
        <div className="flex justify-center space-x-4 mt-2">
          <div className="flex items-center">
            <div className="w-3 h-0.5 bg-blue-500 mr-1" />
            <span className="text-xs text-gray-600">Primary</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-0.5 bg-green-500 mr-1 border-dashed" />
            <span className="text-xs text-gray-600">Secondary</span>
          </div>
        </div>
      )}
    </Card>
  );
};

// =============================================
// Simple Pie Chart (Donut)
// =============================================

export const PieChart: React.FC<ChartProps> = ({ 
  data, 
  title, 
  subtitle, 
  height = 300,
  type = 'pie',
  className = '' 
}) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
  
  let currentAngle = 0;
  const isDoughnut = type === 'doughnut';
  const outerRadius = 35;
  const innerRadius = isDoughnut ? 22 : 0;

  return (
    <Card title={title} subtitle={subtitle} className={className}>
      <div className="flex items-center justify-center">
        <svg viewBox="0 0 100 50" className="w-full" style={{ maxHeight: `${height}px` }}>
          {data.map((point, index) => {
            const percentage = (point.value / total) * 100;
            const angle = (percentage / 100) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            currentAngle = endAngle;

            const x1 = 50 + outerRadius * Math.cos((Math.PI * startAngle) / 180);
            const y1 = 25 + outerRadius * Math.sin((Math.PI * startAngle) / 180);
            const x2 = 50 + outerRadius * Math.cos((Math.PI * endAngle) / 180);
            const y2 = 25 + outerRadius * Math.sin((Math.PI * endAngle) / 180);
            
            const x1Inner = innerRadius ? 50 + innerRadius * Math.cos((Math.PI * startAngle) / 180) : 50;
            const y1Inner = innerRadius ? 25 + innerRadius * Math.sin((Math.PI * startAngle) / 180) : 25;
            const x2Inner = innerRadius ? 50 + innerRadius * Math.cos((Math.PI * endAngle) / 180) : 50;
            const y2Inner = innerRadius ? 25 + innerRadius * Math.sin((Math.PI * endAngle) / 180) : 25;

            const largeArc = angle > 180 ? 1 : 0;
            const color = point.color || colors[index % colors.length];

            return (
              <path
                key={index}
                d={`M ${x1Inner} ${y1Inner} L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x2Inner} ${y2Inner} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner} Z`}
                fill={color}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              />
            );
          })}
        </svg>
      </div>
      
      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {data.map((point, index) => {
          const percentage = ((point.value / total) * 100).toFixed(1);
          const color = point.color || colors[index % colors.length];
          return (
            <div key={index} className="flex items-center text-sm">
              <div className="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-gray-600 truncate">{point.label}</span>
              <span className="ml-auto font-medium">{percentage}%</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// =============================================
// Stat Card (Single metric display)
// =============================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  subtitle, 
  change,
  icon,
  color = 'blue' 
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-75">{title}</span>
        {icon && <span className="opacity-75">{icon}</span>}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {(subtitle || change !== undefined) && (
        <div className="flex items-center mt-1 text-sm">
          {change !== undefined && (
            <span className={`font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </span>
          )}
          {subtitle && <span className="ml-2 opacity-75">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};

// =============================================
// Threat Map (Simple visualization)
// =============================================

interface ThreatMapProps {
  threats: Array<{
    ip: string;
    count: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    lastSeen: string;
  }>;
  title?: string;
}

export const ThreatMap: React.FC<ThreatMapProps> = ({ threats, title = 'Threat Map' }) => {
  const severityColors = {
    low: 'bg-blue-100 border-blue-300',
    medium: 'bg-yellow-100 border-yellow-300',
    high: 'bg-orange-100 border-orange-300',
    critical: 'bg-red-100 border-red-300',
  };

  const maxCount = Math.max(...threats.map(t => t.count), 1);

  return (
    <Card title={title}>
      <div className="space-y-3">
        {threats.slice(0, 10).map((threat, index) => (
          <div key={index} className={`p-3 rounded-lg border ${severityColors[threat.severity]}`}>
            <div className="flex justify-between items-center">
              <div>
                <p className="font-mono text-sm font-medium">{threat.ip}</p>
                <p className="text-xs opacity-75 mt-1">
                  Last seen: {new Date(threat.lastSeen).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold">{threat.count}</span>
                <p className="text-xs opacity-75">attempts</p>
              </div>
            </div>
            <div className="mt-2 w-full bg-white bg-opacity-50 rounded-full h-1.5">
              <div
                className="h-full rounded-full bg-current opacity-50"
                style={{ width: `${(threat.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {threats.length === 0 && (
          <p className="text-center text-gray-500 py-4">No threats detected</p>
        )}
      </div>
    </Card>
  );
};