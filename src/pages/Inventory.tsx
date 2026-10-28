import { useState, useEffect } from "react";
import { getInventory, sellItem } from "../services/api";
import { getAccessToken } from "../services/auth";
import { motion, AnimatePresence } from "motion/react";

import { playSell } from "../lib/sounds";

export default function Inventory({ user }: { user: any }) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selling, setSelling] = useState(false);

    useEffect(() => {
        if (!user) return;
        let mounted = true;
        const load = async () => {
            const token = getAccessToken();
            try {
                const data = await getInventory(user.id, token);
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
            const token = getAccessToken();
            await sellItem(itemId, price, token);
            playSell();
            const data = await getInventory(user.id, token);
            setItems(data);
        } catch (e) {
            console.error("Sell failed", e);
        } finally {
            setSelling(false);
        }
    };

    const handleSellAll = async () => {
        const confirm = window.confirm("Are you sure you want to sell ALL items?");
        if(!confirm || !user || selling) return;
        
        setSelling(true);
        try {
            const token = getAccessToken();
            for(const item of items) {
                await sellItem(item.id, item.price, token);
            }
            if (items.length > 0) playSell();
            const data = await getInventory(user.id, token);
            setItems(data);
        } catch(e) {
            console.error("Sell all failed", e);
            alert("Error during sell all process.");
        } finally {
            setSelling(false);
        }
    }

    if (!user) return <div className="text-center text-neutral-400 mt-20">Please sign in to view your inventory.</div>;

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
        </div>
    );

    const inventoryValue = items.reduce((acc, curr) => acc + (curr.price || 0), 0);

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="space-y-8"
        >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Inventory</h1>
                    <p className="text-neutral-400">Total Value: <span className="text-amber-400 font-mono font-medium">${inventoryValue.toFixed(2)}</span></p>
                </div>
                {items.length > 0 && (
                    <button 
                        onClick={handleSellAll}
                        disabled={selling}
                        className="bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 text-white font-medium py-2 px-4 rounded-lg transition-colors border border-neutral-700"
                    >
                        {selling ? 'Selling...' : 'Sell All'}
                    </button>
                )}
            </div>

            {items.length === 0 ? (
                <div className="bg-neutral-900 border-2 border-dashed border-neutral-800 rounded-2xl flex flex-col items-center justify-center py-24 text-center">
                    <p className="text-neutral-400 mb-4">Your inventory is empty.</p>
                    <p className="text-sm text-neutral-500">Go open some cases!</p>
                </div>
            ) : (
                <motion.div 
                    initial="hidden"
                    animate="show"
                    variants={{
                        hidden: { opacity: 0 },
                        show: {
                            opacity: 1,
                            transition: { staggerChildren: 0.05 }
                        }
                    }}
                    className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                >
                    <AnimatePresence>
                    {items.map(item => (
                        <motion.div 
                            key={item.id} 
                            variants={{
                                hidden: { opacity: 0, scale: 0.9 },
                                show: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } }
                            }}
                            layout
                            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                            style={{ borderBottomColor: item.color }}
                            className={`group bg-neutral-900 border border-neutral-800 border-b-4 rounded-xl p-3 flex flex-col relative transition-all hover:bg-neutral-800/80 ${item.color === '#ffd700' ? 'shadow-[0_0_15px_rgba(255,215,0,0.15)] ring-1 ring-[#ffd700]/30' : ''}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-bold tracking-wider uppercase text-neutral-500">{item.condition}</span>
                                <div className="flex gap-1">
                                    {item.phase && (
                                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold">{item.phase}</span>
                                    )}
                                    {item.isStatTrak && (
                                        <span className="text-[10px] bg-orange-500/20 text-orange-500 px-1.5 py-0.5 rounded font-bold">ST™</span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="w-full aspect-square bg-gradient-to-br from-neutral-800 to-neutral-900/50 rounded-lg p-2 mb-3 flex items-center justify-center">
                                <img src={item.image} alt={item.name} className="w-full object-contain" loading="lazy" />
                            </div>
                            
                            <div className="flex-1 flex flex-col justify-end mt-2">
                                <h3 className="font-semibold text-xs text-neutral-200 line-clamp-2 leading-tight mb-1 h-8" title={item.name}>
                                    {item.name}
                                </h3>
                                <div className="flex justify-between items-center mb-2 font-mono text-[9px] text-neutral-500 uppercase">
                                    <span>F: {item.float?.toFixed(4)}</span>
                                    <span>P: {item.pattern}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="font-mono text-xs font-bold text-emerald-400">${item.price?.toFixed(2)}</span>
                                    <button 
                                        disabled={selling}
                                        onClick={() => handleSell(item.id, item.price)}
                                        className="opacity-0 group-hover:opacity-100 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-[10px] font-bold text-white px-2 py-1 rounded transition-all"
                                    >
                                        SELL
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                    </AnimatePresence>
                </motion.div>
            )}
        </motion.div>
    );
}
