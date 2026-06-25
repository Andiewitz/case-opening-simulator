import { Outlet, Link, useNavigate } from "react-router-dom";
import { loginWithGoogle, logout } from "../services/db";
import { Coins, LogIn, LogOut, PackageOpen, LayoutGrid, Menu } from "lucide-react";
import { useState } from "react";

export default function Layout({ user }: { user: any }) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-rose-500/30">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-neutral-900/80 backdrop-blur-md border-b border-neutral-800">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-white transition-opacity hover:opacity-80">
                        <PackageOpen className="text-rose-500 w-6 h-6" />
                        <span className="hidden sm:inline">CS2 <span className="text-rose-500">Unboxed</span></span>
                    </Link>

                    <div className="flex items-center gap-4 sm:gap-6">
                        {user ? (
                            <>
                                <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-neutral-400">
                                    <Link to="/" className="hover:text-white transition-colors flex items-center gap-2">
                                        <LayoutGrid className="w-4 h-4" />
                                        Cases
                                    </Link>
                                    <Link to="/inventory" className="hover:text-white transition-colors flex items-center gap-2">
                                        <PackageOpen className="w-4 h-4" />
                                        Inventory
                                    </Link>
                                </div>
                                <div className="h-8 w-px bg-neutral-800 hidden sm:block"></div>
                                <div className="flex items-center gap-2 bg-neutral-800/50 rounded-full py-1.5 px-3 border border-neutral-700/50 mr-2">
                                    <Coins className="text-amber-400 w-4 h-4" />
                                    <span className="font-mono text-sm font-bold text-amber-50">
                                        ${user.balance?.toFixed(2)}
                                    </span>
                                    <button 
                                        onClick={async () => {
                                            const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
                                            const { db } = await import('../services/firebase');
                                            await updateDoc(doc(db, 'users', user.id), { balance: user.balance + 100, updatedAt: serverTimestamp() });
                                        }}
                                        className="ml-2 hover:text-emerald-400 text-neutral-400 font-bold transition-colors"
                                        title="Add $100 Demo Funds"
                                    >
                                        +
                                    </button>
                                </div>
                                <button 
                                    onClick={logout}
                                    className="hidden sm:flex p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
                                    title="Sign Out"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                                <button 
                                    className="sm:hidden p-2 text-neutral-400"
                                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                >
                                    <Menu className="w-6 h-6" />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={loginWithGoogle}
                                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full text-sm font-medium hover:bg-neutral-200 transition-colors"
                            >
                                <LogIn className="w-4 h-4" />
                                Sign In
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Mobile Menu */}
            {mobileMenuOpen && user && (
                <div className="sm:hidden border-b border-neutral-800 bg-neutral-900/95 sticky top-16 z-40">
                    <div className="px-4 py-4 flex flex-col gap-4">
                        <Link onClick={() => setMobileMenuOpen(false)} to="/" className="text-neutral-300 hover:text-white font-medium flex items-center gap-2">
                            <LayoutGrid className="w-5 h-5" />
                            Cases
                        </Link>
                        <Link onClick={() => setMobileMenuOpen(false)} to="/inventory" className="text-neutral-300 hover:text-white font-medium flex items-center gap-2">
                            <PackageOpen className="w-5 h-5" />
                            Inventory
                        </Link>
                        <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="text-neutral-300 hover:text-white font-medium flex items-center gap-2 text-left">
                            <LogOut className="w-5 h-5" />
                            Sign Out
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8">
                <Outlet />
            </main>
        </div>
    );
}
