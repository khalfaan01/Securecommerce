/// <reference types="vite/client" />

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { 
  ApiResponse, 
  AuthResponse, 
  User, 
  Product, 
  Category, 
  Cart, 
  Order,
  AuditLog,
  ThreatAlert,
  FraudAlert,
  AnalyticsSummary 
} from '../types';

// =============================================
// API Client Setup
// =============================================

// Use relative URL so it works with both Vite proxy (dev) and nginx proxy (Docker)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 15000,
      withCredentials: true,
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('accessToken');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Add correlation ID for request tracking
        if (config.headers) {
          config.headers['X-Correlation-ID'] = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        
        // If 401 and not already retried, try refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            if (!this.refreshPromise) {
              this.refreshPromise = this.refreshAccessToken();
            }
            
            const newToken = await this.refreshPromise;
            this.refreshPromise = null;
            
            localStorage.setItem('accessToken', newToken);
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            
            return this.client(originalRequest);
          } catch (refreshError) {
            this.refreshPromise = null;
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(): Promise<string> {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {}, {
        withCredentials: true,
      });
      
      if (!response.data?.data?.accessToken) {
        throw new Error('No access token in refresh response');
      }
      
      return response.data.data.accessToken;
    } catch (error) {
      // Clear invalid tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      throw error;
    }
  }

  // Generic request methods
  async get<T>(url: string, params?: any): Promise<ApiResponse<T>> {
    const response = await this.client.get(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.client.post(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.client.put(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.client.delete(url);
    return response.data;
  }

  // =============================================
  // Auth API
  // =============================================

  async login(email: string, password: string, mfaToken?: string) {
    return this.post<AuthResponse>('/auth/login', { email, password, mfaToken });
  }

  async register(firstName: string, lastName: string, email: string, password: string) {
    return this.post<AuthResponse>('/auth/register', { firstName, lastName, email, password });
  }

  async logout() {
    return this.post('/auth/logout');
  }

  async refreshToken() {
    return this.post<{ accessToken: string }>('/auth/refresh-token');
  }

  async getProfile() {
    return this.get<{ user: User }>('/auth/profile');
  }

  async setupMfa() {
    return this.post<{ secret: string; qrCodeUrl: string; recoveryCodes: string[] }>('/auth/mfa/setup');
  }

  async verifyMfa(token: string) {
    return this.post('/auth/mfa/verify', { token });
  }

  async disableMfa(token: string, password: string) {
    return this.post('/auth/mfa/disable', { token, password });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.post('/auth/change-password', { currentPassword, newPassword });
  }

  async forgotPassword(email: string) {
    return this.post('/auth/forgot-password', { email });
  }

  async resetPassword(token: string, newPassword: string) {
    return this.post('/auth/reset-password', { token, newPassword });
  }

  // =============================================
  // Products API
  // =============================================

  async getProducts(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    tags?: string[];
    sort?: string;
    order?: string;
    inStock?: boolean;
  }) {
    return this.get<Product[]>('/products', params);
  }

  async getProduct(id: string) {
    return this.get<Product>(`/products/${id}`);
  }

  async createProduct(data: Partial<Product>) {
    return this.post<Product>('/products', data);
  }

  async updateProduct(id: string, data: Partial<Product>) {
    return this.put<Product>(`/products/${id}`, data);
  }

  async deleteProduct(id: string) {
    return this.delete(`/products/${id}`);
  }

  // =============================================
  // Categories API
  // =============================================

  async getCategories() {
    return this.get<Category[]>('/categories');
  }

  async createCategory(data: Partial<Category>) {
    return this.post<Category>('/categories', data);
  }

  async updateCategory(id: string, data: Partial<Category>) {
    return this.put<Category>(`/categories/${id}`, data);
  }

  async deleteCategory(id: string) {
    return this.delete(`/categories/${id}`);
  }

  // =============================================
  // Cart API
  // =============================================

  async getCart() {
    return this.get<Cart>('/cart');
  }

  async addToCart(productId: string, quantity: number = 1) {
    return this.post<Cart>('/cart/items', { productId, quantity });
  }

  async updateCartItem(itemId: string, quantity: number) {
    return this.put<Cart>(`/cart/items/${itemId}`, { quantity });
  }

  async removeCartItem(itemId: string) {
    return this.delete(`/cart/items/${itemId}`);
  }

  async clearCart() {
    return this.delete('/cart');
  }

  // =============================================
  // Orders API
  // =============================================

  async createOrder(data: {
    shippingAddress: any;
    billingAddress: any;
    paymentInfo: any;
  }) {
    return this.post<Order>('/orders', data);
  }

  async getMyOrders(params?: { page?: number; status?: string }) {
    return this.get<Order[]>('/orders/my-orders', params);
  }

  async getOrder(id: string) {
    return this.get<Order>(`/orders/${id}`);
  }

  async cancelOrder(id: string) {
    return this.post(`/orders/${id}/cancel`);
  }

  async getAllOrders(params?: { page?: number; status?: string }) {
    return this.get<Order[]>('/orders/admin/all', params);
  }

  async updateOrderStatus(id: string, status: string, trackingNumber?: string) {
    return this.put(`/orders/${id}/status`, { status, trackingNumber });
  }

  // =============================================
  // Security Dashboard API
  // =============================================

  async getAuditLogs(params?: {
    page?: number;
    severity?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  }) {
    return this.get<AuditLog[]>('/audit/logs', params);
  }

  async getThreatAlerts(params?: { severity?: string; isResolved?: boolean }) {
    return this.get<ThreatAlert[]>('/fraud/threats', params);
  }

  async getFraudAlerts(params?: { status?: string; riskLevel?: string }) {
    return this.get<FraudAlert[]>('/fraud/alerts', params);
  }

  async updateFraudAlert(alertId: string, data: { status?: string; resolution?: string }) {
    return this.put(`/fraud/alerts/${alertId}`, data);
  }

  async getAnalytics() {
    return this.get<AnalyticsSummary>('/analytics/summary');
  }

  async getFailedLoginMap() {
    return this.get<{ ipAddresses: Array<{ ip: string; count: number; lastAttempt: string }> }>(
      '/audit/failed-logins'
    );
  }

  async getSystemHealth() {
    return this.get<{
      rateLimiterHits: number;
      activeTokens: number;
      serviceStatus: Record<string, boolean>;
    }>('/analytics/health');
  }
}

// Create singleton instance
const api = new ApiClient();
export default api;