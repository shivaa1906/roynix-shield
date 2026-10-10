import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('roleCreate', async (role) => {
            const guild = role?.guild;
            if (!guild || role?.managed) return;
            const event = 'antiRoleCreate';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData?.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.RoleCreate, role.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.RoleCreate,
                moduleKey: event,
                targetId: role.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            if (incident.decision !== 'enforce' || !executor?.id) return;

            blueprintManager.removeRoleSnapshot(guild.id, role.id);

            const trackingKey = `${guild.id}_antiRoleCreate_${role.id}_${executor.id}`;
            const [actionTaken, roleDeleted] = await Promise.all([
                punishExecutor(
                    guild,
                    executor,
                    punishment,
                    'Roynix Antinuke System | Anti Role Create',
                    client,
                    trackingKey,
                    { incident, antinukeData, moduleKey: event, targetId: role.id }
                ),
                coordinator.executeRecovery(incident, () =>
                    role.delete('Roynix Antinuke System | Unauthorized Role Creation').then(() => true).catch(() => false)
                )
            ]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle("Anti-Role Create Triggered")
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
                            `${emojis.role} **Role**: \`${role.name}\` (${role.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || "No Action"}\n` +
                            `${emojis.trash} **Role Deleted**: ${roleDeleted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
