import { PermissionFlagsBits } from 'discord.js';

const DISCORD_EPOCH = 1420070400000n;

/**
 * Decode timestamp from a Discord snowflake ID if createdTimestamp is absent.
 * @param {string | null | undefined} id
 * @returns {number | null}
 */
export function decodeSnowflakeTimestamp(id) {
    if (!id || typeof id !== 'string' || !/^\d{15,21}$/.test(id)) return null;
    try {
        return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
    } catch {
        return null;
    }
}

/**
 * Check whether an audit log entry timestamp is within the allowed freshness window.
 * @param {number | null | undefined} entryTimestamp
 * @param {number} now
 * @param {number} maxAgeMs
 * @returns {boolean}
 */
export function isAuditEntryFresh(entryTimestamp, now = Date.now(), maxAgeMs = 10000) {
    if (typeof entryTimestamp !== 'number' || Number.isNaN(entryTimestamp)) return false;
    const age = now - entryTimestamp;
    return age >= -5000 && age <= maxAgeMs;
}

/**
 * Resolve an executor object even when uncached in large servers, preserving auditEntryId.
 * @param {import('discord.js').Guild} guild
 * @param {any} entry
 * @param {string | null} [auditEntryIdOverride]
 */
export function resolveEntryExecutor(guild, entry, auditEntryIdOverride = null) {
    if (!entry) return null;
    const rawExec = entry.executor || null;
    const execId = rawExec?.id || entry.executorId || entry.user_id || null;
    if (!execId) return null;

    const cachedUser = guild?.client?.users?.cache?.get?.(execId) || null;
    const baseUser = rawExec || cachedUser || {
        id: String(execId),
        tag: `User#${String(execId).slice(-4)}`
    };

    const auditEntryId = auditEntryIdOverride || entry.auditEntryId || entry.id || null;
    if (auditEntryId && baseUser && typeof baseUser === 'object') {
        try {
            return Object.assign(Object.create(Object.getPrototypeOf(baseUser)), baseUser, {
                id: String(execId),
                tag: baseUser.tag || baseUser.username || `User#${String(execId).slice(-4)}`,
                auditEntryId: String(auditEntryId)
            });
        } catch {
            return {
                id: String(execId),
                tag: baseUser.tag || baseUser.username || `User#${String(execId).slice(-4)}`,
                auditEntryId: String(auditEntryId)
            };
        }
    }
    return baseUser;
}

/**
 * Normalize collection/map/array of audit log entries into an array.
 * @param {any} entries
 * @returns {Array<any>}
 */
function toEntryArray(entries) {
    if (!entries) return [];
    if (Array.isArray(entries)) return entries;
    if (typeof entries.values === 'function') {
        return Array.from(entries.values());
    }
    return [];
}

/**
 * Strictly select a matching audit log entry for (guildId, type, targetId) within maxAgeMs.
 * Never falls back to a wildcard or newest entry when targetId is specified and does not match.
 * Detects ambiguous concurrent entries with different executors for the same target.
 */
export function selectMatchingAuditEntry(entries, {
    type,
    targetId = null,
    hasSpecificTarget = false,
    now = Date.now(),
    maxAgeMs = 10000,
    ambiguityWindowMs = 1000
}) {
    const list = toEntryArray(entries);
    const matches = [];

    for (const log of list) {
        if (!log) continue;
        if (log.action !== undefined && log.action !== type) continue;

        const ts = log.createdTimestamp ?? decodeSnowflakeTimestamp(log.id);
        if (!isAuditEntryFresh(ts, now, maxAgeMs)) continue;

        const logTargetId = log.target?.id ?? log.targetId ?? null;
        if (hasSpecificTarget) {
            if (logTargetId == null || String(logTargetId) !== String(targetId)) {
                continue;
            }
        } else if (logTargetId != null && logTargetId !== 'targetless') {
            continue;
        }

        const execId = log.executor?.id || log.executorId || log.user_id || null;
        if (!execId) continue;

        matches.push({
            log,
            execId: String(execId),
            ts
        });
    }

    if (matches.length === 0) {
        return { status: 'not_found', entry: null };
    }

    matches.sort((a, b) => b.ts - a.ts);

    if (matches.length > 1) {
        const newest = matches[0];
        for (let i = 1; i < matches.length; i++) {
            const candidate = matches[i];
            if (Math.abs(newest.ts - candidate.ts) <= ambiguityWindowMs && newest.execId !== candidate.execId) {
                return { status: 'ambiguous', entry: null };
            }
        }
    }

    return { status: 'matched', entry: matches[0].log };
}

