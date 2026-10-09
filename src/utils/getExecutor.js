import { PermissionFlagsBits } from 'discord.js';

/**
 * Ultra-low latency Audit Log Executor resolver
 * 1. Checks in-memory Gateway WebSocket cache (0ms)
 * 2. If not found, immediately queries REST audit logs with limit: 2
 * 3. Fast micro-wait (40ms) retry if Discord's backend hasn't written the entry yet
 * @param {import('discord.js').Guild} guild 
 * @param {AuditLogEvent} type 
 * @param {string} [targetId] 
 * @param {import('../base/Roynix.js').Roynix} [client]
 * @returns {Promise<import('discord.js').User | null>}
 */
async function getAuditExecutor(guild, type, targetId, client) {
    try {
        if (!guild || !type) return null;

        const now = Date.now();
        const botClient = client || guild.client;

        // 1. Instant in-memory cache check (0ms!)
        if (botClient?.auditLogCache) {
            if (targetId) {
                const cached = botClient.auditLogCache.get(`${guild.id}_${type}_${targetId}`);
                if (cached && now - cached.createdTimestamp < 8000 && cached.executor) {
                    return cached.executor;
                }
            }
            const cachedGeneral = botClient.auditLogCache.get(`${guild.id}_${type}_any`);
            if (cachedGeneral && now - cachedGeneral.createdTimestamp < 6000 && cachedGeneral.executor) {
                return cachedGeneral.executor;
            }
        }

        // 2. Parallel Race: WebSocket Gateway packet arrival vs Immediate REST audit fetch
        if (botClient) {
            const eventName = `auditLog_${guild.id}_${type}`;
            
            const wsPromise = new Promise((resolve) => {
                const onEntry = (data) => {
                    if (!targetId || data.targetId === targetId || data.targetId === 'any') {
                        resolve(data.executor);
                    }
                };
                botClient.once(eventName, onEntry);
                setTimeout(() => {
                    botClient.removeListener(eventName, onEntry);
                    resolve(null);
                }, 25);
            });

            const restPromise = (async () => {
                if (guild.members.me && !guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
                const fetchedLogs = await guild.fetchAuditLogs({ type, limit: 1 }).catch(() => null);
                const entry = fetchedLogs?.entries?.find(log => targetId ? log.target?.id === targetId : true);
                if (entry && (now - entry.createdTimestamp < 6000)) {
                    return entry.executor;
                }
                return null;
            })();

            const winner = await Promise.race([
                wsPromise.then(res => res ? res : new Promise(() => {})),
                restPromise.then(res => res ? res : new Promise(() => {})),
                new Promise(resolve => setTimeout(() => resolve(null), 35))
            ]);

            if (winner) return winner;

            const finalRest = await restPromise;
            if (finalRest) return finalRest;
        }

        return null;
    } catch (err) {
        return null;
    }
}

export { getAuditExecutor }