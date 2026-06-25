async function run() {
    try {
        const res = await fetch("https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json");
        const crates = await res.json();
        const caseWithRare = crates.find((c: any) => c.name === "Chroma 2 Case");
        console.log("Keys:", Object.keys(caseWithRare || {}));
        console.log("contains-rare sample:", caseWithRare?.contains_rare?.[0]);
    } catch(e) {}
}
run();
