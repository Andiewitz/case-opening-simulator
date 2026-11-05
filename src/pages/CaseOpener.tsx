import { useState, useEffect, useRef } from "react";
import { useParams, Link, useOutletContext } from "react-router-dom";
import { getCrates, openCase, ApiError } from "../services/api";
import { getValidAccessToken, refreshProfile } from "../services/auth";
import { useToast } from "../components/Toast";
import { useEconomy } from "../hooks/useEconomy";
import type { LayoutContext } from "../components/Layout";
import { playReveal, preloadCaseOpenSound, playCaseOpenSound, getCaseOpenDuration, stopCaseOpenSound } from "../lib/sounds";
import { steamImg } from "../lib/steam";
import { motion, AnimatePresence } from "motion/react";
import "./caseopener.css";

/** "MP7 | Skulls" -> ["MP7", "Skulls"] — the design splits weapon and skin lines. */
function splitName(name: string): [string, string] {
    const i = (name || "").indexOf("|");
    if (i === -1) return [name || "", ""];
    return [name.slice(0, i).trim(), name.slice(i + 1).trim()];
}

/** A couple of names are too long for the 108px preview tiles. */
function shortWeapon(w: string): string {
    if (w === "Desert Eagle") return "DEAGLE";
    if (w === "Dual Berettas") return "DUALS";
    return w;
}

