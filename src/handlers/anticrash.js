import fs from "fs";
import { WebhookClient, EmbedBuilder } from "discord.js";
import config from "../config/config.js";
import { error, info, warn } from "../utils/logger.js";
import chalk from "chalk";

function logError(errorType, err) {
    const errorMsg = `[${new Date().toLocaleString()}] [${errorType}] ${err.stack || err}\n`;

    fs.appendFileSync("./errors.log", errorMsg);
    error(errorMsg);

    const embed = new EmbedBuilder()
        .setTitle("Anti-Crash Error Detected")
        .setColor("#ff0000")
        .addFields(
            { name: "Error Type", value: `\`${errorType}\`` },
            { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
            { name: "Stack Trace", value: `\`\`\`${err.stack ? err.stack.slice(0, 4000) : err}\`\`\`` }
        )
        .setFooter({ text: "Anti-Crash System" });

    try {
        if (config.webhooks?.error && typeof config.webhooks.error === 'string' && config.webhooks.error.startsWith('https://')) {
            const webhook = new WebhookClient({ url: config.webhooks.error });
            webhook.send({ embeds: [embed] }).catch(() => null);
        }
    } catch (_) {}
}

export default async (client) => {
    process.on("unhandledRejection", (reason) => logError("Unhandled Rejection", reason));
    process.on("uncaughtException", (err) => logError("Uncaught Exception", err));
    process.on("uncaughtExceptionMonitor", (err) => logError("Uncaught Exception Monitor", err));
    process.on("warning", (w) => warn(`[Process Warning] ${w?.message || w}`));
    client.on("error", (err) => logError("Client Error", err));

    info("Anti-Crash Loaded Successfully");
};
