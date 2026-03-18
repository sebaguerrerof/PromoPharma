import { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

let nextId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    // Always log to console for debugging
    const consoleMethod = type === 'error' ? console.error : type === 'info' ? console.info : console.log;
    consoleMethod(`[Toast/${type}]`, message);

    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const styles: Record<ToastType, { bg: string; border: string; text: string; icon: string; accent: string }> = {
    success: { bg: 'bg-white', border: 'border-emerald-100', text: 'text-gray-700', icon: '✓', accent: 'bg-emerald-500' },
    error:   { bg: 'bg-white', border: 'border-red-100',     text: 'text-gray-700', icon: '✕', accent: 'bg-red-500' },
    info:    { bg: 'bg-white', border: 'border-blue-100',    text: 'text-gray-700', icon: 'ℹ', accent: 'bg-blue-500' },
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const s = styles[t.type];
          return (
            <div
              key={t.id}
              className={`${s.bg} ${s.border} border ${s.text} text-xs px-4 py-2.5 rounded-xl
                          shadow-lg shadow-black/5 flex items-center gap-2.5 max-w-xs
                          animate-[slideIn_0.25s_ease-out] overflow-hidden relative`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${s.accent} rounded-full`} />
              <span className="text-[10px] font-bold leading-none">{s.icon}</span>
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
