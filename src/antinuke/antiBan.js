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
        client.on('guildBanAdd', async (ban) => {
            const guild = ban?.guild;
            const user = ban?.user;
            if (!guild || !user) return;

            const event = 'antiBan';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData?.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanAdd, user.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.MemberBanAdd,
                moduleKey: event,
                targetId: user.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            if (incident.decision !== 'enforce' || !executor?.id) return;

            quarantineGuildBots(guild, client, antinukeData).catch(() => null);

            if (coordinator.claimCircuitBreaker(incident)) {
                circuitBreaker.recordIncident(guild, client, 'Anti Ban', executor, {
                    incidentKey: incident.incidentId,
                    auditEntryId: executor?.auditEntryId || null,
                    targetId: user.id,
                    moduleKey: event
                }).catch(() => null);
            }

            const trackingKey = `${guild.id}_antiBan_${user.id}_${executor.id}`;
            const punishPromise = punishExecutor(
                guild,
                executor,
                punishment,
                'Roynix Antinuke System | Anti Ban',
                client,
                trackingKey,
                { incident, antinukeData, moduleKey: event, targetId: user.id }
            );
            const recoverPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
                ? coordinator.executeRecovery(incident, async () => {
                    try {
                        await guild.bans.remove(user.id, 'Roynix Antinuke System | Unauthorized Ban');
                        return true;
                    } catch {
                        return false;
                    }
                })
                : Promise.resolve(false);

            const [actionTaken, unbanned] = await Promise.all([punishPromise, recoverPromise]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Ban Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
                            `${emojis.user} **Banned User**: <@${user.id}> (${user.tag || user.username || user.id})\n` +
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
