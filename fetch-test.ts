async function run() {
    try {
        const res = await fetch("https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json");
        const crates = await res.json();
        // find a standard weapon case
        const csgoCase = crates.find(c => c.name.includes("Case"));
        console.log("Crate:");
        console.log(JSON.stringify(csgoCase, null, 2));
    } catch(e) {}
}
run();
