import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout';
import { AdminLayout, Sidebar } from '../components/layout';
import { Card, Button, Input, Badge, StatusBadge, Modal, Table } from '../components/ui';
import { Product, Category, Order, User, OrderStatus, UserRole } from '../types';
import api from '../api';

// =============================================
// Admin Sidebar
// =============================================

const AdminSidebar: React.FC = () => {
  const items = [
    { 
      label: 'Dashboard', 
      path: '/admin',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h2" />
        </svg>
      ),
    },
    { 
      label: 'Products', 
      path: '/admin/products',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    { 
      label: 'Categories', 
      path: '/admin/categories',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
    },
    { 
      label: 'Orders', 
      path: '/admin/orders',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    { 
      label: 'Users', 
      path: '/admin/users',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
    },
  ];

  return <Sidebar items={items} title="Admin Panel" />;
};

// =============================================
// Admin Dashboard Page
// =============================================

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [usersRes, ordersRes, productsRes, analyticsRes] = await Promise.all([
        api.get<any>('/users/stats'),
        api.get<any>('/orders/admin/all?limit=5'),
        api.get<any>('/products?limit=5'),
        api.get<any>('/analytics/summary?period=7d'),
      ]);

      setStats({
        users: usersRes.data,
        recentOrders: ordersRes.data,
        recentProducts: productsRes.data || [],
        analytics: analyticsRes.data,
      });
    } catch (error) {
      setError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout sidebar={<AdminSidebar />}>
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
    <AdminLayout sidebar={<AdminSidebar />}>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Total Users</p>
            <p className="text-3xl font-bold text-gray-900">{stats?.users?.totalUsers || 0}</p>
            <p className="text-xs text-green-600">+{stats?.users?.newUsersLast30Days || 0} this month</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Active Users</p>
            <p className="text-3xl font-bold text-gray-900">{stats?.users?.activeUsers || 0}</p>
            <p className="text-xs text-blue-600">{stats?.users?.mfaAdoptionRate}% MFA enabled</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Total Revenue (7d)</p>
            <p className="text-3xl font-bold text-gray-900">
              ${(stats?.analytics?.totalRevenue || 0).toFixed(2)}
            </p>
            <p className="text-xs text-green-600">{stats?.analytics?.totalOrders || 0} orders</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Avg Order Value</p>
            <p className="text-3xl font-bold text-gray-900">
              ${(stats?.analytics?.averageOrderValue || 0).toFixed(2)}
            </p>
            <p className="text-xs text-blue-600">7-day period</p>
          </div>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card title="Recent Orders" className="mb-8">
        <Table
          columns={[
            { key: 'orderNumber', label: 'Order #' },
            { key: 'total', label: 'Total', render: (order: any) => `$${order.total.toFixed(2)}` },
            { 
              key: 'status', 
              label: 'Status', 
              render: (order: any) => <StatusBadge status={order.status} /> 
            },
            { 
              key: 'createdAt', 
              label: 'Date', 
              render: (order: any) => new Date(order.createdAt).toLocaleDateString() 
            },
          ]}
          data={Array.isArray(stats?.recentOrders) ? stats.recentOrders : (stats?.recentOrders?.orders || [])}
          emptyMessage="No orders found"
        />
      </Card>

      {/* Users by Role */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Users by Role">
          {stats?.users?.usersByRole && Object.entries(stats.users.usersByRole).map(([role, count]: any) => (
            <div key={role} className="flex justify-between py-2 border-b last:border-0">
              <span className="capitalize">{role}</span>
              <Badge text={count.toString()} variant="info" />
            </div>
          ))}
        </Card>
        <Card title="Fraud Stats (7d)">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Flagged Orders</span>
              <Badge text={stats?.analytics?.fraudStats?.totalFlagged || 0} variant="danger" />
            </div>
            <div className="flex justify-between">
              <span>Rejected Orders</span>
              <Badge text={stats?.analytics?.fraudStats?.totalRejected || 0} variant="danger" />
            </div>
            <div className="flex justify-between">
              <span>Avg Risk Score</span>
              <span className="font-semibold">
                {stats?.analytics?.fraudStats?.averageRiskScore?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
};

// =============================================
// Product Management Page
// =============================================

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    categoryId: '',
    inventory: 0,
    sku: '',
    images: [''],
    tags: [''],
    isActive: true,
  });

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await api.getProducts({ limit: 50 });
      // response.data is Product[] directly
      const productsData = response.data as Product[];
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await api.getCategories();
      // response.data is Category[] directly
      const categoriesData = response.data as Category[];
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleSave = async () => {
    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct._id, formData);
      } else {
        await api.createProduct(formData);
      }
      setShowModal(false);
      loadProducts();
      resetForm();
    } catch (error: any) {
      console.error('Failed to save product:', error);
    }
  };

  const handleDelete = async (productId: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await api.deleteProduct(productId);
        loadProducts();
      } catch (error) {
        console.error('Failed to delete product:', error);
      }
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      description: '',
      price: 0,
      categoryId: '',
      inventory: 0,
      sku: '',
      images: [''],
      tags: [''],
      isActive: true,
    });
  };

  return (
    <AdminLayout sidebar={<AdminSidebar />}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Products</h1>
        <Button onClick={() => setShowModal(true)}>Add Product</Button>
      </div>

      <Card>
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'price', label: 'Price', render: (p: Product) => `$${p.price.toFixed(2)}` },
            { key: 'inventory', label: 'Stock' },
            { key: 'sku', label: 'SKU' },
            { 
              key: 'isActive', 
              label: 'Status', 
              render: (p: Product) => <Badge text={p.isActive ? 'Active' : 'Inactive'} variant={p.isActive ? 'success' : 'danger'} /> 
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (p: Product) => (
                <div className="flex space-x-2">
                  <Button size="sm" variant="secondary" onClick={() => { setEditingProduct(p); setFormData({ ...p, categoryId: typeof p.categoryId === 'string' ? p.categoryId : (p.categoryId as Category)._id }); setShowModal(true); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(p._id)}>
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={products}
          isLoading={isLoading}
        />
      </Card>

      {/* Product Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Price" type="number" value={formData.price.toString()} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })} />
            <Input label="Inventory" type="number" value={formData.inventory.toString()} onChange={(e) => setFormData({ ...formData, inventory: parseInt(e.target.value) })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat._id} value={cat._id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <Input label="SKU" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} />
        </div>
      </Modal>
    </AdminLayout>
  );
};

// =============================================
// Order Management Page
// =============================================

export const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const loadOrders = async () => {
    try {
      const params: any = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const response = await api.getAllOrders(params);
      // response.data is Order[] directly
      const ordersData = response.data as Order[];
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await api.updateOrderStatus(orderId, newStatus);
      loadOrders();
    } catch (error) {
      console.error('Failed to update order:', error);
    }
  };

  return (
    <AdminLayout sidebar={<AdminSidebar />}>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Order Management</h1>

      <div className="mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Orders</option>
          {Object.values(OrderStatus).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      <Card>
        <Table
          columns={[
            { key: 'orderNumber', label: 'Order #' },
            { 
              key: 'user', 
              label: 'Customer', 
              render: (order: any) => order.userId?.email || order.userId 
            },
            { 
              key: 'total', 
              label: 'Total', 
              render: (order: Order) => `$${order.total.toFixed(2)}` 
            },
            { 
              key: 'status', 
              label: 'Status', 
              render: (order: Order) => <StatusBadge status={order.status} /> 
            },
            { 
              key: 'fraudCheck', 
              label: 'Fraud', 
              render: (order: Order) => order.fraudCheck?.isFraudulent ? 
                <Badge text="Flagged" variant="danger" /> : 
                <Badge text="Clean" variant="success" />
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (order: Order) => (
                <select
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                  value={order.status}
                  onChange={(e) => handleStatusUpdate(order._id, e.target.value)}
                >
                  {Object.values(OrderStatus).map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              ),
            },
          ]}
          data={orders}
          isLoading={isLoading}
        />
      </Card>
    </AdminLayout>
  );
};

// =============================================
// User Management Page
// =============================================

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get<any>('/users?limit=50');
      // response.data could be { users: User[] } or User[] directly
      const data = response.data;
      setUsers(Array.isArray(data) ? data : (data?.users || []));
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await api.put(`/users/${userId}`, { isActive: !currentStatus });
      loadUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  return (
    <AdminLayout sidebar={<AdminSidebar />}>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">User Management</h1>

      <Card>
        <Table
          columns={[
            { key: 'email', label: 'Email' },
            { key: 'firstName', label: 'First Name' },
            { key: 'lastName', label: 'Last Name' },
            { 
              key: 'role', 
              label: 'Role',
              render: (user: User) => <Badge text={user.role} variant={user.role === 'admin' ? 'danger' : 'info'} />
            },
            { 
              key: 'mfaEnabled', 
              label: 'MFA',
              render: (user: User) => <Badge text={user.mfaEnabled ? 'Enabled' : 'Disabled'} variant={user.mfaEnabled ? 'success' : 'warning'} />
            },
            { 
              key: 'isActive', 
              label: 'Status',
              render: (user: User) => (
                <Button 
                  size="sm" 
                  variant={user.isActive ? 'success' : 'danger'}
                  onClick={() => handleToggleActive(user.id, user.isActive)}
                >
                  {user.isActive ? 'Active' : 'Inactive'}
                </Button>
              )
            },
          ]}
          data={users}
          isLoading={isLoading}
        />
      </Card>
    </AdminLayout>
  );
};