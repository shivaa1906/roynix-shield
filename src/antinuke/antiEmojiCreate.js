import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * @param {import('../base/Roynix.js').Roynix} client 
     */
    async execute(client) {
        client.on('emojiCreate', async (emoji) => {
            const guild = emoji?.guild;
            if (!guild) return;
            const event = 'antiEmojiCreate';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.EmojiCreate, emoji.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.EmojiCreate,
                moduleKey: event,
                targetId: emoji.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            if (incident.decision !== 'enforce' || !executor?.id) return;

            const trackingKey = `${guild.id}_antiEmojiCreate_${emoji.id}_${executor.id}`;
            const [actionTaken, emojiDeleted] = await Promise.all([
                punishExecutor(
                    guild,
                    executor,
                    punishment,
                    'Roynix Antinuke System | Anti Emoji Create',
                    client,
                    trackingKey,
                    { incident, antinukeData, moduleKey: event, targetId: emoji.id }
                ),
                !antinukeData?.disabledEvents?.includes('autoRecovery')
                    ? coordinator.executeRecovery(incident, () =>
                        emoji.delete('Roynix Antinuke System | Unauthorized Emoji Creation').then(() => true).catch(() => false)
                    )
                    : Promise.resolve(false)
            ]);

            const logChannelId = antinukeData.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Emoji Create Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.emoji} **Emoji**: \`${emoji.name}\` (${emoji.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                            `${emojis.trash} **Emoji Deleted**: ${emojiDeleted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
