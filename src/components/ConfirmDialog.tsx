import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Accessible replacement for `window.confirm` (docs/plan.md F16): focus moves
 * to the confirm button on open, Escape cancels, focus is restored afterwards.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="uo-dialog-backdrop" onClick={onCancel}>
      <div
        className="uo-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="uo-confirm-title"
        aria-describedby="uo-confirm-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="uo-confirm-title" className="uo-dialog-title">
          {title}
        </h2>
        <p id="uo-confirm-body" className="uo-dialog-body">
          {message}
        </p>
        <div className="uo-dialog-actions">
          <button type="button" className="uo-btn uo-btn-ghost uo-btn-sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className="uo-btn uo-btn-primary uo-btn-sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
