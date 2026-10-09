import { EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';

export const data = {
    async execute(client) {
        client.on('voiceStateUpdate', async (oldState, newState) => {
            // Only track channel changes
            if (oldState.channelId === newState.channelId) return;

            const member = newState.member || oldState.member;
            if (!member) return;

            const guild = newState.guild || oldState.guild;
            let description = '';

            if (!oldState.channelId) {
                // Joined voice channel
                description = `${emojis.green_dot} **Joined Voice:** ${newState.channel?.name || 'Unknown Channel'}`;
            } else if (!newState.channelId) {
                // Left voice channel
                description = `${emojis.red_dot} **Left Voice:** ${oldState.channel?.name || 'Unknown Channel'}`;
            } else {
                // Moved between channels (optional - remove if not needed)
                return;
            }

            await logVoiceEvent(
                client,
                'Voice Channel Update',
                `${emojis.green_dot} **Member:** ${member.user.tag} (${member.id})\n` +
                description,
                guild,
                member.user
            );
        });
    }
};

async function logVoiceEvent(client, eventType, description, guild, user) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.voiceState`);
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
            text: `${guild.name}`,
            iconURL: guild.iconURL({ size: 64 }) 
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
}