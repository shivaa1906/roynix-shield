import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('guildBanRemove', async (ban) => {
            const guild = ban.guild;
            const user = ban.user;
            if (!guild || !user) return;

            const event = 'antiUnban';

            const antinukeData = await client.getAntinukeData(guild.id);
            const isAntinukeEnabled = antinukeData?.enabled || false;
            if (!isAntinukeEnabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const extraOwners = antinukeData?.extraOwners || [];
            const whitelisted = antinukeData?.whitelisted || {};
            const punishment = antinukeData?.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanRemove, user.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            const trackingKey = `${guild.id}_antiUnban_${user.id}_${executor.id}`;
            const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Unban', client, trackingKey);
            const rebanPromise = (async () => {
                if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
                    try {
                        await guild.bans.create(user.id, { reason: 'Roynix Antinuke System | Unauthorized Unban Reverted' });
                        return true;
                    } catch {
                        return false;
                    }
                }
                return false;
            })();

            const [actionTaken, rebanned] = await Promise.all([punishPromise, rebanPromise]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Unban Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.user} **Unbanned User**: <@${user.id}> (${user.tag})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                            `${emojis.tick} **Re-banned**: ${rebanned ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
