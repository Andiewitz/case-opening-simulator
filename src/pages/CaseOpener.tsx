import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getCrates, openCase } from "../services/api";
import { getAccessToken } from "../services/auth";
import { ChevronLeft } from "lucide-react";
import * as React from "react"; 
import { playReveal, playSell, preloadCaseOpenSound, playCaseOpenSound, getCaseOpenDuration, stopCaseOpenSound } from "../lib/sounds";
import { motion, AnimatePresence } from "motion/react";

export default function CaseOpener({ user }: { user: any }) {
    const { id } = useParams();
    const [crate, setCrate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    
    const [opening, setOpening] = useState(false);
    const [winningItem, setWinningItem] = useState<any>(null);
    const [showResult, setShowResult] = useState(false);
    
    // The items to spin through
    const [reelItems, setReelItems] = useState<any[]>([]);
    
    const caseCost = 2.50; // Fixed key cost essentially
    
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
        if (!user || user.balance < caseCost) {
            alert("Insufficient balance or not logged in.");
            return;
        }
        
        if (!crate) return;
        
        setOpening(true);
        setShowResult(false);
        setWinningItem(null);
        
        if (reelRef.current) {
            reelRef.current.style.transition = 'none';
            reelRef.current.style.transform = `translateX(0px)`;
        }
        
        try {
            const token = getAccessToken();
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
            
            // 4. Force DOM repaint then CSS spin
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (reelRef.current) {
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
                        }, (delayBeforeSpin + scrollDuration) * 1000 + 500);
                    }
                }, 50);
            });
        } catch (error) {
             console.error("Open case error:", error);
             alert("Error opening case.");
             setOpening(false);
        }
    };
    
    // Reset function
    const handleReset = () => {
        stopCaseOpenSound();
        setShowResult(false);
        setWinningItem(null);
        setReelItems([]);
        if(reelRef.current) {
             reelRef.current.style.transition = 'none';
             reelRef.current.style.transform = `translateX(0px)`;
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
        </div>
    );

    if (!crate) return <div>Case not found</div>;

    const contains = crate.contains || [];

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="space-y-8 max-w-5xl mx-auto"
        >
             <Link to="/" className="inline-flex items-center text-neutral-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back to Cases
            </Link>
            
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Case Info */}
                <div className="w-full lg:w-1/3 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center flex-shrink-0">
                     <div className="w-48 h-48 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-xl p-4 flex items-center justify-center relative shadow-lg shadow-black/50 mb-6 group">
                            <img 
                                src={crate.image} 
                                alt={crate.name} 
                                className="w-full object-contain group-hover:rotate-12 transition-transform duration-500" 
                            />
                    </div>
                    <h1 className="text-2xl font-bold text-center text-white mb-2">{crate.name}</h1>
                    <p className="text-neutral-500 text-sm text-center mb-6">Open this case to get a random CS2 skin.</p>
                    
                    {!showResult && (
                        <button 
                            onClick={handleOpen}
                            disabled={opening || !user || user.balance < caseCost}
                            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                                !user ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                : user.balance < caseCost ? 'bg-neutral-800 text-rose-500 cursor-not-allowed border border-rose-500/20'
                                : opening ? 'bg-emerald-600/50 text-emerald-200 cursor-wait'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(5,150,105,0.3)] hover:shadow-[0_0_30px_rgba(5,150,105,0.5)] border border-emerald-500/50 hover:-translate-y-1'
                            }`}
                        >
                            {!user ? "Sign In to Open"
                                : user.balance < caseCost ? "Insufficient Balance"
                                : opening ? "Opening..." 
                                : `Open Case - $${caseCost.toFixed(2)}`
                            }
                        </button>
                    )}
                    
                    {showResult && (
                        <div className="flex flex-col w-full gap-3">
                            <button 
                                onClick={handleReset}
                                className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg hover:-translate-y-1 transition-all"
                            >
                                Continue
                            </button>
                        </div>
                    )}
                </div>
                
                {/* Visualizer / Drops */}
                <div className="w-full lg:w-2/3 flex flex-col gap-8">
                     {/* Spinner Container */}
                     <div className="w-full bg-[#111111] border border-neutral-800 rounded-2xl h-[220px] relative overflow-hidden flex flex-col items-center justify-center shadow-inner pt-4 z-0">
                         {/* Tick mark */}
                         <div className="absolute top-0 bottom-0 left-1/2 -ml-0.5 w-[2px] bg-amber-400 z-20 shadow-[0_0_10px_rgba(251,191,36,1)]"></div>
                         
                         {(!opening && !showResult) && (
                              <div className="absolute inset-0 flex items-center justify-center text-neutral-600 font-mono text-xl z-30">
                                   READY TO SPIN
                              </div>
                         )}
                         
                         <div 
                             className="flex h-[150px] items-center gap-[10px] whitespace-nowrap absolute left-[50%] z-10" 
                             ref={reelRef}
                             style={{
                                  transform: 'translateX(0)',
                                  willChange: 'transform'
                             }}
                         >
                            {reelItems.map((item, index) => (
                                 <div 
                                      key={index} 
                                      className="w-[150px] h-[150px] flex-shrink-0 bg-neutral-900 border-b-4 flex flex-col justify-between items-center rounded-lg p-2"
                                      style={{ borderBottomColor: item.color || item.rarity?.color }}
                                 >
                                      <div className="h-3/4 w-full flex items-center justify-center overflow-hidden p-2">
                                           <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                                      </div>
                                      <div className="h-1/4 w-full flex flex-col justify-center items-center px-1">
                                          {item.phase && <span className="text-[8px] text-indigo-400 font-bold mb-0.5">{item.phase}</span>}
                                          {item.isStatTrak && <span className="text-[8px] text-orange-500 font-bold mb-0.5">StatTrak™</span>}
                                          <p className="text-[10px] text-neutral-300 w-full truncate text-center">{item.name}</p>
                                      </div>
                                 </div>
                            ))}
                         </div>
                     </div>
                     
                     {/* Result Modal / Display */}
                     <AnimatePresence>
                     {showResult && winningItem && (
                          <motion.div 
                              initial={{ opacity: 0, scale: 0.9, y: 20 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ type: "spring", bounce: 0.4 }}
                              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden"
                          >
                               <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent z-0"></div>
                               
                               <div className="z-10 w-48 h-48 mb-6 relative group">
                                    <div className="absolute inset-0 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"></div>
                                    <motion.img 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
                                        src={winningItem.image} alt={winningItem.name} 
                                        className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.5)] animate-pulse" 
                                    />
                               </div>
                               
                               <motion.h2 
                                   initial={{ y: 10, opacity: 0 }}
                                   animate={{ y: 0, opacity: 1 }}
                                   transition={{ delay: 0.3 }}
                                   className="text-3xl font-bold mb-1 z-10" style={{ color: winningItem.color }}
                               >
                                   {winningItem.name}
                               </motion.h2>
                               <motion.div 
                                   initial={{ y: 10, opacity: 0 }}
                                   animate={{ y: 0, opacity: 1 }}
                                   transition={{ delay: 0.4 }}
                                   className="flex flex-wrap items-center justify-center gap-2 mb-4 z-10 font-mono"
                               >
                                   {winningItem.condition && (
                                       <span className="text-neutral-400">{winningItem.condition}</span>
                                   )}
                                   {winningItem.float !== null && winningItem.float !== undefined && (
                                       <span className="bg-neutral-800 text-neutral-300 px-2 py-0.5 text-xs rounded">Float: {winningItem.float?.toFixed(4)}</span>
                                   )}
                                   {winningItem.pattern !== null && winningItem.pattern !== undefined && (
                                       <span className="bg-neutral-800 text-neutral-300 px-2 py-0.5 text-xs rounded">Pattern: {winningItem.pattern}</span>
                                   )}
                                   {winningItem.phase && (
                                       <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 text-xs rounded font-bold">{winningItem.phase}</span>
                                   )}
                                   {winningItem.isStatTrak && (
                                       <span className="bg-orange-500/20 text-orange-500 px-2 py-0.5 text-xs rounded font-bold">StatTrak™</span>
                                   )}
                               </motion.div>
                               <motion.div 
                                   initial={{ y: 10, opacity: 0 }}
                                   animate={{ y: 0, opacity: 1 }}
                                   transition={{ delay: 0.5 }}
                                   className="bg-neutral-950 px-6 py-3 rounded-full border border-neutral-800 z-10 flex items-center gap-4 shadow-inner"
                               >
                                   <div className="text-sm text-neutral-500">Value</div>
                                   <div className="text-2xl font-mono font-bold text-emerald-400">${winningItem.price.toFixed(2)}</div>
                               </motion.div>
                          </motion.div>
                     )}
                     </AnimatePresence>
                     
                     {/* Items inside case display */}
                     {!showResult && !opening && (
                         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                             <div className="flex justify-between items-end mb-4">
                                 <h3 className="text-lg font-bold text-white">Items in this case</h3>
                             </div>
                             
                             <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
                                  {crate.contains_rare && crate.contains_rare.length > 0 && (
                                      <div 
                                           className="bg-neutral-950 border-b-[3px] rounded-lg flex flex-col items-center justify-center text-center group hover:bg-neutral-800 transition-colors cursor-help pb-2"
                                           style={{ borderBottomColor: '#ffd700' }}
                                           title="★ Rare Special Item"
                                      >
                                           <div className="w-full aspect-square flex flex-col items-center justify-center p-2 mb-2 bg-gradient-to-br from-neutral-800/50 to-neutral-900/50 rounded drop-shadow-sm text-[#ffd700]">
                                                <span className="text-2xl font-black">★</span>
                                                <span className="text-xs font-bold mt-2">Rare Item</span>
                                           </div>
                                      </div>
                                  )}
                                  {contains.map((item: any) => (
                                       <div 
                                            key={item.id} 
                                            className="bg-neutral-950 border-b-[3px] rounded-lg p-2 flex flex-col items-center text-center group hover:bg-neutral-800 transition-colors"
                                            style={{ borderBottomColor: item.rarity?.color }}
                                       >
                                            <div className="w-full aspect-square flex items-center justify-center p-2 mb-2 bg-gradient-to-br from-neutral-800/50 to-neutral-900/50 rounded drop-shadow-sm">
                                                <img src={item.image} alt={item.name} className="w-full object-contain" loading="lazy" />
                                            </div>
                                            <p className="text-[10px] text-neutral-300 line-clamp-2 w-full leading-tight" title={item.name}>{item.name}</p>
                                       </div>
                                  ))}
                             </div>
                         </div>
                     )}
                </div>
            </div>
        </motion.div>
    );
}
