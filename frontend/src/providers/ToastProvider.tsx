import classNames from 'classnames';
import { AnimatePresence, motion } from 'motion/react';
import { FC, ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import Notification from '@/elements/Notification.tsx';
import { userToastPosition } from '@/lib/schemas/user.ts';
import { Toast, ToastContext, ToastType } from '@/providers/contexts/toastContext.ts';

const toastTimeout = 7500;

const getToastColor = (type: ToastType) => {
  switch (type) {
    case 'success':
      return 'green';
    case 'error':
      return 'red';
    case 'warning':
      return 'yellow';
    default:
      return 'teal';
  }
};

const getToastPositionClasses = (position: z.infer<typeof userToastPosition>) => {
  switch (position) {
    case 'top_left':
      return 'top-4 left-4';
    case 'top_center':
      return 'top-4 left-1/2 -translate-x-1/2';
    case 'top_right':
      return 'top-4 right-4';
    case 'bottom_left':
      return 'bottom-4 left-4';
    case 'bottom_center':
      return 'bottom-4 left-1/2 -translate-x-1/2';
    case 'bottom_right':
      return 'bottom-4 right-4';
  }
};

const getToastPositionInitial = (position: z.infer<typeof userToastPosition>) => {
  switch (position) {
    case 'top_left':
      return { opacity: 0, x: -50, y: 0 };
    case 'top_center':
      return { opacity: 0, x: 0, y: -75 };
    case 'top_right':
      return { opacity: 0, x: 50, y: 0 };
    case 'bottom_left':
      return { opacity: 0, x: -50, y: 0 };
    case 'bottom_center':
      return { opacity: 0, x: 0, y: 75 };
    case 'bottom_right':
      return { opacity: 0, x: 50, y: 0 };
  }
};

const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toastPosition, setToastPosition] = useState<z.infer<typeof userToastPosition>>('bottom_right');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);

  const addToast = useCallback((message: ReactNode, type: ToastType = 'success') => {
    const id = toastId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, toastTimeout);

    return id;
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const contextValue = useMemo(
    () => ({
      toastPosition,
      setToastPosition,
      addToast,
      dismissToast,
    }),
    [toastPosition, setToastPosition, addToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className={classNames('fixed z-999 space-y-2', getToastPositionClasses(toastPosition))}>
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={`toast_${toast.id}`}
              initial={getToastPositionInitial(toastPosition)}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={getToastPositionInitial(toastPosition)}
              transition={{ duration: 0.3 }}
              className='w-72'
            >
              <div className='pt-2'>
                <Notification color={getToastColor(toast.type)} withCloseButton onClose={() => dismissToast(toast.id)}>
                  {toast.message}
                </Notification>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export { useToast } from './contexts/toastContext.ts';
export { ToastProvider };
