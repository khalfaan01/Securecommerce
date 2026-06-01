import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useCart } from '../context';
import { UserRole } from '../types';

// =============================================
// Navbar Component
// =============================================

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { cartItemCount } = useCart();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="bg-gray-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="ml-2 text-xl font-bold">Secure<span className="text-blue-500">Commerce</span></span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <Link to="/shop" className="px-3 py-2 rounded-md hover:bg-gray-800 transition-colors">
              Shop
            </Link>
            
            {isAuthenticated && user?.role === UserRole.CUSTOMER && (
              <Link to="/orders" className="px-3 py-2 rounded-md hover:bg-gray-800 transition-colors">
                My Orders
              </Link>
            )}
            
            {(user?.role === UserRole.ADMIN || user?.role === UserRole.AUDITOR) && (
              <Link to="/admin" className="px-3 py-2 rounded-md hover:bg-gray-800 transition-colors">
                Admin Panel
              </Link>
            )}
            
            {(user?.role === UserRole.ADMIN || user?.role === UserRole.AUDITOR) && (
              <Link to="/security" className="px-3 py-2 rounded-md hover:bg-gray-800 transition-colors">
                Security
              </Link>
            )}
          </div>

          {/* Right side: Cart + User Menu */}
          <div className="flex items-center space-x-4">
            {/* Cart Icon */}
            <Link to="/cart" className="relative p-2 hover:bg-gray-800 rounded-md transition-colors">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              {cartItemCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 
                  text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 
                  bg-blue-600 rounded-full">
                  {cartItemCount}
                </span>
              )}
            </Link>

            {/* User Menu */}
            {isAuthenticated ? (
              <div className="relative group">
                <button className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-gray-800">
                  <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold">{user?.firstName[0]}{user?.lastName[0]}</span>
                  </div>
                  <span className="hidden lg:block">{user?.firstName}</span>
                </button>
                
                <div className="absolute right-0 w-48 mt-2 py-2 bg-white rounded-md shadow-xl 
                  opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <Link to="/profile" className="block px-4 py-2 text-gray-800 hover:bg-gray-100">
                    Profile
                  </Link>
                  <button 
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/login" className="px-4 py-2 text-sm font-medium hover:bg-gray-800 rounded-md">
                  Login
                </Link>
                <Link to="/register" className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 rounded-md">
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md hover:bg-gray-800"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link to="/shop" className="block px-3 py-2 rounded-md hover:bg-gray-800">Shop</Link>
            {isAuthenticated && <Link to="/orders" className="block px-3 py-2 rounded-md hover:bg-gray-800">Orders</Link>}
            {(user?.role === UserRole.ADMIN || user?.role === UserRole.AUDITOR) && (
              <>
                <Link to="/admin" className="block px-3 py-2 rounded-md hover:bg-gray-800">Admin</Link>
                <Link to="/security" className="block px-3 py-2 rounded-md hover:bg-gray-800">Security</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

// =============================================
// Footer Component
// =============================================

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">SecureCommerce</h3>
            <p className="text-sm">Security-first e-commerce platform with AI-powered fraud detection.</p>
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/shop" className="hover:text-white">Shop</Link></li>
              <li><Link to="/cart" className="hover:text-white">Cart</Link></li>
              <li><Link to="/orders" className="hover:text-white">Orders</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold mb-4">Security</h4>
            <ul className="space-y-2 text-sm">
              <li><span className="flex items-center">
                <span className="h-2 w-2 bg-green-500 rounded-full mr-2"></span>
                SSL Encrypted
              </span></li>
              <li><span className="flex items-center">
                <span className="h-2 w-2 bg-green-500 rounded-full mr-2"></span>
                PCI Compliant
              </span></li>
              <li><span className="flex items-center">
                <span className="h-2 w-2 bg-green-500 rounded-full mr-2"></span>
                AI Fraud Protection
              </span></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm">
          <p>&copy; 2024 SecureCommerce. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

// =============================================
// Layout Wrapper
// =============================================

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
};

// =============================================
// Sidebar (for Admin/Security pages)
// =============================================

interface SidebarProps {
  items: Array<{
    label: string;
    path: string;
    icon?: React.ReactNode;
  }>;
  title: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ items, title }) => {
  const location = useLocation();

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-blue-400">{title}</h2>
      </div>
      <nav className="mt-2">
        {items.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center px-6 py-3 text-sm transition-colors ${
              location.pathname === item.path
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {item.icon && <span className="mr-3">{item.icon}</span>}
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export const AdminLayout: React.FC<{ children: React.ReactNode; sidebar: React.ReactNode }> = ({ 
  children, 
  sidebar 
}) => {
  return (
    <div className="flex">
      {sidebar}
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        {children}
      </div>
    </div>
  );
};