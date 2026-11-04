import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged, getValidAccessToken } from "./services/auth";
import { getUser, warmCaseOpener } from "./services/api";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import Home from "./pages/Home";
import CaseOpener from "./pages/CaseOpener";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const unsub = onAuthStateChanged(async (u) => {
      if (!mounted) return;
      if (u) {
        const token = await getValidAccessToken();
        if (token) void warmCaseOpener(token);
        let profile = u;
        try {
          const userId = u.userId || u.sub || u.username;
          if (userId && token) {
            const fetched = await getUser(userId, token);
            profile = { ...u, ...fetched, balance: fetched.balance, stats: fetched.stats };
          }
        } catch (error) {
          // Keep the cached identity: a profile fetch failure should not sign
          // the user out, and the API's own 401 handling already cleared tokens
          // when the session was truly gone.
          console.warn("Profile refresh failed", error);
        }
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  if (loading) {
    return (
      <div className="uo-screen flex items-center justify-center">
        <div className="uo-bg" aria-hidden="true" />
        <div
          className="animate-spin rounded-full h-8 w-8"
          style={{ border: "2px solid #2c3445", borderBottomColor: "#3be83b" }}
        ></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout user={user} />}>
              <Route index element={<Home user={user} />} />
              <Route path="case/:id" element={<CaseOpener user={user} />} />
              <Route path="inventory" element={<Inventory user={user} />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
