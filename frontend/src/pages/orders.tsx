import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/layout';
import { Card, Button, StatusBadge, Badge } from '../components/ui';
import { Order, OrderStatus } from '../types';
import api from '../api';

// =============================================
// Orders List Page
// =============================================

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const loadOrders = async () => {
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const response = await api.getMyOrders(params);
      // response.data is Order[] directly
      const ordersData = response.data as Order[];
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.cancelOrder(orderId);
      loadOrders();
    } catch (error) {
      console.error('Failed to cancel order:', error);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">My Orders</h1>

        {/* Filter */}
        <div className="mb-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All Orders</option>
            {Object.values(OrderStatus).map(status => (
              <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900">No orders yet</h2>
            <Link to="/shop" className="mt-4 inline-block">
              <Button>Start Shopping</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <Card key={order._id}>
                <div className="flex justify-between items-start">
                  <div>
                    <Link to={`/orders/${order._id}`} className="text-lg font-semibold text-blue-600 hover:text-blue-800">
                      Order #{order.orderNumber}
                    </Link>
                    <p className="text-sm text-gray-500 mt-1">
                      Placed on {new Date(order.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Items</p>
                    <p className="font-medium">{order.items.length} items</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total</p>
                    <p className="font-medium">${order.total.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Payment</p>
                    <Badge text={order.paymentStatus} variant={
                      order.paymentStatus === 'completed' ? 'success' :
                      order.paymentStatus === 'failed' ? 'danger' : 'warning'
                    } />
                  </div>
                </div>

                {order.fraudCheck && order.fraudCheck.isFraudulent && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-700">
                      ⚠️ This order was flagged by our fraud detection system
                    </p>
                  </div>
                )}

                <div className="mt-4 flex justify-end space-x-3">
                  <Link to={`/orders/${order._id}`}>
                    <Button variant="secondary" size="sm">View Details</Button>
                  </Link>
                  {[OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status) && (
                    <Button 
                      variant="danger" 
                      size="sm"
                      onClick={() => handleCancelOrder(order._id)}
                    >
                      Cancel Order
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

// =============================================
// Order Detail Page
// =============================================

export const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) loadOrder();
  }, [id]);

  const loadOrder = async () => {
    try {
      const response = await api.getOrder(id!);
      // response.data is the Order object directly
      setOrder(response.data as Order || null);
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <svg className="animate-spin h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </Layout>
    );
  }

  if (!order) return null;

  const timelineSteps = [
    { status: OrderStatus.PENDING, label: 'Order Placed', date: order.createdAt },
    { status: OrderStatus.CONFIRMED, label: 'Confirmed', date: null },
    { status: OrderStatus.PROCESSING, label: 'Processing', date: null },
    { status: OrderStatus.SHIPPED, label: 'Shipped', date: null },
    { status: OrderStatus.DELIVERED, label: 'Delivered', date: null },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Order #{order.orderNumber}</h1>
            <p className="text-gray-500 mt-1">
              Placed on {new Date(order.createdAt).toLocaleDateString()}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        {/* Order Timeline */}
        <Card title="Order Status" className="mb-8">
          <div className="flex justify-between">
            {timelineSteps.map((step, index) => {
              const currentIndex = timelineSteps.findIndex(s => s.status === order.status);
              const isCompleted = index <= currentIndex;
              const isCurrent = index === currentIndex;

              return (
                <div key={step.status} className="flex-1 text-center">
                  <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center ${
                    isCompleted ? 'bg-blue-600' : 'bg-gray-300'
                  }`}>
                    {isCompleted && (
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <p className={`mt-2 text-sm ${isCurrent ? 'font-bold text-blue-600' : 'text-gray-500'}`}>
                    {step.label}
                  </p>
                  {step.date && (
                    <p className="text-xs text-gray-400">
                      {new Date(step.date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Order Items */}
            <Card title="Items">
              <div className="space-y-4">
                {order.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-gray-500">Quantity: {item.quantity}</p>
                    </div>
                    <p className="font-bold">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Shipping & Billing */}
            <div className="grid grid-cols-2 gap-4">
              <Card title="Shipping Address">
                <div className="text-sm">
                  <p className="font-semibold">{order.shippingAddress.fullName}</p>
                  <p>{order.shippingAddress.street}</p>
                  <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}</p>
                  <p>{order.shippingAddress.country}</p>
                </div>
              </Card>
              <Card title="Billing Address">
                <div className="text-sm">
                  <p className="font-semibold">{order.billingAddress.fullName}</p>
                  <p>{order.billingAddress.street}</p>
                  <p>{order.billingAddress.city}, {order.billingAddress.state} {order.billingAddress.zipCode}</p>
                  <p>{order.billingAddress.country}</p>
                </div>
              </Card>
            </div>

            {/* Fraud Check Results */}
            {order.fraudCheck && (
              <Card title="Fraud Analysis">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Risk Score</span>
                    <Badge 
                      text={`${(order.fraudCheck.riskScore * 100).toFixed(0)}%`}
                      variant={order.fraudCheck.isFraudulent ? 'danger' : 'success'}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span>Risk Level</span>
                    <Badge 
                      text={order.fraudCheck.riskLevel.toUpperCase()}
                      variant={order.fraudCheck.isFraudulent ? 'danger' : 'info'}
                    />
                  </div>
                  {order.fraudCheck.reasons.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Reasons:</p>
                      <ul className="list-disc list-inside text-sm text-gray-600">
                        {order.fraudCheck.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card title="Order Summary">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>${order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Shipping</span>
                  <span>${order.shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax</span>
                  <span>${order.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>${order.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <p><span className="text-gray-500">Payment Method:</span> {order.paymentInfo.method}</p>
                {order.paymentInfo.last4 && (
                  <p><span className="text-gray-500">Card:</span> ****{order.paymentInfo.last4}</p>
                )}
                <p>
                  <span className="text-gray-500">Payment Status:</span>{' '}
                  <Badge 
                    text={order.paymentStatus}
                    variant={order.paymentStatus === 'completed' ? 'success' : 'warning'}
                  />
                </p>
              </div>

              {order.trackingNumber && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm font-medium text-blue-700">Tracking Number</p>
                  <p className="text-lg font-bold text-blue-900">{order.trackingNumber}</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};