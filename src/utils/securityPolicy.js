import { AuditLogEvent, MessageFlags } from 'discord.js';
import { isBotOwner } from './isBotOwner.js';

export const AUDIT_EVENT_TO_MODULE = Object.freeze({
    [AuditLogEvent.ChannelDelete]: 'antiChannelDelete',
    [AuditLogEvent.ChannelCreate]: 'antiChannelCreate',
    [AuditLogEvent.ChannelUpdate]: 'antiChannelUpdate',
    [AuditLogEvent.RoleDelete]: 'antiRoleDelete',
    [AuditLogEvent.RoleCreate]: 'antiRoleCreate',
    [AuditLogEvent.RoleUpdate]: 'antiRoleUpdate',
    [AuditLogEvent.MemberBanAdd]: 'antiBan',
    [AuditLogEvent.MemberKick]: 'antiKick',
    [AuditLogEvent.MemberBanRemove]: 'antiUnban',
    [AuditLogEvent.BotAdd]: 'antiBot',
    [AuditLogEvent.EmojiCreate]: 'antiEmojiCreate',
    [AuditLogEvent.EmojiDelete]: 'antiEmojiDelete',
    [AuditLogEvent.EmojiUpdate]: 'antiEmojiUpdate',
    [AuditLogEvent.StickerCreate]: 'antiStickerCreate',
    [AuditLogEvent.StickerDelete]: 'antiStickerDelete',
    [AuditLogEvent.StickerUpdate]: 'antiStickerUpdate',
    [AuditLogEvent.GuildUpdate]: 'antiGuildUpdate',
    [AuditLogEvent.MemberRoleUpdate]: 'antiMemberUpdate',
    [AuditLogEvent.MemberUpdate]: 'antiMemberUpdate',
    [AuditLogEvent.WebhookCreate]: 'antiWebhookUpdate',
    [AuditLogEvent.WebhookDelete]: 'antiWebhookUpdate',
    [AuditLogEvent.WebhookUpdate]: 'antiWebhookUpdate',
    [AuditLogEvent.MemberPrune ?? 21]: 'antiPrune'
});

export const KNOWN_MODULE_KEYS = new Set([
    ...Object.values(AUDIT_EVENT_TO_MODULE),
    'antiPing',
    'antiLockdown',
    'botQuarantine',
    'circuitBreaker',
    'snapshotRecovery',
    'autoRecovery'
]);

/**
 * Validate whether a string is a recognized AntiNuke module key.
 * @param {string | null | undefined} key
 * @returns {boolean}
 */
export function isValidModuleKey(key) {
    return typeof key === 'string' && KNOWN_MODULE_KEYS.has(key);
}

/**
 * Check if a user record in `antinukeData.whitelisted` grants exemption for a given module key.
 * @param {object} whitelistedMap
 * @param {string | null | undefined} actorId
 * @param {string | null | undefined} moduleKey
 * @returns {boolean}
 */
export function isWhitelistedForEvent(whitelistedMap, actorId, moduleKey) {
    if (!whitelistedMap || !actorId) return false;
    const entry = whitelistedMap[actorId];
    if (!entry) return false;
    if (entry.whitelisted === true) return true;
    if (moduleKey && Array.isArray(entry.events) && entry.events.includes(moduleKey)) {
        return true;
    }
    return false;
}

/**
 * Authoritative trust and exemption evaluator across all AntiNuke entry points.
 * Never classifies an unresolved executor as trusted or malicious without evidence.
 *
 * @param {object} params
 * @param {import('discord.js').Guild | { id?: string, ownerId?: string, client?: any } | null} [params.guild]
 * @param {any} [params.client]
 * @param {object | null} [params.antinukeData]
 * @param {string | null} [params.moduleKey]
 * @param {string | null} [params.executorId]
 * @param {string | null} [params.targetId]
 * @returns {{ trustState: 'trusted' | 'untrusted' | 'unknown', reason: string, isExempt: boolean }}
 */
