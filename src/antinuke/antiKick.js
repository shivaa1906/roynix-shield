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
        client.on('guildMemberRemove', async (member) => {
            const guild = member.guild;
            const event = 'antiKick';

            const antinukeData = await client.getAntinukeData(guild.id);
            const isAntinukeEnabled = antinukeData?.enabled || false;
            if (!isAntinukeEnabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            // Immediately neutralize any other unwhitelisted bots holding administrative roles
            quarantineGuildBots(guild, client, antinukeData).catch(() => null);

            const extraOwners = antinukeData?.extraOwners || [];
            const whitelisted = antinukeData?.whitelisted || {};
            const punishment = antinukeData?.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberKick, member.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            circuitBreaker.recordIncident(guild, client, 'Anti Kick', executor).catch(() => null);

            const trackingKey = `${guild.id}_antiKick_${member.id}_${executor.id}`;
            const actionTaken = await punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Kick', client, trackingKey);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Kick Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.user} **Kicked User**: ${member.user.tag} (${member.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}` 
                        )
                        .setTimestamp();

                    logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};