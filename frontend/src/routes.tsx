import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context';
import { UserRole } from './types';

// Pages
import { ShopPage, ProductDetailPage, CartPage, CheckoutPage } from './pages/shop';
import { LoginPage, RegisterPage, ForgotPasswordPage } from './pages/auth';
import { OrdersPage, OrderDetailPage } from './pages/orders';
import { ProfilePage } from './pages/profile';
import { AdminDashboard, AdminProducts, AdminOrders, AdminUsers } from './pages/admin';
import { AuditFeed, FailedLoginMap, ThreatAlerts, FraudReviewQueue, SystemHealth } from './pages/security';

// =============================================
// Protected Route Component
// =============================================

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRoles }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <svg className="animate-spin h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// =============================================
// Route Configuration
// =============================================

export const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Navigate to="/shop" replace />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/product/:id" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Authenticated Routes */}
        <Route path="/checkout" element={
          <ProtectedRoute>
            <CheckoutPage />
          </ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute>
            <OrdersPage />
          </ProtectedRoute>
        } />
        <Route path="/orders/:id" element={
          <ProtectedRoute>
            <OrderDetailPage />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.AUDITOR]}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/admin/products" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
            <AdminProducts />
          </ProtectedRoute>
        } />
        <Route path="/admin/orders" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.AUDITOR]}>
            <AdminOrders />
          </ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
            <AdminUsers />
          </ProtectedRoute>
        } />

        {/* Security Dashboard Routes */}
        <Route path="/security" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.AUDITOR]}>
            <AuditFeed />
          </ProtectedRoute>
        } />
        <Route path="/security/failed-logins" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.AUDITOR]}>
            <FailedLoginMap />
          </ProtectedRoute>
        } />
        <Route path="/security/threats" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.AUDITOR]}>
            <ThreatAlerts />
          </ProtectedRoute>
        } />
        <Route path="/security/fraud" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.AUDITOR]}>
            <FraudReviewQueue />
          </ProtectedRoute>
        } />
        <Route path="/security/health" element={
          <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.AUDITOR]}>
            <SystemHealth />
          </ProtectedRoute>
        } />

        {/* 404 */}
        <Route path="*" element={
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
              <p className="text-xl text-gray-600 mb-8">Page not found</p>
              <a href="/shop" className="text-blue-600 hover:text-blue-500">Go to Shop</a>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
};