import fs from "fs";
import { WebhookClient, EmbedBuilder } from "discord.js";
import config from "../config/config.js";
import { error, info, warn, redactSecrets } from "../utils/logger.js";

const MAX_EMBED_FIELD_LENGTH = 1024;
const MAX_STACK_SLICE = 950;

/**
 * Safely extract and redact error stack or message without throwing on null/primitive values.
 * @param {any} err
 * @returns {string}
 */
export function formatAndRedactError(err) {
    let raw;
    if (err === null || err === undefined) {
        raw = String(err);
    } else if (typeof err === "string") {
        raw = err;
    } else if (err instanceof Error || typeof err === "object") {
        raw = err.stack || err.message || JSON.stringify(err);
    } else {
        raw = String(err);
    }
    const extraSecrets = [config?.token, config?.webhooks?.error, config?.lavalink?.auth].filter(Boolean);
    return redactSecrets(raw, extraSecrets);
}

/**
 * Build a Discord Embed for anti-crash reporting with guaranteed <= 1024 char field values.
 * Prevents @sapphire/shapeshift CombinedPropertyError crashes on long stack traces.
 * @param {string} errorType
 * @param {any} err
 * @returns {EmbedBuilder}
 */
export function buildErrorEmbed(errorType, err) {
    const safeType = redactSecrets(String(errorType || "Unknown Error")).slice(0, 240);
    const redactedStack = formatAndRedactError(err);
    const truncatedStack = redactedStack.length > MAX_STACK_SLICE
        ? `${redactedStack.slice(0, MAX_STACK_SLICE)}\n...[truncated]`
        : redactedStack;
    const fieldValue = `\`\`\`${truncatedStack || "No stack trace available"}\`\`\``.slice(0, MAX_EMBED_FIELD_LENGTH);

    return new EmbedBuilder()
        .setTitle("Anti-Crash Error Detected")
        .setColor("#ff0000")
        .addFields(
            { name: "Error Type", value: `\`${safeType}\`` },
            { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
            { name: "Stack Trace", value: fieldValue }
        )
        .setFooter({ text: "Anti-Crash System" });
}

/**
 * Log and optionally report an unhandled error without ever throwing or leaking secrets.
 * @param {string} errorType
 * @param {any} err
 * @param {{ logFilePath?: string | null, disableWebhook?: boolean, silentConsole?: boolean }} [options]
 */
export function logError(errorType, err, options = {}) {
    try {
        const redactedText = formatAndRedactError(err);
        const errorMsg = `[${new Date().toISOString()}] [${redactSecrets(errorType)}] ${redactedText}\n`;

        const targetLogPath = options.logFilePath !== undefined
            ? options.logFilePath
            : (process.env.ROYNIX_ERROR_LOG_PATH || "./errors.log");

        if (targetLogPath) {
            try {
                fs.appendFileSync(targetLogPath, errorMsg);
            } catch (_) {}
        }

        if (!options.silentConsole) {
            error(errorMsg.trimEnd());
        }

        const embed = buildErrorEmbed(errorType, redactedText);

        if (
            !options.disableWebhook &&
            config.webhooks?.error &&
            typeof config.webhooks.error === "string" &&
            config.webhooks.error.startsWith("https://")
        ) {
            const webhook = new WebhookClient({ url: config.webhooks.error });
            webhook.send({ embeds: [embed] }).catch(() => null);
        }
        return embed;
    } catch (_) {
        return null;
    }
}

export default async (client) => {
    process.on("unhandledRejection", (reason) => logError("Unhandled Rejection", reason));
    process.on("uncaughtException", (err) => logError("Uncaught Exception", err));
    process.on("uncaughtExceptionMonitor", (err) => logError("Uncaught Exception Monitor", err));
    process.on("warning", (w) => warn(`[Process Warning] ${w?.message || w}`));
    client.on("error", (err) => logError("Client Error", err));

    info("Anti-Crash Loaded Successfully");
};
