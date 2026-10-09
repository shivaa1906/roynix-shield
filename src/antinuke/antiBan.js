import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { quarantineGuildBots } from './zeroTrustQuarantine.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('guildBanAdd', async (ban) => {
            const guild = ban?.guild;
            const user = ban?.user;
            if (!guild || !user) return;

            const event = 'antiBan';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            // Immediately neutralize any other unwhitelisted bots holding administrative roles
            quarantineGuildBots(guild, client, antinukeData).catch(() => null);

            const extraOwners = antinukeData?.extraOwners || [];
            const whitelisted = antinukeData?.whitelisted || {};
            const punishment = antinukeData?.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanAdd, user.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            circuitBreaker.recordIncident(guild, client, 'Anti Ban', executor).catch(() => null);

            const trackingKey = `${guild.id}_antiBan_${user.id}_${executor.id}`;
            const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Ban', client, trackingKey);
            const recoverPromise = (async () => {
                if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
                    try {
                        await guild.bans.remove(user.id, 'Roynix Antinuke System | Unauthorized Ban');
                        return true;
                    } catch {}
                }
                return false;
            })();

            const [actionTaken, unbanned] = await Promise.all([punishPromise, recoverPromise]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Ban Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.user} **Banned User**: <@${user.id}> (${user.tag})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                            `${emojis.tick} **Unbanned**: ${unbanned ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
