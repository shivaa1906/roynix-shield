import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';

export const data = {
    async execute(client) {
        client.on('channelCreate', async (channel) => {
            const guild = channel.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelCreate, channel.id);
            if (!executor) return;
            await logChannelEvent(
                client,
                'Channel Create',
                `${emojis.green_dot} **Executor:** ${executor.tag}\n${emojis.green_dot} **Executor ID:** ${executor.id}\n${emojis.green_dot} **Channel:** ${channel.name}\n${emojis.green_dot} **Channel ID:** ${channel.id}\n${emojis.green_dot} **Type:** ${channel.type}`,
                guild
            );
        });

        client.on('channelDelete', async (channel) => {
            const guild = channel.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id);
            if (!executor) return;
            await logChannelEvent(
                client,
                'Channel Delete',
                `${emojis.red_dot} **Executor:** ${executor.tag}\n${emojis.red_dot} **Executor ID:** ${executor.id}\n${emojis.red_dot} **Channel Name:** ${channel.name}\n${emojis.red_dot} **Channel ID:** ${channel.id}\n${emojis.red_dot} **Type:** ${channel.type}`,
                guild
            );
        });

        client.on('channelUpdate', async (oldChannel, newChannel) => {
            const guild = newChannel.guild;
            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
            if (!executor) return;
            
            const changes = [];
            
            if (oldChannel.name !== newChannel.name) {
                changes.push(`${emojis.yellow_dot} **Name:** ${oldChannel.name} → ${newChannel.name}`);
            }
            
            if (oldChannel.type !== newChannel.type) {
                changes.push(`${emojis.yellow_dot} **Type:** ${oldChannel.type} → ${newChannel.type}`);
            }
            
            if (oldChannel.topic !== newChannel.topic) {
                const oldTopic = oldChannel.topic || 'None';
                const newTopic = newChannel.topic || 'None';
                changes.push(`${emojis.yellow_dot} **Topic:** ${oldTopic} → ${newTopic}`);
            }
            
            if (oldChannel.nsfw !== newChannel.nsfw) {
                changes.push(`${emojis.yellow_dot} **NSFW:** ${oldChannel.nsfw ? 'Yes' : 'No'} → ${newChannel.nsfw ? 'Yes' : 'No'}`);
            }
            
            if (changes.length === 0) return;
            
            await logChannelEvent(
                client,
                'Channel Update',
                `${emojis.yellow_dot} **Executor:** ${executor.tag}\n${emojis.yellow_dot} **Executor ID:** ${executor.id}\n${emojis.yellow_dot} **Channel:** ${newChannel.name}\n${emojis.yellow_dot} **Channel ID:** ${newChannel.id}\n\n**Changes:**\n${changes.join('\n')}`,
                guild
            );
        });
    }
};

async function logChannelEvent(client, eventType, description, guild) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.channelChanges`);
    if (!loggingChannelId) return;
    const loggingChannel = guild.channels.cache.get(loggingChannelId) || await guild.channels.fetch(loggingChannelId).catch(() => null);
    if (!loggingChannel) return;
    const embed = new EmbedBuilder()
        .setColor(client.color)
        .setTitle(eventType)
        .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 1024 }) || null })
        .setDescription(description)
        .setFooter({ text: `${eventType} Notification` })
        .setTimestamp();
    loggingChannel.send({ embeds: [embed] }).catch(() => null);
}