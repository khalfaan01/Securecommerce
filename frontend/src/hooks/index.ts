import { useState, useEffect, useCallback } from 'react';
import api from '../api';

// =============================================
// Custom Hooks
// =============================================

/**
 * Hook for fetching data with loading/error states
 * Handles ApiResponse wrapper structure (data.data, data.meta)
 */
export function useApiData<T>(
  fetcher: () => Promise<any>,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetcher();
      
      // Handle ApiResponse wrapper: { success: true, data: [...], meta: {...} }
      if (response && typeof response === 'object' && 'data' in response) {
        // Check if response has a meta property (paginated responses)
        if (response.meta) {
          setMeta(response.meta);
        }
        // Set the actual data (could be array, object, or primitive)
        setData(response.data as T);
      } else {
        // Fallback: response might already be unwrapped
        setData(response as T);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error 
        || error.response?.data?.message 
        || error.message 
        || 'An error occurred';
      setError(errorMessage);
      console.error('API Error:', errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, meta, isLoading, error, refetch: fetchData };
}

/**
 * Hook for debouncing values (search inputs)
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for local storage state
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading localStorage:', error);
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error setting localStorage:', error);
    }
  };

  return [storedValue, setValue];
}

/**
 * Hook for auto-refreshing data at intervals
 */
export function useAutoRefresh(
  callback: () => void,
  intervalMs: number = 10000,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(callback, intervalMs);
    return () => clearInterval(interval);
  }, [callback, intervalMs, enabled]);
}

/**
 * Hook for pagination state
 */
export function usePagination(initialPage: number = 1, initialLimit: number = 20) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  const nextPage = () => setPage(p => Math.min(p + 1, totalPages));
  const previousPage = () => setPage(p => Math.max(1, p - 1));
  const goToPage = (pageNum: number) => setPage(Math.min(Math.max(1, pageNum), totalPages));

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    setPage,
    setLimit,
    setTotal,
    nextPage,
    previousPage,
    goToPage,
  };
}

/**
 * Hook for form handling
 */
export function useForm<T extends Record<string, any>>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof T) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setValues({ ...values, [field]: e.target.value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  const setFieldValue = (field: keyof T, value: any) => {
    setValues({ ...values, [field]: value });
  };

  const resetForm = () => {
    setValues(initialValues);
    setErrors({});
  };

  return {
    values,
    errors,
    isSubmitting,
    setValues,
    setErrors,
    setIsSubmitting,
    handleChange,
    setFieldValue,
    resetForm,
  };
}