import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getCrates } from "../services/api";
import { steamImg } from "../lib/steam";
import type { LayoutContext } from "../components/Layout";

const CASE_COST = 2.5;

/** A rotation of classic CS rarity colors — gives the wall of cases the
 *  same varied accent spines as the design mock. */
const CARD_TONES = ["#f0902a", "#eb4b4b", "#4b69ff", "#8847ff", "#e7b13a", "#d32ce6"];

type Filter = "everything" | "cases" | "capsules";

const TABS: { id: Filter; label: string }[] = [
    { id: "everything", label: "Everything" },
    { id: "cases", label: "Cases" },
    { id: "capsules", label: "Capsules" },
];

function SkeletonGrid() {
    return (
        <div className="uo-grid" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
                <div className="uo-skel-card" key={i}>
                    <div className="uo-skel-art" />
                    <div className="uo-skel-line" />
                    <div className="uo-skel-price" />
                </div>
            ))}
        </div>
    );
}

export default function Home({ user }: { user: any }) {
    const { openAuth } = useOutletContext<LayoutContext>();
    const [crates, setCrates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>("everything");

    const load = () => {
        setLoading(true);
        setError(null);
        getCrates()
            .then((data) => {
                setCrates(data.map((crate: any, i: number) => ({
                    ...crate,
                    tone: CARD_TONES[i % CARD_TONES.length],
                })));
            })
            .catch((err) => {
                console.error(err);
                setError("Couldn't load the cases feed. Check your connection and try again.");
            })
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const visible = useMemo(() => {
        if (filter === "cases") return crates.filter((c) => c.type === "Case");
        if (filter === "capsules") return crates.filter((c) => c.type !== "Case");
        return crates;
    }, [crates, filter]);

    return (
        <div className="uo-page">
            <div className="uo-page-head">
                <h1 className="uo-title">Cases &amp; Capsules</h1>
                <p className="uo-sub">
                    Open cases and capsules with your virtual balance. No real money required.
                </p>
            </div>

            {!user && (
                <div className="uo-notice">
                    <span>Sign in to open cases and keep your pulls in your inventory.</span>
                    <button className="uo-link-btn" onClick={openAuth}>Sign In</button>
                </div>
            )}

            <div className="uo-tabs" role="tablist" aria-label="Filter containers">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={filter === tab.id}
                        className={"uo-tab" + (filter === tab.id ? " is-active" : "")}
                        onClick={() => setFilter(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading && <SkeletonGrid />}

            {!loading && error && (
                <div className="uo-error">
                    {error}{" "}
                    <button className="uo-link-btn" onClick={load}>Retry</button>
                </div>
            )}

            {!loading && !error && (
                <>
                    <div className="uo-grid uo-fade" key={filter}>
                        {visible.map((crate) => (
                            <Link
                                key={crate.id}
                                to={`/case/${crate.id}`}
                                className="uo-card"
                                style={{ borderBottomColor: crate.tone }}
                                title={crate.name}
                            >
                                <div className="uo-card-art">
                                    <img
                                        src={steamImg(crate.image)}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </div>
                                <span className="uo-card-name">{crate.name}</span>
                                <span className="uo-card-price">${CASE_COST.toFixed(2)}</span>
                            </Link>
                        ))}
                    </div>

                    {visible.length === 0 && (
                        <div className="uo-empty">
                            <strong>Nothing here yet</strong>
                            Try another filter.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
