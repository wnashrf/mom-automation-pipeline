import { createContext, useContext } from 'react';

/**
 * Toast API context. Lives in its own (non-component) module so the
 * react-refresh ESLint rule stays happy: ToastProvider.jsx exports only a component.
 *
 * Value shape (provided by ToastProvider, referentially stable):
 *   { success(message, opts), info(message, opts), error(message, opts), dismiss(id) }
 *   opts: { title?, action?: { label, onAction } }
 * Each show function returns the new toast id.
 */
export const ToastContext = createContext(null);

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast() must be used inside <ToastProvider>.');
  }
  return api;
}
