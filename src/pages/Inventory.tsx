import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getInventory, sellItem, sellAllItems, ApiError } from "../services/api";
import { getValidAccessToken, refreshProfile } from "../services/auth";
import { steamImg } from "../lib/steam";
import { motion, AnimatePresence } from "motion/react";
import type { LayoutContext } from "../components/Layout";
import { useToast } from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";

import { playSell } from "../lib/sounds";

const PAGE_SIZE = 60;

export default function Inventory({ user }: { user: any }) {
    const { openAuth } = useOutletContext<LayoutContext>();
    const toast = useToast();
    const [items, setItems] = useState<any[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selling, setSelling] = useState(false);
    const [confirmSellAll, setConfirmSellAll] = useState(false);
    const userId = user?.userId || user?.id;

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const token = await getValidAccessToken();
            const page = await getInventory(userId, token, null, PAGE_SIZE);
            setItems(page.items);
            setNextCursor(page.nextCursor);
        } catch (error) {
            console.error(error);
            toast.push(error instanceof ApiError ? error.message : "Couldn't load your inventory.");
        } finally {
            setLoading(false);
        }
    }, [userId, toast]);

    useEffect(() => {
        void load();
    }, [load]);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const token = await getValidAccessToken();
            const page = await getInventory(userId, token, nextCursor, PAGE_SIZE);
            setItems((current) => [...current, ...page.items]);
            setNextCursor(page.nextCursor);
        } catch (error) {
            toast.push(error instanceof ApiError ? error.message : "Couldn't load more items.");
        } finally {
            setLoadingMore(false);
        }
    };

    const handleSell = async (itemId: string) => {
        if (!user || selling) return;
        setSelling(true);
        try {
            const token = await getValidAccessToken();
            await sellItem(itemId, token);
            playSell();
            setItems((current) => current.filter((item) => item.itemId !== itemId));
            refreshProfile();
            toast.push("Item sold.", "success");
        } catch (error) {
            console.error("Sell failed", error);
            toast.push(error instanceof ApiError ? error.message : "That item could not be sold.");
        } finally {
            setSelling(false);
        }
    };

    const handleSellAll = async () => {
        if (!user || selling) return;
        setSelling(true);
        try {
            const token = await getValidAccessToken();
            const result = await sellAllItems(token);
            playSell();
            toast.push(
                `Sold ${result.sold} ${result.sold === 1 ? "item" : "items"} for $${Number(result.total || 0).toFixed(2)}.`,
                "success"
            );
            setConfirmSellAll(false);
            setNextCursor(null);
            await load();
            refreshProfile();
        } catch (error) {
            console.error("Sell all failed", error);
            toast.push(error instanceof ApiError ? error.message : "Sell all failed. Please try again.");
            // The batch may have sold an earlier chunk; reload the truth.
            await load();
            refreshProfile();
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
                        Value on this page: <span className="uo-inv-value">${inventoryValue.toFixed(2)}</span>
                        <span className="ml-2 text-[13px] text-[#8d97aa]">
                            · {items.length} {items.length === 1 ? "item" : "items"}
                            {nextCursor ? " loaded" : ""}
                        </span>
                    </p>
                </div>
                {items.length > 0 && (
                    <div className="uo-page-actions">
                        <button
                            onClick={() => setConfirmSellAll(true)}
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
                <>
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
                                        <span>F: {item.float?.toFixed(4) ?? "—"}</span>
                                        <span>P: {item.pattern ?? "—"}</span>
                                    </div>

                                    <div className="uo-inv-foot">
                                        <span className="uo-inv-price">${item.price?.toFixed(2)}</span>
                                        <button
                                            disabled={selling}
                                            onClick={() => handleSell(item.itemId)}
                                            className="uo-sell-btn"
                                            aria-label={`Sell ${item.name} for $${item.price?.toFixed(2)}`}
                                        >
                                            Sell
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </motion.div>

                    {nextCursor && (
                        <div className="flex justify-center mt-8">
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="uo-btn uo-btn-outline uo-btn-sm"
                            >
                                {loadingMore ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </>
            )}

            <ConfirmDialog
                open={confirmSellAll}
                title="Sell everything?"
                message={`This sells all ${items.length} loaded items${nextCursor ? " (more may remain on later pages)" : ""} for their rolled value. This cannot be undone.`}
                confirmLabel="Sell All"
                busy={selling}
                onConfirm={handleSellAll}
                onCancel={() => setConfirmSellAll(false)}
            />
        </div>
    );
}