export default function CaseOpener({ user }: { user: any }) {
    const { id } = useParams();
    const [crate, setCrate] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [opening, setOpening] = useState(false);
    const [winningItem, setWinningItem] = useState<any>(null);
    const [showResult, setShowResult] = useState(false);

    // The items to spin through
    const [reelItems, setReelItems] = useState<any[]>([]);
    const [announcement, setAnnouncement] = useState("");

    const { openAuth } = useOutletContext<LayoutContext>();
    const toast = useToast();
    const { config } = useEconomy();
    // Price comes from the server (GET /config) so the UI and the charge can
    // never disagree. Null means "not loaded yet" — never a made-up price.
    const caseCost = config?.caseCost ?? null;

    const reelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        preloadCaseOpenSound();
        getCrates().then(crates => {
            const c = crates.find(x => x.id === id);
            setCrate(c);
            setLoading(false);
        });

        return () => {
            stopCaseOpenSound();
        };
    }, [id]);

    const handleOpen = async () => {
        if (opening) return;
        if (!user) {
            openAuth();
            return;
        }
        if (caseCost === null) {
            toast.push("Still loading the case price — try again in a moment.", "info");
            return;
        }
        if (user.balance < caseCost) {
            toast.push("Not enough balance to open this case.");
            return;
        }

        if (!crate) return;

        setOpening(true);
        setShowResult(false);
        setWinningItem(null);
        setAnnouncement("Unlocking…");

        if (reelRef.current) {
            reelRef.current.style.transition = 'none';
            reelRef.current.style.transform = `translateX(0px)`;
        }

        try {
            const token = await getValidAccessToken();
            // 1. Server generates the roll, deducts balance, and saves the item atomically
            const savedItem = await openCase(crate.id, token);
            if (!savedItem) {
                 throw new Error("Failed transaction.");
            }
            const winner = savedItem;

            // 2. Generate Visual Reel
            const items = [];
            const pool = crate.contains || [];
            for (let i = 0; i < 60; i++) {
                if (i === 45) { // The winner is perfectly mapped to index 45
                    const winnerReelItem = { ...savedItem, color: savedItem.color || winner.rarity?.color };
                    if (winnerReelItem.color === "#ffd700" || winnerReelItem.rarity === "Rare Special Item") {
                        winnerReelItem.image = "/gold_item.svg";
                        winnerReelItem.name = "★ Rare Special Item ★";
                    }
                    items.push(winnerReelItem);
                } else {
                    let randomVisual: any;
                    // Provide a 10% chance to show a GOLD item on the reel if the case has rare items
                    if (crate.contains_rare && crate.contains_rare.length > 0 && Math.random() < 0.1) {
                         randomVisual = crate.contains_rare[Math.floor(Math.random() * crate.contains_rare.length)];
                         items.push({
                             ...randomVisual,
                             color: "#ffd700",
                             name: "★ Rare Special Item ★",
                             image: "/gold_item.svg"
                         }); // Force gold color and icon on reel
                    } else {
                         randomVisual = pool[Math.floor(Math.random() * pool.length)];
                         items.push({ ...randomVisual, color: randomVisual.rarity?.color || "#b0c3d9" });
                    }
                }
            }
            setReelItems(items);
            setWinningItem(savedItem); // Store real ID item
            refreshProfile(); // header balance now reflects the open

            // 4. Force DOM repaint then CSS spin
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (reelRef.current) {
                        // ─── AUDIO-SYNCED TIMING — DO NOT CHANGE ────────────────
                        // delayBeforeSpin / scrollDuration / the +500ms reveal are
                        // tuned so the reel lands on the winner exactly when the
                        // case-opening audio peaks. Changing any number here
                        // desyncs the animation from the sound.
                        // The x-math requires the item pitch to stay at
                        // 150px tile + 10px gap (itemWidth = 160).
                        // ─────────────────────────────────────────────────────────
                        const itemWidth = 160;
                        const randomOffset = Math.floor(Math.random() * 80) - 40;

                        // left-[50%] on container means index 0 left aligns to center
                        // Shift left by 45 instances + half an item to perfectly center element 45
                        const targetX = -(45 * itemWidth) - 75 + randomOffset;

                        const fullDuration = getCaseOpenDuration() || 11.5;
                        const delayBeforeSpin = 1.5;
                        const scrollDuration = Math.max(1, fullDuration - 5 - delayBeforeSpin);

                        playCaseOpenSound();

                        setTimeout(() => {
                            if (reelRef.current) {
                                reelRef.current.style.transition = `transform ${scrollDuration}s cubic-bezier(0.05, 0.95, 0.1, 1)`;
                                reelRef.current.style.transform = `translateX(${targetX}px)`;
                            }
                        }, delayBeforeSpin * 1000);

                        setTimeout(() => {
                            playReveal(savedItem.color || winner.rarity?.color);
                            setShowResult(true);
                            setOpening(false);
                            // Screen readers get the outcome without the reel.
                            setAnnouncement(
                                `You unboxed ${savedItem.name}, valued at $${(savedItem.price || 0).toFixed(2)}.`
                            );
                        }, (delayBeforeSpin + scrollDuration) * 1000 + 500);
                        // ─── END AUDIO-SYNCED TIMING ────────────────────────────
                    }
                }, 50);
            });
        } catch (error) {
            console.error("Open case error:", error);
            if (error instanceof ApiError && error.status === 401) {
                toast.push("Your session expired. Please sign in again.");
                openAuth();
            } else if (error instanceof ApiError) {
                toast.push(error.message);
            } else {
                toast.push("Error opening case. Please try again.");
            }
            setShowResult(false);
            setOpening(false);
            setAnnouncement("");
        }
    };

    // Reset function
    const handleReset = () => {
        stopCaseOpenSound();
        setShowResult(false);
        setWinningItem(null);
        setReelItems([]);
        setAnnouncement("");
        if(reelRef.current) {
             reelRef.current.style.transition = 'none';
             reelRef.current.style.transform = `translateX(0px)`;
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 56px)" }}>
            <div className="animate-spin rounded-full h-8 w-8" style={{ border: "2px solid #2c3445", borderBottomColor: "#3be83b" }}></div>
        </div>
    );

    if (!crate) return (
        <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: "calc(100vh - 56px)" }}>
            <div className="uo-title" style={{ fontSize: 24 }}>Case not found</div>
            <Link to="/" className="uo-backlink">‹ Back to Cases</Link>
        </div>
    );

    const contains = crate.contains || [];
    const isGoldItem = (item: any) =>
        item.color === "#ffd700" || item.rarity === "Rare Special Item" || item.name === "★ Rare Special Item ★";

    return (
        <div className="relative overflow-hidden" style={{ minHeight: "calc(100vh - 56px)" }}>
            <div className="relative z-10 flex flex-col" style={{ minHeight: "calc(100vh - 56px)" }}>
                {/* Title block */}
                <div className="relative text-center px-4 pt-7 sm:pt-9">
                    <Link to="/" className="uo-backlink uo-backlink-corner absolute left-4 sm:left-8 top-7 sm:top-9">‹ Cases</Link>
                    <h1 className="uo-title">Unlock Container</h1>
                    <div className="uo-sub mt-1">Unlock <b>{crate.name}</b></div>
                    <div className="uo-note">
                        {caseCost !== null ? `$${caseCost.toFixed(2)}` : "—"} per open · items go straight to your inventory
                    </div>
                    <div role="status" aria-live="assertive" className="sr-only">
                        {announcement}
                    </div>
                </div>

                {/* Center stage: crate / spinning reel / result */}
                <div className="flex-1 flex items-center justify-center w-full px-2 py-6">
                    {!showResult && !opening && (
                        <div className="relative flex items-center justify-center" style={{ minHeight: 250 }}>
                            <div
                                aria-hidden
                                style={{
                                    position: "absolute",
                                    width: 460,
                                    height: 330,
                                    background: "radial-gradient(ellipse at center, rgba(120,140,175,0.28), transparent 65%)",
                                }}
                            />
                            <img
                                src={steamImg(crate.image)}
                                alt={crate.name}
                                className="relative transition-transform duration-500"
                                style={{
                                    width: 280,
                                    maxWidth: "70vw",
                                    transform: "rotate(-6deg)",
                                    filter: "drop-shadow(0 40px 50px rgba(0,0,0,0.6))",
                                }}
                            />
                        </div>
                    )}

                    {!showResult && opening && (
                        <div className="w-full relative" style={{ height: 196 }}>
                            {/* Center tick */}
                            <div
                                className="absolute top-0 bottom-0 left-1/2 -ml-[1px] w-[2px] z-20"
                                style={{ background: "#e8edf7", boxShadow: "0 0 10px rgba(232,237,247,0.9)" }}
                            />

                            {reelItems.length === 0 && (
                                <div
                                    className="absolute inset-0 flex items-center justify-center z-30"
                                    style={{ font: "700 18px Rajdhani, sans-serif", letterSpacing: "0.14em", color: "#5d6678" }}
                                >
                                    UNLOCKING…
                                </div>
                            )}

                            <div className="uo-reel-mask absolute inset-0" aria-hidden="true">
                                <div
                                    className="flex h-full items-center gap-[10px] whitespace-nowrap absolute left-[50%]"
                                    ref={reelRef}
                                    style={{ transform: "translateX(0)", willChange: "transform" }}
                                >
                                    {reelItems.map((item, index) => {
                                        const gold = isGoldItem(item);
                                        const [weapon, skin] = splitName(item.name);
                                        return (
                                            <div
                                                key={index}
                                                className="uo-rtile w-[150px] h-[150px] flex-shrink-0"
                                                style={{ borderBottomColor: item.color || item.rarity?.color || "#4b69ff" }}
                                            >
                                                {gold ? (
                                                    <>
                                                        <div className="uo-rtile-img">
                                                            <span style={{ font: "700 46px Rajdhani, sans-serif", color: "#ffd700" }}>?</span>
                                                        </div>
                                                        <div className="uo-rtile-txt">
                                                            <span className="uo-rtile-skin">Rare Special Item</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="uo-rtile-img">
                                                            <img src={steamImg(item.image)} alt={item.name} />
                                                        </div>
                                                        <div className="uo-rtile-txt">
                                                            {item.isStatTrak && (
                                                                <span style={{ font: "700 9px Rajdhani, sans-serif", color: "#f0902a" }}>StatTrak™</span>
                                                            )}
                                                            <span className="uo-rtile-weapon">{shortWeapon(weapon) || item.name}</span>
                                                            {skin && <span className="uo-rtile-skin">{skin}</span>}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    <AnimatePresence>
                        {showResult && winningItem && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92 }}
                                transition={{ type: "spring", bounce: 0.35 }}
                                className="uo-result relative overflow-hidden px-8 py-8 sm:px-12 flex flex-col items-center text-center w-full max-w-[560px]"
                            >
                                <div
                                    aria-hidden
                                    style={{
                                        position: "absolute",
                                        top: -60,
                                        width: 320,
                                        height: 320,
                                        background: `radial-gradient(ellipse at center, ${winningItem.color || "#5d6678"}30, transparent 65%)`,
                                    }}
                                />

                                <motion.img
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
                                    src={steamImg(winningItem.image)}
                                    alt={winningItem.name}
                                    className="relative w-44 h-44 object-contain mb-5"
                                    style={{ filter: "drop-shadow(0 18px 28px rgba(0,0,0,0.55))" }}
                                />

                                <motion.h2
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                    className="relative mb-3"
                                    style={{
                                        font: "700 30px Rajdhani, sans-serif",
                                        color: winningItem.color || "#e8edf7",
                                        letterSpacing: "0.02em",
                                    }}
                                >
                                    {winningItem.name}
                                </motion.h2>

                                <motion.div
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.4 }}
                                    className="relative flex flex-wrap items-center justify-center gap-2 mb-5"
                                >
                                    {winningItem.condition && <span className="uo-chip">{winningItem.condition}</span>}
                                    {winningItem.float !== null && winningItem.float !== undefined && (
                                        <span className="uo-chip">Float: {winningItem.float?.toFixed(4)}</span>
                                    )}
                                    {winningItem.pattern !== null && winningItem.pattern !== undefined && (
                                        <span className="uo-chip">Pattern: {winningItem.pattern}</span>
                                    )}
                                    {winningItem.phase && <span className="uo-chip" style={{ color: "#9aa3ff" }}>{winningItem.phase}</span>}
                                    {winningItem.isStatTrak && <span className="uo-chip" style={{ color: "#f0902a" }}>StatTrak™</span>}
                                    {winningItem.priceSource && winningItem.priceSource !== "steam" && (
                                        <span className="uo-chip" title={winningItem.priceProvider || undefined}>
                                            {winningItem.priceSource === "reference" ? "Collector ref" : "Estimate"}
                                        </span>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="relative uo-valuepill mb-6"
                                >
                                    <span className="uo-valuepill-label">Value</span>
                                    <span className="uo-valuepill-value">${winningItem.price.toFixed(2)}</span>
                                </motion.div>

                                <motion.button
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.55 }}
                                    onClick={handleReset}
                                    className="uo-btn uo-btn-primary relative"
                                >
                                    Continue
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Items inside the case — preview row */}
                {!opening && !showResult && (
                    <div className="uo-items-scroll pb-7">
                        <div className="uo-items">
                            {contains.map((item: any) => {
                                const [weapon, skin] = splitName(item.name);
                                return (
                                    <div
                                        key={item.id}
                                        className="uo-tile uo-tile-img w-[112px] h-[124px]"
                                        style={{ borderBottomColor: item.rarity?.color || "#4b69ff" }}
                                        title={item.name}
                                    >
                                        <div className="uo-ptile-img">
                                            <img src={steamImg(item.image)} alt={item.name} loading="lazy" />
                                        </div>
                                        <span className="uo-ptile-weapon">{shortWeapon(weapon)}</span>
                                        {skin && <span className="uo-ptile-skin">{skin}</span>}
                                    </div>
                                );
                            })}
                            {crate.contains_rare && crate.contains_rare.length > 0 && (
                                <div
                                    className="uo-tile w-[112px] h-[124px]"
                                    style={{ borderBottomColor: "#ffd700" }}
                                    title="★ Rare Special Item"
                                >
                                    <span className="uo-tile-weapon uo-tile-weapon-gold">?</span>
                                    <i className="uo-tile-skin">Rare Special Item</i>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Bottom action bar */}
                {!showResult && (
                    <div className="uo-bottom px-6 sm:px-[60px] py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="uo-key">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c9d1e0" strokeWidth="1.6" aria-hidden="true">
                                <circle cx="7" cy="7" r="3.5"></circle>
                                <path d="M9.5 9.5L20 20M15 15l3-3M18 18l2-2"></path>
                            </svg>
                            <span>Use {crate.name} key</span>
                        </div>
                        <div className="flex gap-[10px]">
                            <button
                                onClick={handleOpen}
                                disabled={opening || !user || caseCost === null || user.balance < caseCost}
                                className="uo-btn uo-btn-primary"
                            >
                                {!user ? "Sign in to unlock"
                                    : caseCost === null ? "Loading…"
                                    : user.balance < caseCost ? "Insufficient balance"
                                    : opening ? "Unlocking…"
                                    : "Unlock Container"}
                            </button>
                            <Link to="/" className="uo-btn uo-btn-ghost">Close</Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
