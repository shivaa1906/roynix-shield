import { EmbedBuilder, messageLink } from 'discord.js';
import emojis from '../config/emojis.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client
     */
    async execute(client) {
        client.on('messageUpdate', async (oldMessage, newMessage) => {
            if (oldMessage.content === newMessage.content) return;

            await logMessageEvent(
                client,
                'Message Update',
                `${emojis.yellow_dot} **Executor:** ${newMessage.author}\n${emojis.yellow_dot} **Before:** ${oldMessage?.content || `${emojis.warn} No Content`}\n${emojis.yellow_dot} **After:** ${newMessage?.content || `${emojis.warn} No Content`}\n${emojis.yellow_dot} **Channel:** ${newMessage.channel}`,
                newMessage.guild,
                newMessage
            );
        });

        client.on('messageDelete', async (message) => {
            await logMessageEvent(
                client,
                'Message Delete',
                `${emojis.red_dot} **Executor:** ${message.red_dot} **Channel:** ${message.channel}`,
                message.guild,
                message
            );
        });
    }
};

/**
 * @param {import('../base/Roynix').Roynix} client 
 * @param {string} eventType 
 * @param {string} description 
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').Message} message 
 */
async function logMessageEvent(client, eventType, description, guild, message) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.messageLogs`);

    if (!loggingChannelId) return; 

    const channel = guild.channels.cache.get(loggingChannelId) || await guild.channels.fetch(loggingChannelId).catch(() => null);
    if (!channel) return; 

    const embed = new EmbedBuilder()
        .setColor(client.color) 
        .setAuthor({
            name: message.author?.username || 'Unknown User',
            iconURL: message.author?.avatarURL?.({ size: 1024 }) || null
        })
        .setTitle(eventType)
        .setDescription(description)
        .setFooter({ text: `Executed by ${message.author?.username || 'Unknown'}`, iconURL: message.author?.displayAvatarURL?.({ size: 1024 }) || null })
        .setTimestamp();

    channel.send({ embeds: [embed] }).catch(() => null);
}
