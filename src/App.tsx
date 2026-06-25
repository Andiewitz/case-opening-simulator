/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./services/firebase";
import { subscribeToUser, getUserProfile } from "./services/db";

import Layout from "./components/Layout";
import Home from "./pages/Home";
import CaseOpener from "./pages/CaseOpener";
import Inventory from "./pages/Inventory";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Ensure profile exists or get it
        await getUserProfile(u.uid);
        // Subscribe to live user data
        const unsubUser = subscribeToUser(u.uid, (data) => {
          setUser(data);
        });
        setLoading(false);
        return () => unsubUser();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
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
