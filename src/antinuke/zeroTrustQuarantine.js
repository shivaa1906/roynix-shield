import { PermissionFlagsBits, EmbedBuilder, AuditLogEvent } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { evaluateActorTrust, isWhitelistedForEvent } from '../utils/securityPolicy.js';

const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
];

function toRoleArray(collectionOrArray) {
    if (!collectionOrArray) return [];
    if (Array.isArray(collectionOrArray)) return collectionOrArray;
    if (typeof collectionOrArray.values === 'function') return Array.from(collectionOrArray.values());
    return [];
}

function hasDangerousPermission(role) {
    if (!role?.permissions) return false;
    if (typeof role.permissions.has === 'function') {
        return DANGEROUS_PERMS.some((perm) => role.permissions.has(perm));
    }
    if (typeof role.permissions.any === 'function') {
        return role.permissions.any(DANGEROUS_PERMS);
    }
    return false;
}

function isBotExemptFromQuarantine(botMemberId, clientUserId, extraOwners, whitelisted) {
    if (!botMemberId) return true;
    if (botMemberId === clientUserId) return true;
    if (isBotOwner(botMemberId)) return true;
    if (Array.isArray(extraOwners) && extraOwners.includes(botMemberId)) return true;
    if (
        isWhitelistedForEvent(whitelisted, botMemberId, 'antiBot') ||
        isWhitelistedForEvent(whitelisted, botMemberId, 'zeroTrustQuarantine') ||
        Boolean(whitelisted?.[botMemberId]?.events?.length)
    ) {
        return true;
    }
    return false;
}

/**
 * Neutralize dangerous roles on a bot member respecting Discord's managed-role restrictions:
 * - Non-managed roles are removed from the member if manageable/editable.
 * - Managed integration roles (role.managed === true) cannot be removed from a member;
 *   instead, their permissions are zeroed via role.setPermissions(0n).
 *
 * @param {any} botMember
 * @param {any} dangerousRoles
 * @param {string} reason
 * @returns {Promise<{ modified: boolean, neutralizedNames: string[] }>}
 */
export async function neutralizeBotDangerousRoles(botMember, dangerousRoles, reason) {
    const roles = toRoleArray(dangerousRoles).filter(Boolean);
    const neutralizedNames = [];
    if (!botMember || roles.length === 0) {
        return { modified: false, neutralizedNames };
    }

    const nonManaged = roles.filter((r) => !r.managed && r.editable !== false);
    const managed = roles.filter((r) => r.managed === true && r.editable !== false && typeof r.setPermissions === 'function');

    if (nonManaged.length > 0 && botMember.manageable !== false && typeof botMember.roles?.remove === 'function') {
        const removed = await Promise.resolve(botMember.roles.remove(nonManaged, reason))
            .then((res) => res !== null && res !== false)
            .catch(() => false);
        if (removed) {
            for (const r of nonManaged) {
                neutralizedNames.push(r.name || r.id || 'role');
            }
        }
    }

    if (managed.length > 0) {
        await Promise.all(
            managed.map(async (role) => {
                const zeroed = await Promise.resolve(role.setPermissions(0n, `${reason} | Managed Role Permission Zeroing`))
                    .then((res) => res !== null && res !== false)
                    .catch(() => false);
                if (zeroed) {
                    neutralizedNames.push(`${role.name || role.id || 'managed-role'} (permissions zeroed)`);
                }
            })
        );
    }

    return {
        modified: neutralizedNames.length > 0,
        neutralizedNames
    };
}

/**
 * Scan and quarantine unwhitelisted bots holding dangerous permissions in a guild
 * @param {import('discord.js').Guild} guild
 * @param {import('../base/Roynix.js').Roynix} client
 * @param {object} [antinukeData]
 */
export async function quarantineGuildBots(guild, client, antinukeData = null) {
    if (!guild) return 0;
    try {
        const data = antinukeData || await client.getAntinukeData(guild.id);
        if (!data?.enabled || data?.disabledEvents?.includes('zeroTrustQuarantine')) return 0;

        const extraOwners = data.extraOwners || [];
        const whitelisted = data.whitelisted || {};

        let quarantinedCount = 0;
        const entries = toRoleArray(guild.members?.cache).filter(
            (m) => m?.user?.bot && m.id !== client?.user?.id
        );
        await Promise.all(
            entries.map(async (botMember) => {
                if (isBotExemptFromQuarantine(botMember.id, client?.user?.id, extraOwners, whitelisted)) {
                    return;
                }

                const dangerousRoles = toRoleArray(botMember.roles?.cache).filter(
                    (role) => role && role.id !== guild.id && hasDangerousPermission(role)
                );

                if (dangerousRoles.length > 0) {
                    const { modified } = await neutralizeBotDangerousRoles(
                        botMember,
                        dangerousRoles,
                        'Roynix Zero-Trust | Auto-Quarantine of Unwhitelisted Bot'
                    );
                    if (modified) {
                        quarantinedCount += 1;
                    }
                }
            })
        );
        return quarantinedCount;
    } catch {
        return 0;
    }
}

