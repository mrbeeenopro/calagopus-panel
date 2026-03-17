import { createContext, ReactNode, useContext } from 'react';
import { z } from 'zod';
import { userToastPosition } from '@/lib/schemas/user.ts';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: ReactNode;
  type: ToastType;
}

interface ToastContextType {
  toastPosition: z.infer<typeof userToastPosition>;
  setToastPosition: (position: z.infer<typeof userToastPosition>) => void;

  addToast: (message: ReactNode, type?: ToastType) => number;
  dismissToast: (id: number) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
};
