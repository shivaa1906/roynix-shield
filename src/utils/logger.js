import chalk from "chalk";

const DISCORD_TOKEN_REGEX = /[MN][A-Za-z\d]{23,28}\.[\w-]{6}\.[\w-]{27,38}/g;
const DISCORD_WEBHOOK_REGEX = /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/gi;
const AUTH_HEADER_REGEX = /(Authorization\s*[:=]\s*(?:Bot|Bearer)\s+)[^\s"',;]+/gi;

/**
 * Redact Discord bot/user tokens, webhook URLs, auth headers, and environment secrets from log strings.
 * @param {any} input
 * @param {string[]} [extraSecrets]
 * @returns {string}
 */
export function redactSecrets(input, extraSecrets = []) {
    if (input === null || input === undefined) return String(input);
    let text = typeof input === "string"
        ? input
        : (input instanceof Error ? (input.stack || input.message || String(input)) : String(input));

    const envToken = process.env.TOKEN;
    if (typeof envToken === "string" && envToken.trim().length >= 8) {
        text = text.split(envToken.trim()).join("[REDACTED_ENV_TOKEN]");
    }

    if (Array.isArray(extraSecrets)) {
        for (const secret of extraSecrets) {
            if (typeof secret === "string" && secret.trim().length >= 8) {
                text = text.split(secret.trim()).join("[REDACTED_SECRET]");
            }
        }
    }

    text = text
        .replace(DISCORD_TOKEN_REGEX, "[REDACTED_TOKEN]")
        .replace(DISCORD_WEBHOOK_REGEX, "https://discord.com/api/webhooks/[REDACTED_WEBHOOK]")
        .replace(AUTH_HEADER_REGEX, "$1[REDACTED]");

    return text;
}

export function warn(message) {
    console.log(chalk.yellowBright(`[WARNING]: [${new Date().toISOString()}] ${redactSecrets(message)}`));
}

export function info(message) {
    console.log(chalk.greenBright(`[INFO]: [${new Date().toISOString()}] ${redactSecrets(message)}`));
}

export function error(message) {
    console.log(chalk.redBright(`[ERROR]: [${new Date().toISOString()}] ${redactSecrets(message)}`));
}
