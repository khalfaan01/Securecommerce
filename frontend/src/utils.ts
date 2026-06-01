// =============================================
// Formatting Utilities
// =============================================

/**
 * Image URL utilities for handling external image sources
 */

export const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,' + btoa(`
<svg width="600" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#e2e8f0"/>
  <g transform="translate(300,300)">
    <circle r="50" fill="#cbd5e1"/>
    <path d="M-30,10 L-15,-20 L0,10 L15,-20 L30,10" fill="#94a3b8"/>
    <circle cx="-15" cy="-5" r="8" fill="#64748b"/>
    <circle cx="15" cy="-5" r="8" fill="#64748b"/>
  </g>
  <text x="300" y="380" font-family="Arial" font-size="20" fill="#94a3b8" text-anchor="middle">Product Image</text>
</svg>
`);

// Updated getImageUrl with fallback
export const getImageUrl = (url: string | undefined, seed?: string): string => {
  if (!url) {
    return PLACEHOLDER_IMAGE;
  }
  // If it's picsum.photos, use our proxy or fallback
  if (url.includes('picsum.photos')) {
    return PLACEHOLDER_IMAGE;
  }
  return url;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date to locale string
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  
  return new Date(date).toLocaleDateString('en-US', options || defaultOptions);
}

/**
 * Format datetime to locale string
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// =============================================
// Color Utilities for Charts
// =============================================

export const CHART_COLORS = {
  primary: '#3B82F6',
  secondary: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#8B5CF6',
};

export const SEVERITY_COLORS = {
  low: '#3B82F6',
  medium: '#F59E0B',
  high: '#F97316',
  critical: '#EF4444',
};

export const STATUS_COLORS = {
  pending: '#F59E0B',
  confirmed: '#3B82F6',
  processing: '#8B5CF6',
  shipped: '#10B981',
  delivered: '#059669',
  cancelled: '#EF4444',
  flagged: '#EC4899',
  rejected: '#DC2626',
};

// =============================================
// Constants
// =============================================

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  flagged: 'Flagged for Review',
  rejected: 'Rejected',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  refunded: 'Refunded',
};

export const ROLE_LABELS: Record<string, string> = {
  customer: 'Customer',
  admin: 'Admin',
  auditor: 'Auditor',
};

export const FRAUD_RISK_LABELS: Record<string, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
};

// =============================================
// Validation Utilities
// =============================================

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('One uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('One lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('One number');
  if (!/[!@#$%^&*]/.test(password)) errors.push('One special character');
  
  return { valid: errors.length === 0, errors };
}

export function isValidZipCode(zipCode: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zipCode);
}

// =============================================
// Navigation Utilities
// =============================================

export function getDashboardPath(role: string): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'auditor':
      return '/security';
    default:
      return '/shop';
  }
}

export function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-red-100 text-red-800';
    case 'auditor':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
}

/**
 * Handle image loading errors with retry logic
 */
export const handleImageError = (
  event: React.SyntheticEvent<HTMLImageElement, Event>,
  fallbackSrc?: string
) => {
  const img = event.target as HTMLImageElement;
  
  // Prevent infinite error loops
  img.onerror = null;
  
  // Try loading without HTTPS first (some CDNs have cert issues in Docker)
  if (img.src.startsWith('https://picsum.photos')) {
    img.src = img.src.replace('https://', 'http://');
    return;
  }
  
  // Use fallback or a generic placeholder
  if (fallbackSrc) {
    img.src = fallbackSrc;
  } else {
    // Inline SVG placeholder
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyMCIgZmlsbD0iIzliYTFhNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIE5vdCBBdmFpbGFibGU8L3RleHQ+PC9zdmc+';
  }
};