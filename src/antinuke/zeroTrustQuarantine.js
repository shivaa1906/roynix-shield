import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';

const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
];

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
        const quarantinePromises = [];
        const bots = guild.members.cache.filter(m => m.user.bot && m.id !== client.user.id);

        for (const [_, botMember] of bots) {
            if (isBotOwner(botMember.id) || extraOwners.includes(botMember.id) || whitelisted[botMember.id]) {
                continue;
            }

            const dangerousRoles = botMember.roles.cache.filter(role => 
                role.id !== guild.id && 
                DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
            );

            if (dangerousRoles.size > 0 && botMember.manageable) {
                quarantinedCount++;
                quarantinePromises.push(
                    botMember.roles.remove(dangerousRoles, 'Roynix Zero-Trust | Auto-Quarantine of Unwhitelisted Bot').catch(() => null)
                );
            }
        }
        await Promise.all(quarantinePromises);
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
            if (!newMember.user.bot || !newMember.guild) return;
            const guild = newMember.guild;

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('zeroTrustQuarantine')) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};

            if (
                newMember.id === client.user.id ||
                isBotOwner(newMember.id) ||
                extraOwners.includes(newMember.id) ||
                whitelisted[newMember.id]
            ) return;

            // Detect if this unwhitelisted bot gained any dangerous permissions
            const dangerousRoles = newMember.roles.cache.filter(role =>
                role.id !== guild.id &&
                DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
            );

            if (dangerousRoles.size > 0 && newMember.manageable) {
                await newMember.roles.remove(dangerousRoles, 'Roynix Zero-Trust | Unwhitelisted bot cannot hold administrative permissions').catch(() => null);

                const logChannelId = antinukeData.logsChannel;
                if (logChannelId) {
                    const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setColor(client.color)
                            .setTitle('Zero-Trust Auto-Quarantine Enforced')
                            .setDescription(
                                `${emojis.warn} **Quarantined Bot**: <@${newMember.id}> (${newMember.user.tag})\n` +
                                `${emojis.shield} **Reason**: Un-whitelisted bot attempted to receive administrative permissions.\n` +
                                `${emojis.role} **Revoked Roles**: ${dangerousRoles.map(r => r.name).join(', ')}\n` +
                                `${emojis.info} **Action**: Dangerous roles were automatically stripped in 0ms.`
                            )
                            .setTimestamp();
                        logChannel.send({ embeds: [embed] }).catch(() => null);
                    }
                }
            }
        });

        // 2. Monitor role permission changes (if an existing bot role gets Admin)
        client.on('roleUpdate', async (oldRole, newRole) => {
            if (!newRole.guild) return;
            const guild = newRole.guild;

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('zeroTrustQuarantine')) return;

            const gainedDangerousPerm = DANGEROUS_PERMS.some(perm => 
                !oldRole.permissions.has(perm) && newRole.permissions.has(perm)
            );

            if (!gainedDangerousPerm) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};

            // Check if any unwhitelisted bot holds this role
            const botMembersWithRole = newRole.members.filter(m => 
                m.user.bot && 
                m.id !== client.user.id && 
                !isBotOwner(m.id) && 
                !extraOwners.includes(m.id) && 
                !whitelisted[m.id]
            );

            const stripPromises = [];
            for (const [_, botMember] of botMembersWithRole) {
                if (botMember.manageable) {
                    stripPromises.push(
                        botMember.roles.remove(newRole, 'Roynix Zero-Trust | Role upgraded to Admin permissions').catch(() => null)
                    );
                }
            }
            await Promise.all(stripPromises);
        });

        // 3. Monitor bot joins (backup if antiBot is disabled)
        client.on('guildMemberAdd', async (member) => {
            if (!member.user.bot || !member.guild) return;
            const guild = member.guild;

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('zeroTrustQuarantine')) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};

            if (
                member.id === client.user.id ||
                isBotOwner(member.id) ||
                extraOwners.includes(member.id) ||
                whitelisted[member.id]
            ) return;

            const dangerousRoles = member.roles.cache.filter(role =>
                role.id !== guild.id &&
                DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
            );

            if (dangerousRoles.size > 0 && member.manageable) {
                await member.roles.remove(dangerousRoles, 'Roynix Zero-Trust | Quarantine unwhitelisted joined bot').catch(() => null);
            }
        });
    }
};