export function evaluateActorTrust({
    guild = null,
    client = null,
    antinukeData = null,
    moduleKey = null,
    executorId = null,
    targetId = null
} = {}) {
    const botClient = client || guild?.client || null;
    const botUserId = botClient?.user?.id || null;
    const extraOwners = Array.isArray(antinukeData?.extraOwners) ? antinukeData.extraOwners : [];
    const whitelisted = antinukeData?.whitelisted || {};

    // Target-level exemption for AntiBot when the invited bot itself is explicitly whitelisted
    if (moduleKey === 'antiBot' && targetId) {
        if (targetId === botUserId) {
            return { trustState: 'trusted', reason: 'bot_self_target', isExempt: true };
        }
        if (isWhitelistedForEvent(whitelisted, targetId, 'antiBot')) {
            return { trustState: 'trusted', reason: 'target_bot_whitelisted', isExempt: true };
        }
    }

    // Missing or unresolved attribution must remain explicitly unknown
    if (!executorId || typeof executorId !== 'string') {
        return { trustState: 'unknown', reason: 'missing_executor', isExempt: false };
    }

    // 1. Bot itself
    if (botUserId && executorId === botUserId) {
        return { trustState: 'trusted', reason: 'bot_self', isExempt: true };
    }

    // 2. Global Bot Owner (config.owners)
    const botOwnerCheck = typeof botClient?.isBotOwner === 'function' ? botClient.isBotOwner : isBotOwner;
    if (botOwnerCheck(executorId)) {
        return { trustState: 'trusted', reason: 'bot_owner', isExempt: true };
    }

    // 3. Discord Guild Owner — if guild.ownerId is unknown/unavailable on the guild object, cannot confirm untrusted
    if (guild?.ownerId) {
        if (executorId === guild.ownerId) {
            return { trustState: 'trusted', reason: 'guild_owner', isExempt: true };
        }
    } else {
        return { trustState: 'unknown', reason: 'missing_guild_owner_context', isExempt: false };
    }

    // 4. Delegated Extra Owners
    if (extraOwners.includes(executorId)) {
        return { trustState: 'trusted', reason: 'extra_owner', isExempt: true };
    }

    // 5. Global or Per-event Whitelisted Users/Bots
    const validModuleKey = isValidModuleKey(moduleKey) ? moduleKey : null;
    if (isWhitelistedForEvent(whitelisted, executorId, validModuleKey)) {
        return { trustState: 'trusted', reason: 'event_whitelisted', isExempt: true };
    }

    return { trustState: 'untrusted', reason: 'unauthorized_actor', isExempt: false };
}

/**
 * Convenience boolean wrapper for exemption checks when executor is resolved.
 * @param {Parameters<typeof evaluateActorTrust>[0]} params
 * @returns {boolean}
 */
export function isActorExempt(params) {
    return evaluateActorTrust(params).isExempt;
}

/**
 * Check whether a user is authorized to execute `/antinuke` or `!antinuke` commands.
 * Preserves the intended privileges of Bot Owners, Guild Owners, and Extra Owners.
 *
 * @param {object | null} guild
 * @param {string | null | undefined} userId
 * @param {object | null | undefined} antinukeData
 * @param {any} [client]
 * @param {{ requireOwnerOnly?: boolean }} [options]
 * @returns {boolean}
 */
export function isCommandAuthorized(guild, userId, antinukeData, client = null, { requireOwnerOnly = false } = {}) {
    if (!userId || typeof userId !== 'string') return false;
    const botClient = client || guild?.client || null;
    const botOwnerCheck = typeof botClient?.isBotOwner === 'function' ? botClient.isBotOwner : isBotOwner;
    if (botOwnerCheck(userId)) return true;
    if (guild?.ownerId && userId === guild.ownerId) return true;
    if (!requireOwnerOnly && Array.isArray(antinukeData?.extraOwners) && antinukeData.extraOwners.includes(userId)) {
        return true;
    }
    return false;
}

/**
 * Re-validate sensitive interactive collector actions against current live database state.
 * Rejects non-invoker clicks and immediately blocks Extra Owners whose privileges were
 * revoked (`owner remove` / `owner reset`) or when AntiNuke was disabled while the menu was open.
 *
 * @param {any} interaction
 * @param {string} expectedUserId
 * @param {object} guild
 * @param {any} client
 * @param {{ requireOwnerOnly?: boolean, requireEnabled?: boolean, collector?: any }} [options]
 * @returns {Promise<{ allowed: boolean, reason: string, antinukeData: object }>}
 */
