import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "error" | "success" | "info";
type ToastItem = { id: number; message: string; tone: Tone };

type ToastApi = { push: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastApi>({ push: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const DISMISS_MS = 6000;

/**
 * Replaces `alert()` for user-facing failures (docs/plan.md F16): errors stay
 * inside the app shell, are announced to screen readers, and do not block the
 * reel animation the way a modal alert does.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = "error") => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="uo-toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`uo-toast is-${item.tone}`}>
            <span className="uo-toast-text">{item.message}</span>
            <button
              type="button"
              className="uo-toast-close"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
