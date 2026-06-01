import React from 'react';
import { AuthProvider, CartProvider } from './context';
import { AppRoutes } from './routes';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </AuthProvider>
  );
};

export default App;