import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from './isBotOwner.js';
import { evaluateActorTrust } from './securityPolicy.js';
import { neutralizeBotDangerousRoles } from '../antinuke/zeroTrustQuarantine.js';
import emojis from '../config/emojis.js';

const LOCKDOWN_RESTRICTED_EVERYONE_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.Connect
];

const LOCKDOWN_RESTRICTED_MASK = LOCKDOWN_RESTRICTED_EVERYONE_PERMS.reduce(
    (mask, bit) => mask | BigInt(bit),
    0n
);

function toValuesArray(collectionOrMap) {
    if (!collectionOrMap) return [];
    if (Array.isArray(collectionOrMap)) return collectionOrMap;
    if (typeof collectionOrMap.values === 'function') return Array.from(collectionOrMap.values());
    return [];
}

function getPermissionsBitfield(permissions) {
    if (permissions == null) return null;
    if (typeof permissions === 'bigint') return permissions;
    if (typeof permissions.bitfield === 'bigint') return permissions.bitfield;
    if (typeof permissions.bitfield === 'number') return BigInt(permissions.bitfield);
    return null;
}

class CircuitBreaker {
    constructor() {
        /** @type {Map<string, number[]>} guildId -> incident timestamps */
        this.incidentTracker = new Map();
        /** @type {Map<string, number>} dedupeKey -> timestamp */
        this.seenIncidents = new Map();
        /** @type {Map<string, object>} guildId -> lockdown state */
        this.lockdownState = new Map();
        this.defaultLockdownDurationMs = 60 * 1000;
        this.incidentDedupeWindowMs = 10 * 1000;
        this.maxTrackedGuilds = 1000;
        this.maxSeenIncidents = 2000;
    }

    /**
     * Sweep expired deduplication keys and burst timestamps, enforcing hard upper bounds.
     * @param {number} [now]
     */
    sweep(now = Date.now()) {
        for (const [key, val] of this.seenIncidents.entries()) {
            const ts = typeof val === 'object' && val !== null ? val.ts : val;
            if (now - ts > this.incidentDedupeWindowMs) {
                this.seenIncidents.delete(key);
            }
        }
        while (this.seenIncidents.size > this.maxSeenIncidents) {
            const oldestKey = this.seenIncidents.keys().next().value;
            if (oldestKey === undefined) break;
            this.seenIncidents.delete(oldestKey);
        }

        for (const [guildId, timestamps] of this.incidentTracker.entries()) {
            const filtered = Array.isArray(timestamps)
                ? timestamps.filter((t) => now - t < 2000)
                : [];
            if (filtered.length === 0) {
                this.incidentTracker.delete(guildId);
            } else {
                this.incidentTracker.set(guildId, filtered);
            }
        }
        while (this.incidentTracker.size > this.maxTrackedGuilds) {
            const oldestGuild = this.incidentTracker.keys().next().value;
            if (oldestGuild === undefined) break;
            this.incidentTracker.delete(oldestGuild);
        }

        for (const [guildId, state] of this.lockdownState.entries()) {
            if (!state || state.restored || (now > state.until && !state.restoringPromise)) {
                if (state?.guild && state.active) {
                    this.restoreLockdown(state.guild, state.client).catch(() => null);
                } else {
                    this.lockdownState.delete(guildId);
                }
            }
        }
    }

    /**
     * Sweep expired deduplication keys to keep memory bounded
     * @param {number} now
     */
    _sweepSeenIncidents(now = Date.now()) {
        if (this.seenIncidents.size > 250 || this.incidentTracker.size > 250) {
            this.sweep(now);
        }
    }

    /**
     * Check if guild is currently in emergency lockdown
     * @param {string} guildId
     * @returns {boolean}
     */
    isLockedDown(guildId) {
        const state = this.lockdownState.get(guildId);
        if (!state || !state.active) return false;
        if (Date.now() > state.until) {
            if (state.guild) {
                this.restoreLockdown(state.guild, state.client).catch(() => null);
            } else {
                this.lockdownState.delete(guildId);
            }
            return false;
        }
        return true;
    }

