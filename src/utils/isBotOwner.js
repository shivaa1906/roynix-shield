import config from "../config/config.js";

export function isBotOwner(userId) {
    return config.owners?.includes(userId) || config.developers?.includes(userId) || false;
}
