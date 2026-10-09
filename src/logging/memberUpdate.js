import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';

export const data = {
    async execute(client) {
        client.on('guildMemberUpdate', async (oldMember, newMember) => {
            if (oldMember.roles.cache.size === newMember.roles.cache.size) return;

            const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
            const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

            if (addedRoles.size === 0 && removedRoles.size === 0) return;

            const guild = newMember.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            if (!executor) return;

            let description = `${emojis.yellow_dot} **Executor:** ${executor.tag}\n` +
                             `${emojis.yellow_dot} **Executor ID:** ${executor.id}\n` +
                             `${emojis.yellow_dot} **Member:** ${newMember.user.tag}\n` +
                             `${emojis.yellow_dot} **Member ID:** ${newMember.id}\n`;

            if (addedRoles.size > 0) {
                description += `${emojis.green_dot} **Roles Added:** ${addedRoles.map(r => r.name).join(', ')}\n`;
            }

            if (removedRoles.size > 0) {
                description += `${emojis.red_dot} **Roles Removed:** ${removedRoles.map(r => r.name).join(', ')}\n`;
            }

            await logMemberUpdate(
                client,
                'Member Roles Updated',
                description,
                guild
            );
        });
    }
};

async function logMemberUpdate(client, eventType, description, guild) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.memberUpdate`);
    if (!loggingChannelId) return;

    const loggingChannel = guild.channels.cache.get(loggingChannelId) || 
                         await guild.channels.fetch(loggingChannelId).catch(() => null);
    if (!loggingChannel) return;

    const embed = new EmbedBuilder()
        .setColor(client.color)
        .setTitle(eventType)
        .setAuthor({ 
            name: guild.name, 
            iconURL: guild.iconURL({ size: 1024 }) || null 
        })
        .setDescription(description)
        .setFooter({ text: `${eventType} Notification` })
        .setTimestamp();

    loggingChannel.send({ embeds: [embed] }).catch(() => null);
}