import { info, warn } from './logger.js';

let keepAliveInterval = null;

/**
 * Starts an automated keep-alive self-pinger to prevent cloud hosting platforms
 * (like Render Free tier) from putting the service to sleep after 15 minutes of inactivity.
 * 
 * @param {number|string} port 
 */
export function startKeepAlive(port) {
    const rawUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;

    if (!rawUrl) {
        if (process.env.RENDER) {
            info(`[KeepAlive] Render environment detected. Set KEEP_ALIVE_URL to your service's URL or configure UptimeRobot to ping this service every 5-10 minutes to prevent sleeping.`);
        }
        return;
    }

    let targetUrl = rawUrl.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `https://${targetUrl}`;
    }

    const pingEndpoint = targetUrl.endsWith('/') ? `${targetUrl}health` : `${targetUrl}/health`;

    info(`[KeepAlive] Continuous keep-alive engine active. Target: ${pingEndpoint} (interval: 8m)`);

    // Ping every 8 minutes (480,000 ms) - well before Render's 15-minute inactivity timeout
    const INTERVAL_MS = 8 * 60 * 1000;

    if (keepAliveInterval) clearInterval(keepAliveInterval);

    // Initial ping after 30 seconds to confirm connection
    setTimeout(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(pingEndpoint, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Roynix-Shield-KeepAlive/1.0' }
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                info(`[KeepAlive] Initial self-ping successful (${res.status} OK). Service is kept warm.`);
            }
        } catch (_) {}
    }, 30000);

    keepAliveInterval = setInterval(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(pingEndpoint, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Roynix-Shield-KeepAlive/1.0' }
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                info(`[KeepAlive] Heartbeat ping successful (${res.status} OK) at ${new Date().toLocaleTimeString()}`);
            } else {
                warn(`[KeepAlive] Heartbeat ping returned HTTP status ${res.status}`);
            }
        } catch (err) {
            warn(`[KeepAlive] Heartbeat ping warning: ${err.message}`);
        }
    }, INTERVAL_MS);
}

export default startKeepAlive;
