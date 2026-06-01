import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Badge } from './ui';
import { CartItem } from '../types';

// =============================================
// Cart Item Component
// =============================================

interface CartItemProps {
  item: CartItem;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}

export const CartItemRow: React.FC<CartItemProps> = ({ item, onUpdateQuantity, onRemove }) => {
  return (
    <div className="flex items-center py-4 border-b border-gray-200 last:border-0">
      {/* Product Image */}
      <div className="h-20 w-20 flex-shrink-0 bg-gray-200 rounded-md overflow-hidden">
        {item.image ? (
          <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Item Details */}
      <div className="ml-4 flex-1">
        <Link to={`/product/${item.productId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
          {item.name}
        </Link>
        <p className="text-sm text-gray-500">${item.price.toFixed(2)} each</p>
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center border border-gray-300 rounded-md">
          <button
            onClick={() => onUpdateQuantity(item._id, item.quantity - 1)}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-l-md transition-colors"
            disabled={item.quantity <= 1}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="px-3 py-1 text-sm font-medium min-w-[40px] text-center">
            {item.quantity}
          </span>
          <button
            onClick={() => onUpdateQuantity(item._id, item.quantity + 1)}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-r-md transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <p className="text-sm font-semibold w-20 text-right">
          ${(item.price * item.quantity).toFixed(2)}
        </p>

        <button
          onClick={() => onRemove(item._id)}
          className="text-red-400 hover:text-red-600 transition-colors p-1"
          title="Remove item"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// =============================================
// Cart Summary Component
// =============================================

interface CartSummaryProps {
  subtotal: number;
  itemCount: number;
  onCheckout?: () => void;
  isLoading?: boolean;
}

export const CartSummary: React.FC<CartSummaryProps> = ({ 
  subtotal, 
  itemCount, 
  onCheckout,
  isLoading = false 
}) => {
  const shipping = subtotal > 50 ? 0 : 9.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
      
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal ({itemCount} items)</span>
          <span className="font-medium">${subtotal.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Shipping</span>
          <span className="font-medium">
            {shipping === 0 ? (
              <Badge text="FREE" variant="success" />
            ) : (
              `$${shipping.toFixed(2)}`
            )}
          </span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Tax (8%)</span>
          <span className="font-medium">${tax.toFixed(2)}</span>
        </div>

        {subtotal < 50 && (
          <div className="p-2 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-700">
              Add ${(50 - subtotal).toFixed(2)} more for free shipping
            </p>
          </div>
        )}

        <div className="border-t pt-3 flex justify-between">
          <span className="text-base font-bold text-gray-900">Total</span>
          <span className="text-base font-bold text-gray-900">${total.toFixed(2)}</span>
        </div>
      </div>

      {onCheckout && (
        <Button
          onClick={onCheckout}
          className="w-full mt-6"
          size="lg"
          isLoading={isLoading}
        >
          Proceed to Checkout
        </Button>
      )}

      <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-gray-500">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>Secure Checkout</span>
      </div>
    </div>
  );
};

// =============================================
// Checkout Form Component
// =============================================

interface CheckoutFormProps {
  onSubmit: (data: any) => void;
  isLoading?: boolean;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({ onSubmit, isLoading }) => {
  const [step, setStep] = React.useState(1);
  const [formData, setFormData] = React.useState({
    fullName: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    paymentMethod: 'card',
    cardNumber: '',
    expiry: '',
    cvv: '',
    sameAsShipping: true,
    billingFullName: '',
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingZipCode: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const orderData = {
      shippingAddress: {
        fullName: formData.fullName,
        street: formData.street,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        country: formData.country,
        phone: formData.phone,
      },
      billingAddress: formData.sameAsShipping ? {
        fullName: formData.fullName,
        street: formData.street,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        country: formData.country,
      } : {
        fullName: formData.billingFullName,
        street: formData.billingStreet,
        city: formData.billingCity,
        state: formData.billingState,
        zipCode: formData.billingZipCode,
        country: formData.country,
      },
      paymentInfo: {
        method: formData.paymentMethod,
        last4: formData.cardNumber.slice(-4),
      },
    };

    onSubmit(orderData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-center space-x-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {s}
              </div>
              {s < 3 && (
                <div className={`w-16 h-0.5 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-center space-x-16 mt-2">
          <span className="text-xs text-gray-500">Shipping</span>
          <span className="text-xs text-gray-500">Payment</span>
          <span className="text-xs text-gray-500">Review</span>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Shipping Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
              <input type="text" name="street" value={formData.street} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input type="text" name="city" value={formData.city} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
              <input type="text" name="state" value={formData.state} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
              <input type="text" name="zipCode" value={formData.zipCode} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <select name="country" value={formData.country} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="UK">United Kingdom</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep(2)}>Next</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Payment Information</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <div className="flex space-x-4">
              {['card', 'paypal'].map(method => (
                <label key={method} className="flex items-center">
                  <input type="radio" name="paymentMethod" value={method}
                    checked={formData.paymentMethod === method} onChange={handleChange}
                    className="mr-2" />
                  <span className="capitalize">{method}</span>
                </label>
              ))}
            </div>
          </div>
          {formData.paymentMethod === 'card' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                <input type="text" name="cardNumber" value={formData.cardNumber} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="1234 5678 9012 3456" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry</label>
                <input type="text" name="expiry" value={formData.expiry} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="MM/YY" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                <input type="text" name="cvv" value={formData.cvv} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="123" />
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button type="button" onClick={() => setStep(3)}>Review Order</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Review Your Order</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium mb-2">Shipping To:</h4>
            <p className="text-sm">{formData.fullName}</p>
            <p className="text-sm">{formData.street}</p>
            <p className="text-sm">{formData.city}, {formData.state} {formData.zipCode}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium mb-2">Payment Method:</h4>
            <p className="text-sm capitalize">{formData.paymentMethod}</p>
            {formData.cardNumber && (
              <p className="text-sm">Card ending in {formData.cardNumber.slice(-4)}</p>
            )}
          </div>
          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>Back</Button>
            <Button type="submit" isLoading={isLoading}>Place Order</Button>
          </div>
        </div>
      )}
    </form>
  );
};