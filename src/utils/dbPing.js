import { FastDB } from "./fastDb.js";
import { performance } from "perf_hooks";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new FastDB(path.join(__dirname, "../../database/ping.db"));

async function getQuickDBPing() {
    const start = performance.now();
    await db.set("ping_test", Date.now());
    await db.get("ping_test");
    const end = performance.now();

    return Number((end - start).toFixed(2));
}

export default getQuickDBPing;