    /**
     * Record a verified destructive incident and trip the circuit breaker if a burst attack is detected.
     * Prevents duplicate counting of the same incident and exempts trusted actors.
     *
     * @param {import('discord.js').Guild} guild
     * @param {import('../base/Roynix.js').Roynix} client
     * @param {string} actionName
     * @param {import('discord.js').User | { id: string, auditEntryId?: string }} [executor]
     * @param {string | { incidentKey?: string, auditEntryId?: string, targetId?: string, moduleKey?: string, lockdownDurationMs?: number }} [options]
     * @returns {Promise<boolean>} True if the incident was counted
     */
    async recordIncident(guild, client, actionName, executor = null, options = null) {
        if (!guild?.id || !client) return false;
        const guildId = guild.id;
        const now = Date.now();

        // 1. Fetch antinuke settings
        const antinukeData = await client.getAntinukeData?.(guildId);
        if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('circuitBreaker')) {
            return false;
        }

        // 2. Require a confirmed untrusted executor (never trip lockdown on trusted or unattributed actions)
        if (!executor?.id) return false;
        const opts = typeof options === 'string' ? { incidentKey: options } : (options || {});
        const trust = evaluateActorTrust({
            guild,
            client,
            antinukeData,
            moduleKey: opts.moduleKey || null,
            executorId: String(executor.id),
            targetId: opts.targetId || null
        });
        if (trust.trustState !== 'untrusted') {
            return false;
        }

        // 3. Deduplicate by incidentKey / auditEntryId / targetId so a single action never counts twice
        this._sweepSeenIncidents(now);
        const auditEntryId = opts.auditEntryId || executor.auditEntryId || null;
        const normalizedAction = opts.moduleKey || actionName;
        const strictKeys = [];
        if (opts.incidentKey) strictKeys.push(`${guildId}:inc:${opts.incidentKey}`);
        if (auditEntryId) strictKeys.push(`${guildId}:audit:${auditEntryId}`);

        for (const key of strictKeys) {
            const prevVal = this.seenIncidents.get(key);
            const prevTs = typeof prevVal === 'object' && prevVal !== null ? prevVal.ts : prevVal;
            if (prevTs && (now - prevTs) <= this.incidentDedupeWindowMs) {
                return false;
            }
        }

        const targetKey = opts.targetId
            ? `${guildId}:target:${normalizedAction}:${opts.targetId}:${executor.id}`
            : null;
        if (targetKey) {
            const prevTarget = this.seenIncidents.get(targetKey);
            if (prevTarget) {
                const prevTs = typeof prevTarget === 'object' ? prevTarget.ts : prevTarget;
                const prevAuditId = typeof prevTarget === 'object' ? prevTarget.auditEntryId : null;
                const hasConflictingAudit = Boolean(prevAuditId && auditEntryId && prevAuditId !== auditEntryId);
                if (!hasConflictingAudit && prevTs && (now - prevTs) <= this.incidentDedupeWindowMs) {
                    return false;
                }
            }
        }

        for (const key of strictKeys) {
            this.seenIncidents.set(key, now);
        }
        if (targetKey) {
            this.seenIncidents.set(targetKey, { ts: now, auditEntryId });
        }

        // 4. Track incident timestamps in memory (2-second burst window)
        let timestamps = (this.incidentTracker.get(guildId) || []).filter((t) => now - t < 2000);
        timestamps.push(now);
        this.incidentTracker.set(guildId, timestamps);

