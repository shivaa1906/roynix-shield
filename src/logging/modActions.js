import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';

export const data = {
    async execute(client) {
        client.on('guildBanAdd', async (ban) => {
            const guild = ban.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanAdd, ban.user.id);
            if (!executor) return;
            await logModerationEvent(
                client,
                'Member Banned',
                `${emojis.red_dot} **Executor:** ${executor.tag}\n` +
                `${emojis.red_dot} **Executor ID:** ${executor.id}\n` +
                `${emojis.red_dot} **Banned User:** ${ban.user.tag}\n` +
                `${emojis.red_dot} **User ID:** ${ban.user.id}\n` +
                `${emojis.red_dot} **Reason:** ${ban.reason || 'No reason provided'}`,
                guild
            );
        });

        client.on('guildBanRemove', async (ban) => {
            const guild = ban.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanRemove, ban.user.id);
            if (!executor) return;
            await logModerationEvent(
                client,
                'Member Unbanned',
                `${emojis.green_dot} **Executor:** ${executor.tag}\n` +
                `${emojis.green_dot} **Executor ID:** ${executor.id}\n` +
                `${emojis.green_dot} **Unbanned User:** ${ban.user.tag}\n` +
                `${emojis.green_dot} **User ID:** ${ban.user.id}`,
                guild
            );
        });

        client.on('guildMemberRemove', async (member) => {
            if (member.partial) await member.fetch().catch(() => null);
            const guild = member.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberKick, member.id);
            if (!executor) return;
            
            await logModerationEvent(
                client,
                'Member Kicked',
                `${emojis.red_dot} **Executor:** ${executor.tag}\n` +
                `${emojis.red_dot} **Executor ID:** ${executor.id}\n` +
                `${emojis.red_dot} **Kicked User:** ${member.user.tag}\n` +
                `${emojis.red_dot} **User ID:** ${member.id}\n` +
                `${emojis.red_dot} **Joined At:** <t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
                guild
            );
        });

        client.on('guildMemberUpdate', async (oldMember, newMember) => {
            if (oldMember.communicationDisabledUntilTimestamp === newMember.communicationDisabledUntilTimestamp) return;
            
            const guild = newMember.guild;
            const executor = await getAuditExecutor(guild, 
                newMember.communicationDisabledUntilTimestamp ? 
                AuditLogEvent.MemberUpdate : 
                AuditLogEvent.MemberUpdate,
                newMember.id
            );
            
            if (!executor) return;
            
            const action = newMember.communicationDisabledUntilTimestamp ? 'Timeout Added' : 'Timeout Removed';
            const emoji = newMember.communicationDisabledUntilTimestamp ? emojis.yellow_dot : emojis.green_dot;
            
            await logModerationEvent(
                client,
                action,
                `${emoji} **Executor:** ${executor.tag}\n` +
                `${emoji} **Executor ID:** ${executor.id}\n` +
                `${emoji} **User:** ${newMember.user.tag}\n` +
                `${emoji} **User ID:** ${newMember.id}\n` +
                (newMember.communicationDisabledUntilTimestamp ?
                    `${emoji} **Timeout Until:** <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>` :
                    `${emoji} **Timeout Removed**`),
                guild
            );
        });

    }
};

async function logModerationEvent(client, eventType, description, guild) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.moderationActions`);
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