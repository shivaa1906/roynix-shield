import {
    AuditLogEvent,
    ChannelType,
    EmbedBuilder,
} from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { quarantineGuildBots } from './zeroTrustQuarantine.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('channelDelete', async (channel) => {
            if (!channel.guild || channel.isThread?.()) return;
            const guild = channel.guild;
            const event = 'antiChannelDelete';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            // Neutralize any other unwhitelisted bots holding administrative roles during destructive actions
            quarantineGuildBots(guild, client, antinukeData).catch(() => null);

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};
            const punishment = antinukeData.punishment || 'ban';

            let executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id, client);
            const isRaidIncident = circuitBreaker.isLockedDown(guild.id);

            if (executor) {
                if (
                    executor.id === client.user.id ||
                    executor.id === guild.ownerId ||
                    isBotOwner(executor.id) ||
                    extraOwners.includes(executor.id) ||
                    whitelisted[executor.id]?.events?.includes(event)
                ) return; // Authorized deletion by server owner or whitelisted manager
            } else if (!isRaidIncident) {
                // Wait up to 350ms to allow gateway/REST audit log to register before deciding
                await new Promise(r => setTimeout(r, 350));
                executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id, client);
                if (executor) {
                    if (
                        executor.id === client.user.id ||
                        executor.id === guild.ownerId ||
                        isBotOwner(executor.id) ||
                        extraOwners.includes(executor.id) ||
                        whitelisted[executor.id]?.events?.includes(event)
                    ) return;
                } else {
                    // Still no executor and no active raid burst detected, abort
                    return;
                }
            }

            let actionTaken = null;
            if (executor) {
                const trackingKey = `${guild.id}_antiChannelDelete_${channel.id}_${executor.id}`;
                actionTaken = await punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Channel Delete', client, trackingKey);
                circuitBreaker.recordIncident(guild, client, 'Anti Channel Delete', executor).catch(() => null);
            }

            // Auto-Recovery: Recreate channel with full hierarchical fidelity & multi-tier fallbacks
            let recreated = false;
            if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
                recreated = await blueprintManager.restoreChannelHierarchical(guild, channel);
            }

            const logChannelId = antinukeData.logsChannel;
            if (logChannelId && executor) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Channel Delete Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
                            `${emojis.channel} **Channel**: \`${channel.name}\` (${channel.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                            `${emojis.gear} **Channel Recreated**: ${recreated ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};