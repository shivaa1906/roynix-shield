import {
    AuditLogEvent,
    EmbedBuilder,
} from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { quarantineGuildBots } from './zeroTrustQuarantine.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('channelDelete', async (channel) => {
            if (!channel?.guild || channel.isThread?.()) return;
            const guild = channel.guild;
            const event = 'antiChannelDelete';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id, client);
            const isRaidIncident = circuitBreaker.isLockedDown(guild.id);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.ChannelDelete,
                moduleKey: event,
                targetId: channel.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null,
                isRaidIncident
            });

            if (incident.decision === 'allow' || incident.trustState === 'trusted') {
                blueprintManager.removeChannelSnapshot(guild.id, channel.id);
                return;
            }
            if (incident.decision !== 'enforce' && !isRaidIncident) {
                return;
            }

            quarantineGuildBots(guild, client, antinukeData).catch(() => null);

            const punishTask = (incident.decision === 'enforce' && executor?.id)
                ? (async () => {
                    const trackingKey = `${guild.id}_antiChannelDelete_${channel.id}_${executor.id}`;
                    const res = await punishExecutor(
                        guild,
                        executor,
                        punishment,
                        'Roynix Antinuke System | Anti Channel Delete',
                        client,
                        trackingKey,
                        { incident, antinukeData, moduleKey: event, targetId: channel.id }
                    );
                    if (coordinator.claimCircuitBreaker(incident)) {
                        circuitBreaker.recordIncident(guild, client, 'Anti Channel Delete', executor, {
                            incidentKey: incident.incidentId,
                            auditEntryId: executor?.auditEntryId || null,
                            targetId: channel.id,
                            moduleKey: event
                        }).catch(() => null);
                    }
                    return res;
                })()
                : Promise.resolve(null);

            const recoverTask = !antinukeData?.disabledEvents?.includes('autoRecovery')
                ? coordinator.executeRecovery(
                    incident,
                    () => blueprintManager.restoreChannelHierarchical(guild, channel),
                    { allowAuthorizedUnattributed: isRaidIncident }
                )
                : Promise.resolve(false);

            const [actionTaken, recreated] = await Promise.all([punishTask, recoverTask]);

            const logChannelId = antinukeData.logsChannel;
            if (logChannelId && executor?.id) {
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