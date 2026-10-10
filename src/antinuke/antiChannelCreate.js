import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { quarantineGuildBots } from './zeroTrustQuarantine.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('channelCreate', async (channel) => {
            if (!channel?.guild) return;
            const guild = channel.guild;
            const event = 'antiChannelCreate';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData?.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelCreate, channel.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.ChannelCreate,
                moduleKey: event,
                targetId: channel.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            if (incident.decision !== 'enforce' || !executor?.id) return;

            quarantineGuildBots(guild, client, antinukeData).catch(() => null);

            blueprintManager.removeChannelSnapshot(guild.id, channel.id);

            if (coordinator.claimCircuitBreaker(incident)) {
                circuitBreaker.recordIncident(guild, client, 'Anti Channel Create', executor, {
                    incidentKey: incident.incidentId,
                    auditEntryId: executor?.auditEntryId || null,
                    targetId: channel.id,
                    moduleKey: event
                }).catch(() => null);
            }

            const trackingKey = `${guild.id}_antiChannelCreate_${channel.id}_${executor.id}`;
            const [actionTaken, channelDeleted] = await Promise.all([
                punishExecutor(
                    guild,
                    executor,
                    punishment,
                    'Roynix Antinuke System | Anti Channel Create',
                    client,
                    trackingKey,
                    { incident, antinukeData, moduleKey: event, targetId: channel.id }
                ),
                coordinator.executeRecovery(incident, () =>
                    channel.delete('Roynix Antinuke System | Unauthorized Channel Creation').then(() => true).catch(() => false)
                )
            ]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle("Anti-Channel Create Triggered")
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
                            `${emojis.channel} **Channel**: \`${channel.name}\` (${channel.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || "No Action"}\n` +
                            `${emojis.trash} **Channel Deleted**: ${channelDeleted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
