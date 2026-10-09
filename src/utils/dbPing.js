import { QuickDB } from "quick.db";
import { performance } from "perf_hooks";

const db = new QuickDB();

async function getQuickDBPing() {
    const start = performance.now();
    await db.set("ping_test", Date.now()); 
    const end = performance.now();
    
    return Math.round(end - start); 
}

export default getQuickDBPing