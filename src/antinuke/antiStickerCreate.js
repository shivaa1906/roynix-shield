import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';

export const data = {
    /**
     * @param {import('../base/Roynix.js').Roynix} client 
     */
    async execute(client) {
        client.on('stickerCreate', async (sticker) => {
            const guild = sticker.guild;
            if (!guild) return;
            const event = 'antiStickerCreate';

            const antinukeData = await client.getAntinukeData(guild.id);
            const isAntinukeEnabled = antinukeData?.enabled || false;
            if (!isAntinukeEnabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const extraOwners = antinukeData?.extraOwners || [];
            const whitelisted = antinukeData?.whitelisted || {};
            const punishment = antinukeData?.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.StickerCreate, sticker.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            const trackingKey = `${guild.id}_antiStickerCreate_${sticker.id}_${executor.id}`;
            const [actionTaken, stickerDeleted] = await Promise.all([
                punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Sticker Create', client, trackingKey),
                sticker.delete('Roynix Antinuke System | Unauthorized Sticker Creation').then(() => true).catch(() => false)
            ]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle("Anti-Sticker Create Triggered")
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.sticker} **Sticker**: \`${sticker.name}\` (${sticker.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || "No Action"}\n` +
                            `${emojis.trash} **Sticker Deleted**: ${stickerDeleted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