export async function verifyCollectorInteraction(
    interaction,
    expectedUserId,
    guild,
    client,
    { requireOwnerOnly = false, requireEnabled = true, collector = null } = {}
) {
    if (!interaction?.user?.id || interaction.user.id !== expectedUserId) {
        if (typeof interaction?.reply === 'function') {
            await interaction.reply({
                content: 'You cannot interact with this.',
                flags: MessageFlags.Ephemeral
            }).catch(() => null);
        }
        return { allowed: false, ok: false, reason: 'wrong_user', antinukeData: {} };
    }

    const freshData = (
        typeof client?.antinukeDB?.get === 'function'
            ? await client.antinukeDB.get(`antinukeData_${guild.id}`)
            : typeof client?.getAntinukeData === 'function'
                ? await client.getAntinukeData(guild.id)
                : null
    ) || {};

    if (!isCommandAuthorized(guild, interaction.user.id, freshData, client, { requireOwnerOnly })) {
        collector?.stop?.('unauthorized');
        if (typeof interaction?.reply === 'function') {
            await interaction.reply({
                content: 'You are no longer authorized to perform this action.',
                flags: MessageFlags.Ephemeral
            }).catch(() => null);
        }
        return { allowed: false, ok: false, reason: 'revoked', antinukeData: freshData };
    }

    if (requireEnabled && !freshData.enabled) {
        collector?.stop?.('disabled');
        if (typeof interaction?.reply === 'function') {
            await interaction.reply({
                content: 'Antinuke is no longer enabled in this server.',
                flags: MessageFlags.Ephemeral
            }).catch(() => null);
        }
        return { allowed: false, ok: false, reason: 'disabled', antinukeData: freshData };
    }

    return { allowed: true, ok: true, reason: 'authorized', antinukeData: freshData };
}

/**
 * Attempt to position the protection role below the bot's highest role and report any
 * impossible hierarchy operations or suboptimal role placement.
 *
 * @param {object} guild
 * @param {object} me
 * @param {object} protectRole
 * @param {object} emojis
 * @returns {Promise<{ rolePositionWarning: string, warningText: string, moved: boolean, positioned: boolean, hierarchyBlocked: boolean }>}
 */
export async function positionAndAuditProtectRole(guild, me, protectRole, emojis) {
    let rolePositionWarning = '';
    let moved = false;
    let hierarchyBlocked = false;

    try {
        const highestBotRolePos = me?.roles?.highest?.position ?? 0;
        let serverHighestPos = guild?.roles?.highest?.position ?? 0;
        if (guild?.roles?.cache && typeof guild.roles.cache.values === 'function') {
            for (const r of guild.roles.cache.values()) {
                if (typeof r?.position === 'number' && r.position > serverHighestPos) {
                    serverHighestPos = r.position;
                }
            }
        }

        const protectPos = protectRole?.position ?? 0;
        if (highestBotRolePos <= 1) {
            hierarchyBlocked = true;
            rolePositionWarning = `\n\n${emojis.warn} **Role Hierarchy Warning**: Could not automatically move <@&${protectRole.id}> near the top because my highest role is at position \`${highestBotRolePos}\`. Please drag my role to the top of Server Settings → Roles.`;
        } else if (protectPos >= highestBotRolePos || protectRole?.editable === false) {
            hierarchyBlocked = true;
            rolePositionWarning = `\n\n${emojis.warn} **Role Hierarchy Warning**: <@&${protectRole.id}> is currently at or above my highest role (<@&${me.roles.highest.id}>) and cannot be repositioned automatically.`;
        } else if (protectPos < highestBotRolePos - 1) {
            const targetPos = highestBotRolePos - 1;
            const res = typeof protectRole?.setPosition === 'function'
                ? await protectRole.setPosition(targetPos).catch(() => null)
                : null;
            if (res) {
                moved = true;
            } else {
                hierarchyBlocked = true;
                rolePositionWarning = `\n\n${emojis.warn} **Role Hierarchy Warning**: Could not automatically move <@&${protectRole.id}> near the top. Please drag it manually below my highest role.`;
            }
        }

        if (serverHighestPos > 0 && highestBotRolePos < serverHighestPos - 1) {
            const highestRoleId = me?.roles?.highest?.id || guild.id;
            rolePositionWarning += `\n\n${emojis.warn} **Hierarchy Notice**: My highest role (<@&${highestRoleId}>) is currently below other roles in this server. Move my role to the very top of Server Settings → Roles so I can punish any attacker.`;
        }
    } catch {
        hierarchyBlocked = true;
    }

    return {
        rolePositionWarning,
        warningText: rolePositionWarning,
        moved,
        positioned: moved,
        hierarchyBlocked
    };
}
