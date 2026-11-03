import { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getInventory, sellItem } from "../services/api";
import { getValidAccessToken, refreshProfile } from "../services/auth";
import { steamImg } from "../lib/steam";
import { motion, AnimatePresence } from "motion/react";
import type { LayoutContext } from "../components/Layout";

import { playSell } from "../lib/sounds";

export default function Inventory({ user }: { user: any }) {
    const { openAuth } = useOutletContext<LayoutContext>();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selling, setSelling] = useState(false);
    const userId = user?.userId || user?.id;

    useEffect(() => {
        if (!user) return;
        let mounted = true;
        const load = async () => {
            const token = await getValidAccessToken();
            try {
                const data = await getInventory(userId, token);
                if (mounted) setItems(data);
            } catch (e) {
                console.error(e);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [user]);

    const handleSell = async (itemId: string, price: number) => {
        if (!user || selling) return;
        setSelling(true);
        try {
            const token = await getValidAccessToken();
            await sellItem(itemId, price, token);
            playSell();
            const data = await getInventory(userId, token);
            setItems(data);
            refreshProfile();
        } catch (e) {
            console.error("Sell failed", e);
        } finally {
            setSelling(false);
        }
    };

    const handleSellAll = async () => {
        const confirm = window.confirm("Are you sure you want to sell ALL items?");
        if (!confirm || !user || selling) return;

        setSelling(true);
        try {
            const token = await getValidAccessToken();
            for (const item of items) {
                await sellItem(item.itemId, item.price, token);
            }
            if (items.length > 0) playSell();
            const data = await getInventory(userId, token);
            setItems(data);
            refreshProfile();
        } catch (e) {
            console.error("Sell all failed", e);
            alert("Error during sell all process.");
        } finally {
            setSelling(false);
        }
    };

    if (!user) {
        return (
            <div className="uo-page">
                <div className="uo-page-head">
                    <h1 className="uo-title">Inventory</h1>
                    <p className="uo-sub">Your pulled skins live here.</p>
                </div>
                <div className="uo-empty">
                    <strong>Sign in to view your inventory</strong>
                    Your pulls are saved to your account.
                    <div>
                        <button
                            className="uo-btn uo-btn-primary uo-btn-sm mt-4"
                            onClick={openAuth}
                        >
                            Sign In
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const inventoryValue = items.reduce((acc, curr) => acc + (curr.price || 0), 0);

    return (
        <div className="uo-page">
            <div className="uo-inv-head">
                <div className="uo-page-head">
                    <h1 className="uo-title">Inventory</h1>
                    <p className="uo-sub">
                        Total Value: <span className="uo-inv-value">${inventoryValue.toFixed(2)}</span>
                        <span className="ml-2 text-[13px] text-[#8d97aa]">
                            · {items.length} {items.length === 1 ? "item" : "items"}
                        </span>
                    </p>
                </div>
                {items.length > 0 && (
                    <div className="uo-page-actions">
                        <button
                            onClick={handleSellAll}
                            disabled={selling}
                            className="uo-btn uo-btn-outline uo-btn-sm"
                        >
                            {selling ? "Selling…" : "Sell All"}
                        </button>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="uo-empty">Loading inventory…</div>
            ) : items.length === 0 ? (
                <div className="uo-empty">
                    <strong>Your inventory is empty</strong>
                    Open a case and your first pull will land here.
                    <div>
                        <Link to="/" className="uo-btn uo-btn-primary uo-btn-sm mt-4">
                            Browse Cases
                        </Link>
                    </div>
                </div>
            ) : (
                <motion.div
                    initial="hidden"
                    animate="show"
                    variants={{
                        hidden: { opacity: 0 },
                        show: { opacity: 1, transition: { staggerChildren: 0.03 } },
                    }}
                    className="uo-inv-grid"
                >
                    <AnimatePresence>
                        {items.map((item) => (
                            <motion.div
                                key={item.itemId}
                                variants={{
                                    hidden: { opacity: 0, scale: 0.96 },
                                    show: {
                                        opacity: 1,
                                        scale: 1,
                                        transition: { type: "spring", bounce: 0.3 },
                                    },
                                }}
                                layout
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
                                style={{ borderBottomColor: item.color || "#4b69ff" }}
                                className={"uo-inv-card" + (item.color === "#ffd700" ? " is-gold" : "")}
                            >
                                <div className="uo-inv-top">
                                    {item.condition && <span className="uo-chip">{item.condition}</span>}
                                    <div className="flex gap-1">
                                        {item.phase && (
                                            <span className="uo-chip" style={{ color: "#9aa3ff" }}>
                                                {item.phase}
                                            </span>
                                        )}
                                        {item.isStatTrak && (
                                            <span className="uo-chip" style={{ color: "#f0902a" }}>
                                                ST™
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="uo-inv-art">
                                    <img src={steamImg(item.image)} alt={item.name} loading="lazy" />
                                </div>

                                <h3 className="uo-inv-name" title={item.name}>{item.name}</h3>

                                <div className="uo-inv-meta">
                                    <span>F: {item.float?.toFixed(4)}</span>
                                    <span>P: {item.pattern}</span>
                                </div>

                                <div className="uo-inv-foot">
                                    <span className="uo-inv-price">${item.price?.toFixed(2)}</span>
                                    <button
                                        disabled={selling}
                                        onClick={() => handleSell(item.itemId, item.price)}
                                        className="uo-sell-btn"
                                    >
                                        Sell
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            )}
        </div>
    );
}
