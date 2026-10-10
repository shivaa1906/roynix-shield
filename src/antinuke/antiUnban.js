import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('guildBanRemove', async (ban) => {
            const guild = ban?.guild;
            const user = ban?.user;
            if (!guild || !user) return;

            const event = 'antiUnban';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData?.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanRemove, user.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.MemberBanRemove,
                moduleKey: event,
                targetId: user.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            if (incident.decision !== 'enforce' || !executor?.id) return;

            const trackingKey = `${guild.id}_antiUnban_${user.id}_${executor.id}`;
            const punishPromise = punishExecutor(
                guild,
                executor,
                punishment,
                'Roynix Antinuke System | Anti Unban',
                client,
                trackingKey,
                { incident, antinukeData, moduleKey: event, targetId: user.id }
            );
            const rebanPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
                ? coordinator.executeRecovery(incident, async () => {
                    try {
                        await guild.bans.create(user.id, { reason: 'Roynix Antinuke System | Unauthorized Unban Reverted' });
                        return true;
                    } catch {
                        return false;
                    }
                })
                : Promise.resolve(false);

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
