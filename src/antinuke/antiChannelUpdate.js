import {
    AuditLogEvent,
    ChannelType,
    EmbedBuilder,
} from 'discord.js';
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
        client.on('channelUpdate', async (oldChannel, newChannel) => {
            if (!newChannel?.guild || newChannel.isThread?.()) return;
            const guild = newChannel.guild;
            const event = 'antiChannelUpdate';

            if (oldChannel) {
                blueprintManager.seedChannelIfMissing(oldChannel);
            }

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelUpdate, newChannel.id, client);
            if (!executor?.id) return;

            const coordinator = client.incidentCoordinator || incidentCoordinator;
            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.ChannelUpdate,
                moduleKey: event,
                targetId: newChannel.id,
                executorId: executor.id,
                auditEntryId: executor.auditEntryId || null
            });

            if (incident.decision === 'allow' || incident.trustState === 'trusted') {
                blueprintManager.recordChannel(newChannel, null, { trusted: true });
                return;
            }
            if (incident.decision !== 'enforce') return;

            const trackingKey = `${guild.id}_antiChannelUpdate_${newChannel.id}_${executor.id}`;
            const punishPromise = punishExecutor(
                guild,
                executor,
                punishment,
                'Roynix Antinuke System | Anti Channel Update',
                client,
                trackingKey,
                { incident, antinukeData, moduleKey: event, targetId: newChannel.id }
            );

            const recoverPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
                ? coordinator.executeRecovery(incident, async () => {
                    let reverted = false;
                    try {
                        const snap = blueprintManager.getChannelSnapshot(guild.id, newChannel.id);
                        const source = oldChannel?.name ? oldChannel : (snap || oldChannel);
                        const baseOptions = {
                            name: source.name,
                            parent: source.parentId || null,
                            reason: 'Roynix Antinuke System | Reverting Channel Update',
                        };

                        switch (source.type ?? newChannel.type) {
                            case ChannelType.GuildText:
                            case ChannelType.GuildAnnouncement:
                                await newChannel.edit({
                                    ...baseOptions,
                                    topic: source.topic || null,
                                    nsfw: source.nsfw,
                                    rateLimitPerUser: source.rateLimitPerUser,
                                });
                                reverted = true;
                                break;

                            case ChannelType.GuildVoice:
                            case ChannelType.GuildStageVoice:
                                await newChannel.edit({
                                    ...baseOptions,
                                    bitrate: source.bitrate,
                                    userLimit: source.userLimit,
                                });
                                reverted = true;
                                break;

                            case ChannelType.GuildForum:
                                await newChannel.edit({
                                    ...baseOptions,
                                    defaultSortOrder: source.defaultSortOrder,
                                    rateLimitPerUser: source.rateLimitPerUser,
                                });
                                reverted = true;
                                break;

                            case ChannelType.GuildCategory:
                                await newChannel.edit(baseOptions);
                                reverted = true;
                                break;

                            case ChannelType.GuildMedia:
                                await newChannel.edit({
                                    ...baseOptions,
                                    nsfw: source.nsfw,
                                    rateLimitPerUser: source.rateLimitPerUser,
                                });
                                reverted = true;
                                break;

                            default:
                                await newChannel.edit(baseOptions);
                                reverted = true;
                                break;
                        }
                    } catch {}
                    return reverted;
                })
                : Promise.resolve(false);

            const [actionTaken, reverted] = await Promise.all([punishPromise, recoverPromise]);

            const logChannelId = antinukeData.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Channel Update Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                            `${emojis.channel} **Changes Reverted**: ${reverted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
