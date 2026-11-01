import { useState } from "react";
import { X } from "lucide-react";
import { signInWithPassword, signUp, confirmSignUp } from "../services/auth";

// In-app authentication (direct Cognito USER_PASSWORD_AUTH calls instead of
// the hosted UI) so sign-in works on any origin, including the interim S3
// HTTP site, with the app's own styling.
export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "confirm">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
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
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {mode === "signin" && "Sign in to open cases and manage your inventory."}
          {mode === "signup" && "Virtual balance only. No real money required."}
          {mode === "confirm" && "Enter the code we emailed to " + email.trim() + "."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode !== "confirm" && (
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-rose-500/60 focus:outline-none"
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
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-rose-500/60 focus:outline-none"
            />
          )}
          {mode === "confirm" && (
            <input
              type="text"
              required
              inputMode="numeric"
              placeholder="Confirmation code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-rose-500/60 focus:outline-none"
            />
          )}

          {error && (
            <p className={"text-xs rounded-lg px-3 py-2 " + (error.startsWith("Check your email")
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              : "bg-red-500/10 text-red-300 border border-red-500/20")}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-50 transition-colors"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Confirm & Sign In"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-neutral-500">
          {mode === "signin" ? (
            <button onClick={() => { setMode("signup"); setError(null); }} className="hover:text-neutral-300 underline-offset-2 hover:underline">
              No account yet? Create one
            </button>
          ) : (
            <button onClick={() => { setMode("signin"); setError(null); }} className="hover:text-neutral-300 underline-offset-2 hover:underline">
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
