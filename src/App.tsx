import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged, getCurrentUser, getValidAccessToken } from "./services/auth";
import { getUser } from "./services/api";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import CaseOpener from "./pages/CaseOpener";
import Inventory from "./pages/Inventory";
import Callback from "./pages/Callback";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const unsub = onAuthStateChanged(async (u) => {
      if (!mounted) return;
      if (u) {
        const token = await getValidAccessToken();
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

    return () => { mounted = false; unsub(); };
  }, []);

  if (loading) {
    return (
      <div className="uo-screen flex items-center justify-center">
        <div className="uo-bg" aria-hidden="true" />
        <div className="animate-spin rounded-full h-8 w-8" style={{ border: "2px solid #2c3445", borderBottomColor: "#3be83b" }}></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={user} />}>
          <Route index element={<Home user={user} />} />
          <Route path="case/:id" element={<CaseOpener user={user} />} />
          <Route path="inventory" element={<Inventory user={user} />} />
          <Route path="callback" element={<Callback />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