        // Burst threshold: 2 or more distinct destructive attacks within 2 seconds
        if (timestamps.length >= 2 && !this.isLockedDown(guildId)) {
            await this.tripBreaker(guild, client, antinukeData, actionName, executor, opts);
        }
        return true;
    }

    /**
     * Trip the circuit breaker: trigger scoped emergency lockdown and schedule safe restoration
     * @param {import('discord.js').Guild} guild
     * @param {import('../base/Roynix.js').Roynix} client
     * @param {object} antinukeData
     * @param {string} triggerAction
     * @param {import('discord.js').User} executor
     * @param {{ lockdownDurationMs?: number }} [options]
     */
    async tripBreaker(guild, client, antinukeData, triggerAction, executor, options = {}) {
        if (!guild?.id) return false;
        const guildId = guild.id;

        // Idempotency guard: if already in active lockdown, never overwrite pre-lockdown baseline
        if (this.isLockedDown(guildId)) {
            return false;
        }

        const lockdownDuration = options?.lockdownDurationMs ?? this.defaultLockdownDurationMs;
        const everyoneRole = guild.roles?.everyone || guild.roles?.cache?.get?.(guildId) || null;
        const originalEveryonePermissions = getPermissionsBitfield(everyoneRole?.permissions);
        const originalVerificationLevel = typeof guild.verificationLevel === 'number'
            ? guild.verificationLevel
            : null;

        const state = {
            active: true,
            until: Date.now() + lockdownDuration,
            guild,
            client,
            originalVerificationLevel,
            verificationElevated: false,
            originalEveryonePermissions,
            everyoneModified: false,
            restoringPromise: null,
            restored: false,
            timer: null
        };
        this.lockdownState.set(guildId, state);

        const extraOwners = antinukeData?.extraOwners || [];
        const whitelisted = antinukeData?.whitelisted || {};

        const tasks = [];

        // 1. Multi-Bot Quarantine: Neutralize non-whitelisted bots (handles managed OAuth2 roles safely)
        tasks.push((async () => {
            let quarantinedBots = 0;
            const members = toValuesArray(guild.members?.cache);
            const bots = members.filter((m) => m?.user?.bot && m.id !== client?.user?.id);

            await Promise.all(
                bots.map(async (botMember) => {
                    if (isBotOwner(botMember.id) || extraOwners.includes(botMember.id) || whitelisted[botMember.id]) {
                        return;
                    }
                    const rolesToNeutralize = toValuesArray(botMember.roles?.cache).filter(
                        (r) => r && r.id !== guildId
                    );
                    if (rolesToNeutralize.length === 0) return;

                    const { modified } = await neutralizeBotDangerousRoles(
                        botMember,
                        rolesToNeutralize,
                        'Roynix Circuit Breaker | Emergency Coordinated Raid Lockdown'
                    );
                    if (modified) {
                        quarantinedBots += 1;
                    }
                })
            );
            return quarantinedBots;
        })());

        // 2. Scoped @everyone Lockdown: Strip raid/destructive permissions while preserving ViewChannel/ReadMessageHistory
        tasks.push((async () => {
            try {
                if (
                    everyoneRole &&
                    everyoneRole.editable !== false &&
                    typeof everyoneRole.setPermissions === 'function' &&
                    originalEveryonePermissions !== null
                ) {
                    const scopedPerms = originalEveryonePermissions & ~LOCKDOWN_RESTRICTED_MASK;
                    if (scopedPerms !== originalEveryonePermissions) {
                        const res = await Promise.resolve(
                            everyoneRole.setPermissions(scopedPerms, 'Roynix Circuit Breaker | Scoped Lockdown Containment')
                        ).catch(() => null);
                        if (res !== null && res !== false) {
                            state.everyoneModified = true;
                            return true;
                        }
                    }
                }
            } catch {}
            return false;
        })());

        // 3. Elevate verification level to VERY_HIGH (4) to block alt accounts and automated raids
        tasks.push((async () => {
            try {
                if (
                    typeof guild.verificationLevel === 'number' &&
                    guild.verificationLevel < 4 &&
                    typeof guild.setVerificationLevel === 'function'
                ) {
                    const res = await Promise.resolve(
                        guild.setVerificationLevel(4, 'Roynix Circuit Breaker | Raid Burst Lockdown')
                    ).catch(() => null);
                    if (res !== null && res !== false) {
                        state.verificationElevated = true;
                        return true;
                    }
                }
            } catch {}
            return false;
        })());

        // 4. Purge recent unauthorized webhooks (created in last 10 minutes) in parallel
        tasks.push((async () => {
            const whPromises = [];
            let purgedWebhooks = 0;
            try {
                if (typeof guild.fetchWebhooks === 'function') {
                    const webhooks = await guild.fetchWebhooks().catch(() => null);
                    const list = toValuesArray(webhooks);
                    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
                    for (const wh of list) {
                        if (!wh) continue;
                        const ownerId = wh.owner?.id || wh.user?.id || null;
                        if (ownerId && (ownerId === guild.ownerId || isBotOwner(ownerId) || extraOwners.includes(ownerId))) {
                            continue;
                        }
                        if (!wh.createdTimestamp || wh.createdTimestamp > tenMinutesAgo) {
                            if (typeof wh.delete === 'function') {
                                purgedWebhooks += 1;
                                whPromises.push(
                                    Promise.resolve(wh.delete('Roynix Circuit Breaker | Unauthorized Webhook Purge')).catch(() => null)
                                );
                            }
                        }
                    }
                }
                await Promise.all(whPromises);
            } catch {}
            return purgedWebhooks;
        })());

        const [quarantinedBots, everyoneScoped, verificationElevated, purgedWebhooks] = await Promise.all(tasks);

        // Schedule automatic safe restoration when lockdown window expires
        state.timer = setTimeout(() => {
            this.restoreLockdown(guild, client).catch(() => null);
        }, lockdownDuration);
        state.timer.unref?.();

        // 5. Send High-Priority Incident Notification
        const logChannelId = antinukeData?.logsChannel;
        if (logChannelId) {
            const logChannel = guild.channels?.cache?.get?.(logChannelId)
                || await guild.channels?.fetch?.(logChannelId)?.catch(() => null);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 CIRCUIT BREAKER TRIPPED: EMERGENCY SERVER LOCKDOWN')
                    .setDescription(
                        `**Rapid Coordinated Raid Detected!**\n` +
                        `Multiple destructive moderation actions occurred within 2 seconds.\n\n` +
                        `__**Emergency Containment Measures Engaged:**__\n` +
                        `> ${emojis.shield} **Trigger Event**: \`${triggerAction}\`\n` +
                        `> ${emojis.user} **Attacker**: ${executor ? `<@${executor.id}> (${executor.tag || executor.id})` : 'Unknown Entity'}\n` +
                        `> ${emojis.bot || '🤖'} **Unwhitelisted Bots Quarantined**: \`${quarantinedBots}\`\n` +
                        `> ${emojis.tick} **@everyone Scoped Lockdown**: \`${everyoneScoped ? 'ACTIVE' : 'UNCHANGED'}\`\n` +
                        `> ${emojis.tick} **Verification Level**: \`${verificationElevated ? 'VERY HIGH (4)' : 'UNCHANGED'}\`\n` +
                        `> ${emojis.trash} **Rogue Webhooks Purged**: \`${purgedWebhooks}\`\n\n` +
                        `*The server is protected under a ${Math.round(lockdownDuration / 1000)}s scoped lockdown and will automatically restore baseline settings.*`
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] }).catch(() => null);
            }
        }
        return true;
    }

    /**
     * Safely and idempotently restore pre-lockdown @everyone permissions and verificationLevel
     * @param {import('discord.js').Guild} guild
     * @param {import('../base/Roynix.js').Roynix} [client]
     * @returns {Promise<boolean>}
     */
    async restoreLockdown(guild, client = null) {
        const guildId = typeof guild === 'string' ? guild : guild?.id;
        if (!guildId) return false;

        const state = this.lockdownState.get(guildId);
        if (!state || state.restored) return false;
        if (state.restoringPromise) {
            return await state.restoringPromise;
        }

        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }

        const targetGuild = (typeof guild === 'object' && guild) || state.guild;
        state.restoringPromise = (async () => {
            try {
                if (targetGuild) {
                    const restoreTasks = [];

                    if (
                        state.everyoneModified &&
                        state.originalEveryonePermissions !== null
                    ) {
                        const everyoneRole = targetGuild.roles?.everyone
                            || targetGuild.roles?.cache?.get?.(guildId)
                            || null;
                        if (everyoneRole && typeof everyoneRole.setPermissions === 'function') {
                            restoreTasks.push(
                                Promise.resolve(
                                    everyoneRole.setPermissions(
                                        state.originalEveryonePermissions,
                                        'Roynix Circuit Breaker | Lockdown Expired - Restoring @everyone Permissions'
                                    )
                                ).catch(() => null)
                            );
                        }
                    }

                    if (
                        state.verificationElevated &&
                        state.originalVerificationLevel !== null &&
                        typeof targetGuild.setVerificationLevel === 'function'
                    ) {
                        restoreTasks.push(
                            Promise.resolve(
                                targetGuild.setVerificationLevel(
                                    state.originalVerificationLevel,
                                    'Roynix Circuit Breaker | Lockdown Expired - Restoring Verification Level'
                                )
                            ).catch(() => null)
                        );
                    }

                    await Promise.all(restoreTasks);
                }
                state.active = false;
                state.restored = true;
                this.lockdownState.delete(guildId);
                return true;
            } catch {
                this.lockdownState.delete(guildId);
                return false;
            }
        })();

        return await state.restoringPromise;
    }
}

export const circuitBreaker = new CircuitBreaker();
