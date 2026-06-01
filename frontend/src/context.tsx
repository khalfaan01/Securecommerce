import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Cart, UserRole } from './types';
import api from './api';
import axios from 'axios';

// =============================================
// Auth Context
// =============================================

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, mfaToken?: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
useEffect(() => {
  const initAuth = async () => {
    const token = localStorage.getItem('accessToken');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        // Verify token is still valid
        await api.getProfile();
      } catch (error: any) {
        // If 401, try refreshing the token using the api instance
        if (error?.response?.status === 401) {
          try {
            // Use the api instance which already has the correct base URL
            const refreshResponse = await api.refreshToken();
            const newToken = refreshResponse.data?.accessToken;
            
            if (newToken) {
              localStorage.setItem('accessToken', newToken);
              // Retry getting profile with the new token - api client will use the new token
              await api.getProfile();
              setIsLoading(false);
              return;
            }
          } catch (refreshError) {
            console.log('Token refresh failed');
          }
        }
        // If refresh fails or error is not 401, clear state
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        setUser(null);
      }
    }
    setIsLoading(false);
  };
  
  initAuth();
}, []);

  const login = async (email: string, password: string, mfaToken?: string) => {
    const response = await api.login(email, password, mfaToken);
    const { user: userData, accessToken } = response.data!;
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const register = async (firstName: string, lastName: string, email: string, password: string) => {
    const response = await api.register(firstName, lastName, email, password);
    const { user: userData, accessToken } = response.data!;
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      // Even if API call fails, clear local state
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const hasRole = useCallback((role: UserRole): boolean => {
    return user?.role === role;
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      updateUser,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// =============================================
// Cart Context
// =============================================

interface CartContextType {
  cart: Cart | null;
  isLoading: boolean;
  addToCart: (productId: string, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  cartItemCount: number;
  cartTotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load cart on mount
  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {
    try {
      const response = await api.getCart();
      setCart(response.data as Cart);
    } catch (error) {
      console.error('Failed to load cart:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addToCart = async (productId: string, quantity: number = 1) => {
    const response = await api.addToCart(productId, quantity);
    setCart(response.data as Cart);
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity === 0) {
      await removeItem(itemId);
      return;
    }
    const response = await api.updateCartItem(itemId, quantity);
    setCart(response.data as Cart);
  };

  const removeItem = async (itemId: string) => {
    const response = await api.removeCartItem(itemId);
    setCart(response.data as Cart);
  };

  const clearCart = async () => {
    await api.clearCart();
    setCart(null);
  };

  const cartItemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const cartTotal = cart?.totalAmount || 0;

  return (
    <CartContext.Provider value={{
      cart,
      isLoading,
      addToCart,
      updateQuantity,
      removeItem,
      clearCart,
      cartItemCount,
      cartTotal,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};