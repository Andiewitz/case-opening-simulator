import { useEffect } from "react";
import { completeSignIn } from "../services/auth";

// Handle the Cognito hosted-UI redirect (?code=...) exactly once.
// Module-level guard: React StrictMode double-fires effects in dev, and the
// authorization code is single-use — a second exchange would 400.
let handlingCode = false;

export default function Callback() {
  useEffect(() => {
    if (handlingCode) return;
    handlingCode = true;

    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      completeSignIn(code).finally(() => window.location.replace("/"));
    } else {
      window.location.replace("/");
    }
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
      Signing you in…
    </div>
  );
}
