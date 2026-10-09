import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client
     */
    async execute(client) {
        // Role Creation
        client.on('roleCreate', async (role) => {
            const guild = role.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.RoleCreate, role.id);
            
            await logRoleEvent(
                client,
                'Role Created',
                `${emojis.green_dot} **Role:** ${role.name}\n` +
                `${emojis.green_dot} **Role ID:** ${role.id}\n` +
                (executor ? `${emojis.green_dot} **Created By:** ${executor.tag} (${executor.id})` : ''),
                guild,
                client.color
            );
        });

        client.on('roleDelete', async (role) => {
            const guild = role.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, role.id);
            
            await logRoleEvent(
                client,
                'Role Deleted',
                `${emojis.red_dot} **Role:** ${role.name}\n` +
                `${emojis.red_dot} **Role ID:** ${role.id}\n` +
                (executor ? `${emojis.red_dot} **Deleted By:** ${executor.tag} (${executor.id})` : ''),
                guild,
                client.color
            );
        });

        // Role Updates
        client.on('roleUpdate', async (oldRole, newRole) => {
            const guild = newRole.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id);
            
            const changes = [];
            
            if (oldRole.name !== newRole.name) {
                changes.push(`${emojis.yellow_dot} **Name:** ${oldRole.name} → ${newRole.name}`);
            }
            
            if (oldRole.color !== newRole.color) {
                changes.push(`${emojis.yellow_dot} **Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
            }
            
            if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
                changes.push(`${emojis.yellow_dot} **Permissions Changed**`);
            }
            
            if (changes.length === 0) return;
            
            await logRoleEvent(
                client,
                'Role Updated',
                `${emojis.yellow_dot} **Role:** ${newRole.name} (${newRole.id})\n` +
                (executor ? `${emojis.yellow_dot} **Updated By:** ${executor.tag} (${executor.id})\n` : '') +
                changes.join('\n'),
                guild,
                client.color
            );
        });
    }
};

/**
 * @param {import('../base/Roynix').Roynix} client 
 * @param {string} eventType 
 * @param {string} description 
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').ColorResolvable} color 
 */
async function logRoleEvent(client, eventType, description, guild, color) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.roleChanges`);
    if (!loggingChannelId) return;

    const channel = guild.channels.cache.get(loggingChannelId) || await guild.channels.fetch(loggingChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: guild.name,
            iconURL: guild.iconURL({ size: 1024 })
        })
        .setDescription(description)
        .setFooter({ 
            text: `${eventType} Notification`,
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
}