import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';

export const data = {
    async execute(client) {
        client.on('emojiCreate', async (emoji) => {
            const executor = await getAuditExecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
            await logEmojiEvent(
                client,
                'Emoji Created',
                `${emojis.green_dot} **Emoji:** ${emoji}\n` +
                `${emojis.green_dot} **Name:** ${emoji.name}\n` +
                `${emojis.green_dot} **ID:** ${emoji.id}\n` +
                (executor ? `${emojis.green_dot} **Created By:** ${executor.tag}` : ''),
                emoji.guild,
                emoji
            );
        });

        client.on('emojiDelete', async (emoji) => {
            const executor = await getAuditExecutor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
            await logEmojiEvent(
                client,
                'Emoji Deleted',
                `${emojis.red_dot} **Emoji:** ${emoji.name}\n` +
                `${emojis.red_dot} **ID:** ${emoji.id}\n` +
                (executor ? `${emojis.red_dot} **Deleted By:** ${executor.tag}` : ''),
                emoji.guild,
                emoji
            );
        });

        client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
            const executor = await getAuditExecutor(newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);
            const changes = [];
            
            if (oldEmoji.name !== newEmoji.name) {
                changes.push(`${emojis.yellow_dot} **Name:** ${oldEmoji.name} → ${newEmoji.name}`);
            }
            
            if (changes.length === 0) return;
            
            await logEmojiEvent(
                client,
                'Emoji Updated',
                `${emojis.yellow_dot} **Emoji:** ${newEmoji}\n` +
                `${emojis.yellow_dot} **ID:** ${newEmoji.id}\n` +
                (executor ? `${emojis.yellow_dot} **Updated By:** ${executor.tag}\n` : '') +
                changes.join('\n'),
                newEmoji.guild,
                newEmoji
            );
        });
    }
};

async function logEmojiEvent(client, eventType, description, guild, emoji) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.emojiChanges`);
    if (!loggingChannelId) return;

    const channel = guild.channels.cache.get(loggingChannelId) || await guild.channels.fetch(loggingChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setColor(client.color)
        .setAuthor({
            name: guild.name,
            iconURL: guild.iconURL({ size: 1024 })
        })
        .setDescription(description)
        .setFooter({ 
            text: `${eventType}`,
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
}