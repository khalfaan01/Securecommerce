import React from 'react';
import { Link } from 'react-router-dom';
import { Badge, StatusBadge, Button } from './ui';
import { Order, OrderStatus } from '../types';
import { formatCurrency, formatDate, formatRelativeTime } from '../utils';

// =============================================
// Order Card Component
// =============================================

interface OrderCardProps {
  order: Order;
  showActions?: boolean;
  onCancel?: (orderId: string) => void;
  detailed?: boolean;
}

export const OrderCard: React.FC<OrderCardProps> = ({ 
  order, 
  showActions = true, 
  onCancel,
  detailed = false 
}) => {
  const canCancel = [OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <Link 
            to={`/orders/${order._id}`}
            className="text-lg font-semibold text-blue-600 hover:text-blue-800"
          >
            Order #{order.orderNumber}
          </Link>
          <p className="text-sm text-gray-500 mt-1">
            {formatRelativeTime(order.createdAt)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Items Summary */}
      <div className="border-t border-b border-gray-100 py-3 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Items ({order.items.length})</span>
          <Link to={`/orders/${order._id}`} className="text-blue-600 hover:text-blue-800 text-xs">
            View all
          </Link>
        </div>
        {detailed && (
          <div className="mt-2 space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between items-center text-sm">
                <div className="flex items-center">
                  {item.image && (
                    <img src={item.image} alt={item.name} className="h-8 w-8 rounded object-cover mr-2" />
                  )}
                  <span>{item.name} x {item.quantity}</span>
                </div>
                <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Details */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <span className="text-gray-500">Total</span>
          <p className="font-bold text-lg">{formatCurrency(order.total)}</p>
        </div>
        <div>
          <span className="text-gray-500">Payment</span>
          <Badge 
            text={order.paymentStatus} 
            variant={order.paymentStatus === 'completed' ? 'success' : 
                     order.paymentStatus === 'failed' ? 'danger' : 'warning'} 
          />
        </div>
      </div>

      {/* Fraud Alert */}
      {order.fraudCheck?.isFraudulent && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center text-sm text-red-700">
            <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Fraud Alert - Risk Score: {(order.fraudCheck.riskScore * 100).toFixed(0)}%
          </div>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex justify-end space-x-2">
          <Link to={`/orders/${order._id}`}>
            <Button variant="secondary" size="sm">View Details</Button>
          </Link>
          {canCancel && onCancel && (
            <Button variant="danger" size="sm" onClick={() => onCancel(order._id)}>
              Cancel Order
            </Button>
          )}
          {order.trackingNumber && (
            <Button variant="secondary" size="sm">
              Track Package
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================
// Order Timeline Component
// =============================================

interface OrderTimelineProps {
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ status, createdAt, updatedAt }) => {
  const steps = [
    { status: OrderStatus.PENDING, label: 'Order Placed', icon: '📋' },
    { status: OrderStatus.CONFIRMED, label: 'Confirmed', icon: '✅' },
    { status: OrderStatus.PROCESSING, label: 'Processing', icon: '⚙️' },
    { status: OrderStatus.SHIPPED, label: 'Shipped', icon: '📦' },
    { status: OrderStatus.DELIVERED, label: 'Delivered', icon: '🏠' },
  ];

  const currentIndex = steps.findIndex(s => s.status === status);
  const isCancelled = status === OrderStatus.CANCELLED;
  const isFlagged = status === OrderStatus.FLAGGED || status === OrderStatus.REJECTED;

  return (
    <div className="relative">
      {isCancelled ? (
        <div className="text-center py-6">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-red-600">Order Cancelled</p>
          <p className="text-sm text-gray-500 mt-1">{formatDate(createdAt)}</p>
        </div>
      ) : isFlagged ? (
        <div className="text-center py-6">
          <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-yellow-600">Under Review</p>
          <p className="text-sm text-gray-500 mt-1">Fraud check in progress</p>
        </div>
      ) : (
        <div className="flex justify-between items-start">
          {steps.map((step, index) => {
            const isCompleted = index <= currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div key={step.status} className="flex flex-col items-center flex-1">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200" 
                    style={{ 
                      left: `${(index / (steps.length - 1)) * 100}%`,
                      width: `${100 / (steps.length - 1)}%`,
                      backgroundColor: isCompleted ? '#3B82F6' : '#E5E7EB',
                    }} 
                  />
                )}
                
                {/* Step circle */}
                <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${
                  isCompleted ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm">{step.icon}</span>
                  )}
                </div>
                
                {/* Label */}
                <span className={`mt-2 text-xs font-medium text-center ${
                  isCurrent ? 'text-blue-600' : isCompleted ? 'text-gray-700' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================
// Order Items List
// =============================================

interface OrderItemsListProps {
  items: Order['items'];
}

export const OrderItemsList: React.FC<OrderItemsListProps> = ({ items }) => {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
          <div className="flex items-center">
            <div className="h-12 w-12 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
              {item.image ? (
                <img src={item.image} alt={item.name} className="h-full w-full object-cover rounded" />
              ) : (
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{item.name}</p>
              <p className="text-xs text-gray-500">
                ${item.price.toFixed(2)} x {item.quantity}
              </p>
            </div>
          </div>
          <p className="text-sm font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
        </div>
      ))}
    </div>
  );
};