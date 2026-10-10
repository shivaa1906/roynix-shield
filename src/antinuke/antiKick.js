import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { quarantineGuildBots } from './zeroTrustQuarantine.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('guildMemberRemove', async (member) => {
            if (!member?.guild) return;
            const guild = member.guild;
            const event = 'antiKick';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData?.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberKick, member.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.MemberKick,
                moduleKey: event,
                targetId: member.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            if (incident.decision !== 'enforce' || !executor?.id) return;

            quarantineGuildBots(guild, client, antinukeData).catch(() => null);

            if (coordinator.claimCircuitBreaker(incident)) {
                circuitBreaker.recordIncident(guild, client, 'Anti Kick', executor, {
                    incidentKey: incident.incidentId,
                    auditEntryId: executor?.auditEntryId || null,
                    targetId: member.id,
                    moduleKey: event
                }).catch(() => null);
            }

            const trackingKey = `${guild.id}_antiKick_${member.id}_${executor.id}`;
            const actionTaken = await punishExecutor(
                guild,
                executor,
                punishment,
                'Roynix Antinuke System | Anti Kick',
                client,
                trackingKey,
                { incident, antinukeData, moduleKey: event, targetId: member.id }
            );

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Kick Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
                            `${emojis.user} **Kicked User**: ${member.user?.tag || member.user?.username || member.id} (${member.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}`
                        )
                        .setTimestamp();

                    logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};