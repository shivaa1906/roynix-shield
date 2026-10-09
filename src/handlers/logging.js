import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { info, warn, error } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @param {import("discord.js").Client} client
 */
export default async (client) => {
    const loggingPath = path.join(__dirname, "../logging");
    const files = fs.readdirSync(loggingPath).filter(file => file.endsWith(".js"));

    for (const file of files) {
        const filePath = path.join(loggingPath, file);
        const fileURL = pathToFileURL(filePath);

        try {
            const { data } = await import(fileURL);

            if (!data || typeof data.execute !== "function") {
                warn(`Skipping invalid Logging file: ${file}`);
                continue;
            }

            await data.execute(client);
            info(`Loaded Logging Handler: ${file}`);
        } catch (err) {
            error(`Failed to load Logging file: ${file}`);
            error(`Path: ${filePath}`);
            error(err?.stack || err);
        }
    }
};
