import { EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client
     */
    async execute(client) {
        client.on('guildMemberAdd', async (member) => {
            await logMemberEvent(
                client,
                'Member Joined',
                `${emojis.green_dot} **Member:** ${member.user.tag} (${member.user.id})\n` +
                `${emojis.green_dot} **Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n` +
                `${emojis.green_dot} **Member Count:** ${member.guild.memberCount.toLocaleString()}`,
                member.guild,
                member.user
            );
        });

        client.on('guildMemberRemove', async (member) => {
            const joinedAt = member.joinedAt ? 
                `${emojis.red_dot} **Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n` +
                `${emojis.red_dot} **Time in Server:** ${formatDuration(member.joinedTimestamp)}` :
                `${emojis.red_dot} **Joined:** Unknown`;

            await logMemberEvent(
                client,
                'Member Left',
                `${emojis.red_dot} **Member:** ${member.user.tag} (${member.user.id})\n` +
                joinedAt + '\n' +
                `${emojis.red_dot} **Left At:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                `${emojis.red_dot} **Member Count:** ${member.guild.memberCount.toLocaleString()}`,
                member.guild,
                member.user
            );
        });
    }
};

/**
 * @param {Date|number} start 
 * @param {Date|number} [end] 
 * @returns {string}
 */
function formatDuration(start, end = Date.now()) {
    const startTime = start instanceof Date ? start.getTime() : start;
    const endTime = end instanceof Date ? end.getTime() : end;
    const seconds = Math.floor((endTime - startTime) / 1000);
    
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months`;
    return `${Math.floor(seconds / 31536000)} years`;
}

/**
 * @param {import('../base/Roynix').Roynix} client 
 * @param {string} eventType 
 * @param {string} description 
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').User} user 
 */
async function logMemberEvent(client, eventType, description, guild, user) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.memberJoinLeave`);
    if (!loggingChannelId) return;

    const channel = guild.channels.cache.get(loggingChannelId) || await guild.channels.fetch(loggingChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setColor(client.color)
        .setAuthor({
            name: `${user.username} (${user.id})`,
            iconURL: user.displayAvatarURL({ size: 1024 })
        })
        .setDescription(description)
        .setFooter({ 
            text: `${guild.name} • ${eventType}`, 
            iconURL: guild.iconURL({ size: 64 }) 
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
}