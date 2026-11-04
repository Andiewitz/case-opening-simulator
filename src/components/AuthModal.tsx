import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { signInWithPassword, signUp, confirmSignUp } from "../services/auth";

// In-app authentication (direct Cognito USER_PASSWORD_AUTH calls instead of
// the hosted UI) so sign-in works on any origin, with the app's own styling.
// This is the only sign-in path — the hosted-UI callback route was removed
// (docs/plan.md F15).
export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "confirm">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    // Focus after paint so the input exists for the current mode.
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signInWithPassword(email.trim(), password);
        onClose();
      } else if (mode === "signup") {
        await signUp(email.trim(), password);
        setMode("confirm");
        setError("Check your email for the confirmation code.");
      } else {
        await confirmSignUp(email.trim(), code.trim());
        await signInWithPassword(email.trim(), password);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "signin" ? "Welcome back" : mode === "signup" ? "Create account" : "Confirm sign-up";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="uo-modal" role="dialog" aria-modal="true" aria-labelledby="uo-auth-title">
        <button
          onClick={onClose}
          className="uo-icon-btn absolute right-3 top-3"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id="uo-auth-title" className="uo-modal-title">
          {title}
        </h2>
        <p className="uo-modal-sub">
          {mode === "signin" && "Sign in to open cases and manage your inventory."}
          {mode === "signup" && "Virtual balance only. No real money required."}
          {mode === "confirm" && "Enter the code we emailed to " + email.trim() + "."}
        </p>

        <form onSubmit={submit} className="uo-form">
          {mode !== "confirm" && (
            <input
              ref={firstFieldRef}
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="uo-field"
            />
          )}
          {mode !== "confirm" && (
            <input
              type="password"
              required
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="uo-field"
            />
          )}
          {mode === "confirm" && (
            <input
              ref={firstFieldRef}
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Confirmation code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="uo-field"
            />
          )}

          {error && (
            <p
              role="status"
              className={"uo-form-msg " + (error.startsWith("Check your email") ? "is-ok" : "is-error")}
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="uo-btn uo-btn-primary uo-btn-block">
            {busy ? "Working…" : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Confirm & Sign In"}
          </button>
        </form>

        <div className="uo-modal-note">
          {mode === "signin" ? (
            <button onClick={() => { setMode("signup"); setError(null); }}>
              No account yet? Create one
            </button>
          ) : (
            <button onClick={() => { setMode("signin"); setError(null); }}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
