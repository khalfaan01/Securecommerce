import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Badge } from './ui';
import { Product } from '../types';
import { formatCurrency, handleImageError, getImageUrl, PLACEHOLDER_IMAGE } from '../utils';

// =============================================
// Product Card Component
// =============================================

interface ProductCardProps {
  product: Product;
  onAddToCart?: (productId: string) => void;
  viewMode?: 'grid' | 'list';
}

export const ProductCard: React.FC<ProductCardProps> = ({ 
  product, 
  onAddToCart,
  viewMode = 'grid' 
}) => {
  const [isAdding, setIsAdding] = React.useState(false);

  const handleAddToCart = async () => {
    if (!onAddToCart) return;
    setIsAdding(true);
    try {
      await onAddToCart(product._id);
    } finally {
      setIsAdding(false);
    }
  };

  if (viewMode === 'list') {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 flex items-center hover:shadow-lg transition-shadow">
        <div className="h-24 w-24 bg-gray-200 rounded flex-shrink-0">
          {product.images[0] ? (
            <img 
              src={getImageUrl(product.images[0], product.name)} 
              alt={product.name} 
              className="w-full h-full object-cover rounded" 
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = PLACEHOLDER_IMAGE;
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
        </div>
        
        <div className="ml-4 flex-1">
          <Link to={`/product/${product._id}`}>
            <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">{product.name}</h3>
          </Link>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{product.description}</p>
          <div className="flex items-center mt-2 space-x-2">
            <div className="flex items-center">
              <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="ml-1 text-sm">{product.averageRating.toFixed(1)}</span>
            </div>
            {!product.inStock && <Badge text="Out of Stock" variant="danger" />}
          </div>
        </div>

        <div className="ml-4 text-right">
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(product.price)}</p>
          {product.compareAtPrice && (
            <p className="text-sm text-gray-500 line-through">{formatCurrency(product.compareAtPrice)}</p>
          )}
          <Button
            onClick={handleAddToCart}
            disabled={!product.inStock}
            isLoading={isAdding}
            size="sm"
            className="mt-2"
          >
            Add to Cart
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      <Link to={`/product/${product._id}`}>
        <div className="relative h-48 bg-gray-200">
          {product.images[0] ? (
            <img 
              src={getImageUrl(product.images[0], product.name)} 
              alt={product.name} 
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = PLACEHOLDER_IMAGE;
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {product.discountPercentage > 0 && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
              -{product.discountPercentage}%
            </div>
          )}
          {!product.inStock && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <span className="text-white font-bold text-lg">Out of Stock</span>
            </div>
          )}
        </div>
      </Link>
      
      <div className="p-4">
        <Link to={`/product/${product._id}`}>
          <h3 className="text-sm font-semibold text-gray-900 hover:text-blue-600 line-clamp-2 mb-2">
            {product.name}
          </h3>
        </Link>

        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xl font-bold text-gray-900">{formatCurrency(product.price)}</span>
            {product.compareAtPrice && (
              <span className="ml-1 text-xs text-gray-500 line-through">
                {formatCurrency(product.compareAtPrice)}
              </span>
            )}
          </div>
          <div className="flex items-center">
            <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="ml-1 text-xs text-gray-600">{product.averageRating}</span>
            <span className="text-xs text-gray-400 ml-1">({product.reviewCount})</span>
          </div>
        </div>

        <Button
          onClick={handleAddToCart}
          disabled={!product.inStock}
          isLoading={isAdding}
          className="w-full"
          size="sm"
        >
          {product.inStock ? 'Add to Cart' : 'Out of Stock'}
        </Button>
      </div>
    </div>
  );
};

// =============================================
// Product Grid Component
// =============================================

interface ProductGridProps {
  products: Product[];
  onAddToCart?: (productId: string) => void;
  isLoading?: boolean;
  viewMode?: 'grid' | 'list';
  emptyMessage?: string;
}

export const ProductGrid: React.FC<ProductGridProps> = ({ 
  products, 
  onAddToCart, 
  isLoading = false,
  viewMode = 'grid',
  emptyMessage = 'No products found'
}) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="mt-4 text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        {products.map(product => (
          <ProductCard key={product._id} product={product} onAddToCart={onAddToCart} viewMode="list" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map(product => (
        <ProductCard key={product._id} product={product} onAddToCart={onAddToCart} />
      ))}
    </div>
  );
};

