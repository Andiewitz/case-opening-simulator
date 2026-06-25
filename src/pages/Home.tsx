import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getCrates } from "../services/api";
import { motion } from "motion/react";

export default function Home({ user }: { user: any }) {
    const [crates, setCrates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getCrates().then(data => {
            setCrates(data);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
        </div>
    );

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="space-y-8"
        >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">CS:GO / CS2 Cases</h1>
                    <p className="text-neutral-400">Open cases safely with virtual balance. No real money required.</p>
                </div>
            </div>

            {!user && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-200">
                    Sign in to open cases and manage your inventory.
                </div>
            )}

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
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            >
                {crates.map(crate => (
                    <motion.div
                        key={crate.id}
                        variants={{
                            hidden: { opacity: 0, scale: 0.9 },
                            show: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } }
                        }}
                    >
                        <Link 
                            to={`/case/${crate.id}`}
                            className="group bg-neutral-900 border border-neutral-800 hover:border-rose-500/50 rounded-xl p-4 transition-all hover:bg-neutral-800/80 flex flex-col items-center gap-4 hover:-translate-y-1 block"
                        >
                            <div className="w-full aspect-square bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-lg p-2 flex items-center justify-center relative overflow-hidden group-hover:shadow-[0_0_20px_rgba(244,63,94,0.15)] transition-shadow">
                                <img 
                                    src={crate.image} 
                                    alt={crate.name} 
                                    className="w-full object-contain group-hover:scale-110 transition-transform duration-500" 
                                    loading="lazy"
                                />
                            </div>
                            <div className="text-center w-full">
                                <h3 className="font-medium text-sm text-neutral-200 line-clamp-2" title={crate.name}>{crate.name}</h3>
                                <p className="text-xs font-mono text-emerald-400 mt-2 font-bold bg-emerald-400/10 inline-block px-2 py-0.5 rounded-full">$2.50</p>
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </motion.div>
        </motion.div>
    );
}
