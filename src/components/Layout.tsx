import { Outlet, Link, useLocation } from "react-router-dom";
import { PackageOpen, Menu, X, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "../services/auth";
import AuthModal from "./AuthModal";

export type LayoutContext = { openAuth: () => void };

export default function Layout({ user }: { user: any }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const location = useLocation();

  const casesActive = location.pathname === "/" || location.pathname.startsWith("/case/");
  const inventoryActive = location.pathname.startsWith("/inventory");

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="uo-screen">
      <div className="uo-bg" aria-hidden="true" />
      <div className="uo-vignette" aria-hidden="true" />

      <header className="uo-header">
        <Link to="/" className="uo-brand" aria-label="CS2 Unboxed home">
          <PackageOpen className="w-5 h-5" strokeWidth={1.8} />
          <span>CS2 <em>Unboxed</em></span>
        </Link>

        <nav className="uo-nav-links" aria-label="Primary">
          <Link to="/" className={"uo-nav-link" + (casesActive ? " is-active" : "")}>
            Cases
          </Link>
          <Link to="/inventory" className={"uo-nav-link" + (inventoryActive ? " is-active" : "")}>
            Inventory
          </Link>
        </nav>

        <div className="uo-nav-right">
          {user ? (
            <>
              <span className="uo-balance" title="Virtual balance">
                ${user.balance?.toFixed(2)}
              </span>
              <button
                onClick={() => void signOut()}
                className="uo-icon-btn uo-signout-btn"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button onClick={() => setAuthOpen(true)} className="uo-btn uo-btn-primary uo-btn-sm">
              Sign In
            </button>
          )}

          <button
            className="uo-icon-btn uo-menu-btn"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="uo-mobile-menu">
          <Link to="/" onClick={() => setMobileMenuOpen(false)}>
            <PackageOpen className="w-4 h-4" />
            Cases
          </Link>
          <Link to="/inventory" onClick={() => setMobileMenuOpen(false)}>
            <PackageOpen className="w-4 h-4" />
            Inventory
          </Link>
          {user ? (
            <button onClick={() => { void signOut(); setMobileMenuOpen(false); }}>
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <button onClick={() => { setAuthOpen(true); setMobileMenuOpen(false); }}>
              Sign In
            </button>
          )}
        </div>
      )}

      <main className="relative z-10">
        <Outlet context={{ openAuth: () => setAuthOpen(true) } satisfies LayoutContext} />
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
