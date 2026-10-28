import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged, getCurrentUser, getAccessToken, completeSignIn } from "./services/auth";
import { getUser } from "./services/api";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import CaseOpener from "./pages/CaseOpener";
import Inventory from "./pages/Inventory";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        await completeSignIn(code);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    const unsub = onAuthStateChanged(async (u) => {
      if (!mounted) return;
      if (u) {
        const token = getAccessToken();
        let profile = u;
        try {
          const userId = u.userId || u.sub || u.username;
          if (userId && token) {
            const fetched = await getUser(userId, token);
            profile = { ...u, ...fetched, balance: fetched.balance, stats: fetched.stats };
          }
        } catch {}
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    handleCallback();
    return () => { mounted = false; unsub(); };
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={user} />}>
          <Route index element={<Home user={user} />} />
          <Route path="case/:id" element={<CaseOpener user={user} />} />
          <Route path="inventory" element={<Inventory user={user} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
