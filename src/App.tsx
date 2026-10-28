import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import CaseOpener from "./pages/CaseOpener";
import Inventory from "./pages/Inventory";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={null} />}>
          <Route index element={<Home user={null} />} />
          <Route path="case/:id" element={<CaseOpener user={null} />} />
          <Route path="inventory" element={<Inventory user={null} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