// =============================================
// Product Detail Component
// =============================================

interface ProductDetailProps {
  product: Product;
  onAddToCart?: (productId: string, quantity: number) => void;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({ product, onAddToCart }) => {
  const [quantity, setQuantity] = React.useState(1);
  const [selectedImage, setSelectedImage] = React.useState(0);
  const [isAdding, setIsAdding] = React.useState(false);

  const handleAddToCart = async () => {
    if (!onAddToCart) return;
    setIsAdding(true);
    try {
      await onAddToCart(product._id, quantity);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Image Gallery */}
      <div>
        <div className="h-96 bg-gray-200 rounded-lg overflow-hidden mb-4">
          {product.images[selectedImage] ? (
            <img 
              src={getImageUrl(product.images[selectedImage], product.name)} 
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = PLACEHOLDER_IMAGE;
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <svg className="h-24 w-24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        {product.images.length > 1 && (
          <div className="flex space-x-2">
            {product.images.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedImage(index)}
                className={`h-20 w-20 rounded-md overflow-hidden border-2 ${
                  selectedImage === index ? 'border-blue-500' : 'border-transparent'
                }`}
              >
                <img 
                  src={getImageUrl(image, `${product.name} ${index + 1}`)} 
                  alt={`${product.name} ${index + 1}`} 
                  className="w-full h-full object-cover" 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = PLACEHOLDER_IMAGE;
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product Info */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
        
        <div className="flex items-center mt-4">
          <div className="flex items-center">
            {[1, 2, 3, 4, 5].map(star => (
              <svg key={star} className={`h-5 w-5 ${star <= product.averageRating ? 'text-yellow-400' : 'text-gray-300'}`} 
                fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <span className="ml-2 text-gray-600">({product.reviewCount} reviews)</span>
        </div>

        <div className="mt-6">
          <span className="text-4xl font-bold text-gray-900">{formatCurrency(product.price)}</span>
          {product.compareAtPrice && (
            <span className="ml-3 text-xl text-gray-500 line-through">
              {formatCurrency(product.compareAtPrice)}
            </span>
          )}
        </div>

        <p className="mt-6 text-gray-600 leading-relaxed">{product.description}</p>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Availability:</span>
            <Badge 
              text={product.inStock ? `In Stock (${product.inventory})` : 'Out of Stock'}
              variant={product.inStock ? 'success' : 'danger'}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center space-x-4">
          <div className="flex items-center border border-gray-300 rounded-md">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="px-3 py-2 hover:bg-gray-100"
            >
              -
            </button>
            <span className="px-4 py-2 border-x border-gray-300 min-w-[50px] text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(q => Math.min(product.inventory, q + 1))}
              className="px-3 py-2 hover:bg-gray-100"
            >
              +
            </button>
          </div>
          <Button
            onClick={handleAddToCart}
            disabled={!product.inStock}
            isLoading={isAdding}
            size="lg"
          >
            Add to Cart - {formatCurrency(product.price * quantity)}
          </Button>
        </div>

        <div className="mt-6 space-y-2">
          <div className="flex items-center text-sm text-gray-500">
            <svg className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            AI-Powered Fraud Protection
          </div>
          <div className="flex items-center text-sm text-gray-500">
            <svg className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Secure Checkout
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================
// Product Filter Component
// =============================================

interface ProductFilterProps {
  categories: Array<{ _id: string; name: string }>;
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  priceRange: { min: string; max: string };
  onPriceRangeChange: (range: { min: string; max: string }) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
}

export const ProductFilter: React.FC<ProductFilterProps> = ({
  categories,
  selectedCategory,
  onCategoryChange,
  priceRange,
  onPriceRangeChange,
  onSearch,
  searchQuery,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      {/* Search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          />
          <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Categories */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat._id} value={cat._id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Price Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
        <div className="flex space-x-2">
          <input
            type="number"
            value={priceRange.min}
            onChange={(e) => onPriceRangeChange({ ...priceRange, min: e.target.value })}
            placeholder="Min"
            className="w-1/2 px-3 py-2 border border-gray-300 rounded-md"
          />
          <input
            type="number"
            value={priceRange.max}
            onChange={(e) => onPriceRangeChange({ ...priceRange, max: e.target.value })}
            placeholder="Max"
            className="w-1/2 px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
    </div>
  );
};