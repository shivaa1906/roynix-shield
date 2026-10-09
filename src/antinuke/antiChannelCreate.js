import { AuditLogEvent, EmbedBuilder, ChannelType } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('channelCreate', async (channel) => {
            if (!channel.guild) return;
            const guild = channel.guild;
            const event = 'antiChannelCreate';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const extraOwners = antinukeData?.extraOwners || [];
            const whitelisted = antinukeData?.whitelisted || {};
            const punishment = antinukeData?.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelCreate, channel.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            const trackingKey = `${guild.id}_antiChannelCreate_${channel.id}_${executor.id}`;
            const [actionTaken, channelDeleted] = await Promise.all([
                punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Channel Create', client, trackingKey),
                channel.delete('Roynix Antinuke System | Unauthorized Channel Creation').then(() => true).catch(() => false)
            ]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle("Anti-Channel Create Triggered")
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.channel} **Channel**: \`${channel.name}\` (${channel.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || "No Action"}\n` +
                            `${emojis.trash} **Channel Deleted**: ${channelDeleted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
