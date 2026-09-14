import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastTone = "info" | "success" | "warning" | "danger";

interface ToastItem {
  id: string;
  message: string;
  title?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { message: string; title?: string; tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { border: string; icon: string; Icon: React.ElementType }> = {
  info: { border: "border-info-border", icon: "text-info", Icon: Info },
  success: { border: "border-success-border", icon: "text-success", Icon: CheckCircle2 },
  warning: { border: "border-warning-border", icon: "text-warning", Icon: AlertCircle },
  danger: { border: "border-danger-border", icon: "text-danger", Icon: AlertCircle },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ message, title, tone = "info" }: { message: string; title?: string; tone?: ToastTone }) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, message, title, tone }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => {
          const style = TONE_STYLES[item.tone];
          const Icon = style.Icon;
          return (
            <div
              key={item.id}
              className={[
                "pointer-events-auto rounded-ui-lg border bg-surface px-4 py-3 shadow-overlay",
                style.border,
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${style.icon}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {item.title && (
                    <p className="text-body font-medium text-text-base">{item.title}</p>
                  )}
                  <p className={`text-body text-text-muted ${item.title ? "mt-0.5" : ""}`}>
                    {item.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="rounded-ui p-1 text-text-subtle hover:bg-surface-subtle hover:text-text-base"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