/**
 * Strict, bounded-retry Audit Log Executor resolver.
 * - Strictly matches guild, action type, targetId, and freshness window.
 * - Never uses wildcard (`_any`) or newest mismatched `.first()` entries for target-specific events.
 * - Coalesces raw HTTP fetches by `${guild.id}_${type}` while filtering per caller's exact `targetId`.
 * - Handles delayed audit logs via bounded retries without guessing.
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').AuditLogEvent} type
 * @param {string | null} [targetId]
 * @param {import('../base/Roynix.js').Roynix} [client]
 * @param {{ maxAgeMs?: number, retries?: number, retryDelayMs?: number, wsWaitMs?: number }} [options]
 * @returns {Promise<import('discord.js').User | null>}
 */
async function getAuditExecutor(guild, type, targetId = null, client = null, options = {}) {
    try {
        if (!guild || !type) return null;

        const botClient = client || guild.client;
        const maxAgeMs = options.maxAgeMs ?? 10000;
        const maxRetries = options.retries ?? 2;
        const retryDelayMs = options.retryDelayMs ?? 150;
        const wsWaitMs = options.wsWaitMs ?? 75;

        const hasSpecificTarget = targetId !== undefined && targetId !== null && targetId !== 'any';
        const normalizedTargetId = hasSpecificTarget ? String(targetId) : null;
        const cacheKey = hasSpecificTarget
            ? `${guild.id}_${type}_${normalizedTargetId}`
            : `${guild.id}_${type}_targetless`;

        const checkCache = (nowTs) => {
            if (!botClient?.auditLogCache) return undefined;
            const cached = botClient.auditLogCache.get(cacheKey);
            if (!cached) return undefined;
            if (cached.guildId && cached.guildId !== guild.id) return undefined;
            if (cached.action !== undefined && cached.action !== type) return undefined;
            if (!isAuditEntryFresh(cached.createdTimestamp, nowTs, maxAgeMs)) {
                botClient.auditLogCache.delete(cacheKey);
                return undefined;
            }
            if (hasSpecificTarget && String(cached.targetId) !== normalizedTargetId) {
                return undefined;
            }
            if (cached.ambiguous) {
                return null;
            }
            const resolved = resolveEntryExecutor(guild, cached, cached.auditEntryId);
            return resolved || undefined;
        };

        // 1. Instant strict cache check
        const initialCached = checkCache(Date.now());
        if (initialCached !== undefined) {
            return initialCached;
        }

        if (!botClient) return null;

        const eventName = `auditLog_${guild.id}_${type}`;

        const waitForWsEntry = (timeoutMs) => new Promise((resolve) => {
            if (typeof botClient.on !== 'function' || typeof botClient.removeListener !== 'function') {
                resolve(null);
                return;
            }
            let settled = false;
            const onEntry = (data) => {
                if (!data || data.guildId !== guild.id || data.action !== type) return;
                if (!isAuditEntryFresh(data.createdTimestamp, Date.now(), maxAgeMs)) return;

                if (hasSpecificTarget) {
                    if (data.targetId == null || String(data.targetId) !== normalizedTargetId) return;
                } else if (data.targetId != null && data.targetId !== 'targetless') {
                    return;
                }

                settled = true;
                botClient.removeListener(eventName, onEntry);
                if (data.ambiguous) {
                    resolve({ status: 'ambiguous', executor: null });
                    return;
                }
                const exec = resolveEntryExecutor(guild, data, data.auditEntryId);
                resolve(exec ? { status: 'matched', executor: exec } : null);
            };

            botClient.on(eventName, onEntry);
            setTimeout(() => {
                if (!settled) {
                    botClient.removeListener(eventName, onEntry);
                    resolve(null);
                }
            }, timeoutMs).unref?.();
        });

        const fetchAndSelectFromRest = async () => {
            if (guild.members?.me && !guild.members.me.permissions?.has?.(PermissionFlagsBits.ViewAuditLog)) {
                return { status: 'no_permission', executor: null };
            }
            if (typeof guild.fetchAuditLogs !== 'function') {
                return { status: 'not_found', executor: null };
            }

            if (!botClient._auditFetchPromises) botClient._auditFetchPromises = new Map();
            const fetchKey = `${guild.id}_${type}`;
            let inFlight = botClient._auditFetchPromises.get(fetchKey);
            if (!inFlight) {
                inFlight = Promise.resolve(guild.fetchAuditLogs({ type, limit: 20 }))
                    .catch(() => null)
                    .finally(() => {
                        botClient._auditFetchPromises.delete(fetchKey);
                    });
                botClient._auditFetchPromises.set(fetchKey, inFlight);
            }

            const fetchedLogs = await inFlight;
            if (!fetchedLogs?.entries) {
                return { status: 'not_found', executor: null };
            }

            const nowTs = Date.now();

            // Hydrate exact-target cache entries from batch response without wildcard pollution
            if (botClient.auditLogCache) {
                const rawEntries = toEntryArray(fetchedLogs.entries);
                for (const log of rawEntries) {
                    if (!log) continue;
                    const ts = log.createdTimestamp ?? decodeSnowflakeTimestamp(log.id);
                    if (!isAuditEntryFresh(ts, nowTs, maxAgeMs)) continue;

                    const exec = resolveEntryExecutor(guild, log, log.id);
                    if (!exec) continue;

                    const logTargetId = log.target?.id ?? log.targetId ?? null;
                    const exactKey = logTargetId != null
                        ? `${guild.id}_${type}_${logTargetId}`
                        : `${guild.id}_${type}_targetless`;

                    const existingCached = botClient.auditLogCache.get(exactKey);
                    if (
                        existingCached &&
                        existingCached.executor?.id &&
                        existingCached.executor.id !== exec.id &&
                        Math.abs((existingCached.createdTimestamp || nowTs) - ts) <= 1000
                    ) {
                        botClient.auditLogCache.set(exactKey, {
                            ...existingCached,
                            ambiguous: true
                        });
                        continue;
                    }

                    botClient.auditLogCache.set(exactKey, {
                        guildId: guild.id,
                        action: type,
                        targetId: logTargetId != null ? String(logTargetId) : 'targetless',
                        auditEntryId: log.id || null,
                        executor: exec,
                        createdTimestamp: ts
                    });
                }

                if (botClient.auditLogCache.size > 2000) {
                    for (const [k, v] of botClient.auditLogCache.entries()) {
                        if (!isAuditEntryFresh(v?.createdTimestamp, nowTs, maxAgeMs)) {
                            botClient.auditLogCache.delete(k);
                        }
                    }
                    while (botClient.auditLogCache.size > 2000) {
                        const oldestKey = botClient.auditLogCache.keys().next().value;
                        if (oldestKey === undefined) break;
                        botClient.auditLogCache.delete(oldestKey);
                    }
                }
            }

            const selection = selectMatchingAuditEntry(fetchedLogs.entries, {
                type,
                targetId: normalizedTargetId,
                hasSpecificTarget,
                now: nowTs,
                maxAgeMs
            });

            if (selection.status === 'ambiguous') {
                return { status: 'ambiguous', executor: null };
            }
            if (selection.status === 'matched' && selection.entry) {
                const resolved = resolveEntryExecutor(guild, selection.entry, selection.entry.id);
                return { status: resolved ? 'matched' : 'not_found', executor: resolved };
            }
            return { status: 'not_found', executor: null };
        };

        // 2. Bounded attempts to handle delayed audit-log indexing safely without guessing
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const cachedNow = checkCache(Date.now());
            if (cachedNow !== undefined) {
                return cachedNow;
            }

            const wsTask = waitForWsEntry(wsWaitMs);
            const restTask = fetchAndSelectFromRest();

            const restOutcome = await restTask;
            if (restOutcome.status === 'ambiguous' || restOutcome.status === 'no_permission') {
                return null;
            }
            if (restOutcome.status === 'matched' && restOutcome.executor) {
                return restOutcome.executor;
            }

            const wsOutcome = await wsTask;
            if (wsOutcome?.status === 'ambiguous') {
                return null;
            }
            if (wsOutcome?.status === 'matched' && wsOutcome.executor) {
                return wsOutcome.executor;
            }

            if (attempt < maxRetries) {
                const retryWait = await waitForWsEntry(retryDelayMs);
                if (retryWait?.status === 'ambiguous') {
                    return null;
                }
                if (retryWait?.status === 'matched' && retryWait.executor) {
                    return retryWait.executor;
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}

export { getAuditExecutor };