export const data = {
    /**
     * @param {import('../base/Roynix.js').Roynix} client
     */
    async execute(client) {
        // 1. Monitor role assignments to bots in real time
        client.on('guildMemberUpdate', async (oldMember, newMember) => {
            if (!newMember?.user?.bot || !newMember.guild) return;
            const guild = newMember.guild;

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('zeroTrustQuarantine')) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};

            if (isBotExemptFromQuarantine(newMember.id, client?.user?.id, extraOwners, whitelisted)) return;

            const dangerousRoles = toRoleArray(newMember.roles?.cache).filter(
                (role) => role && role.id !== guild.id && hasDangerousPermission(role)
            );

            if (dangerousRoles.length > 0) {
                const { modified, neutralizedNames } = await neutralizeBotDangerousRoles(
                    newMember,
                    dangerousRoles,
                    'Roynix Zero-Trust | Unwhitelisted bot cannot hold administrative permissions'
                );

                if (modified) {
                    const logChannelId = antinukeData.logsChannel;
                    if (logChannelId) {
                        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                        if (logChannel) {
                            const embed = new EmbedBuilder()
                                .setColor(client.color)
                                .setTitle('Zero-Trust Auto-Quarantine Enforced')
                                .setDescription(
                                    `${emojis.warn} **Quarantined Bot**: <@${newMember.id}> (${newMember.user.tag || newMember.id})\n` +
                                    `${emojis.shield} **Reason**: Un-whitelisted bot attempted to receive administrative permissions.\n` +
                                    `${emojis.role} **Revoked / Neutralized Roles**: ${neutralizedNames.join(', ')}\n` +
                                    `${emojis.info} **Action**: Dangerous permissions were automatically neutralized.`
                                )
                                .setTimestamp();
                            logChannel.send({ embeds: [embed] }).catch(() => null);
                        }
                    }
                }
            }
        });

        // 2. Monitor role permission changes (if an existing bot role gets Admin)
        client.on('roleUpdate', async (oldRole, newRole) => {
            if (!newRole?.guild) return;
            const guild = newRole.guild;

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('zeroTrustQuarantine')) return;

            const gainedDangerousPerm = DANGEROUS_PERMS.some(
                (perm) => !oldRole?.permissions?.has?.(perm) && newRole?.permissions?.has?.(perm)
            );

            if (!gainedDangerousPerm) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};

            const membersList = toRoleArray(newRole.members).filter(
                (m) => m?.user?.bot && !isBotExemptFromQuarantine(m.id, client?.user?.id, extraOwners, whitelisted)
            );

            await Promise.all(
                membersList.map((botMember) =>
                    neutralizeBotDangerousRoles(
                        botMember,
                        [newRole],
                        'Roynix Zero-Trust | Role upgraded to Admin permissions'
                    )
                )
            );
        });

        // 3. Monitor bot joins (backup if antiBot is disabled)
        client.on('guildMemberAdd', async (member) => {
            if (!member?.user?.bot || !member.guild) return;
            const guild = member.guild;

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('zeroTrustQuarantine')) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};

            if (isBotExemptFromQuarantine(member.id, client?.user?.id, extraOwners, whitelisted)) return;

            const inviter = await getAuditExecutor(guild, AuditLogEvent.BotAdd, member.id, client, { retries: 1, retryDelayMs: 100 });
            const trust = evaluateActorTrust({
                guild,
                client,
                antinukeData,
                moduleKey: 'antiBot',
                executorId: inviter?.id || null,
                targetId: member.id
            });
            if (trust.trustState !== 'untrusted') return;

            const dangerousRoles = toRoleArray(member.roles?.cache).filter(
                (role) => role && role.id !== guild.id && hasDangerousPermission(role)
            );

            if (dangerousRoles.length > 0) {
                await neutralizeBotDangerousRoles(
                    member,
                    dangerousRoles,
                    'Roynix Zero-Trust | Quarantine unwhitelisted joined bot'
                );
            }
        });
    }
};
