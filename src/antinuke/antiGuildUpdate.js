import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * 
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('guildUpdate', async (oldGuild, newGuild) => {
            const event = 'antiGuildUpdate';
            const guild = newGuild;
            if (!guild?.id) return;

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData?.punishment || 'ban';
            const executor = await getAuditExecutor(guild, AuditLogEvent.GuildUpdate, guild.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.GuildUpdate,
                moduleKey: event,
                targetId: guild.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            if (incident.decision !== 'enforce' || !executor?.id) return;

            const trackingKey = `${guild.id}_antiGuildUpdate_${guild.id}_${executor.id}`;
            const punishPromise = punishExecutor(
                guild,
                executor,
                punishment,
                'Roynix Antinuke System | Anti Guild Update',
                client,
                trackingKey,
                { incident, antinukeData, moduleKey: event, targetId: guild.id }
            );

            const revertPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
                ? coordinator.executeRecovery(incident, async () => {
                    try {
                        await newGuild.edit({
                            name: oldGuild.name,
                            description: oldGuild.description || null,
                            icon: oldGuild.iconURL?.({ dynamic: true }) || null,
                            banner: oldGuild.bannerURL?.({ dynamic: true }) || null,
                            splash: oldGuild.splashURL?.({ dynamic: true }) || null,
                            systemChannel: oldGuild.systemChannelId || null,
                            verificationLevel: oldGuild.verificationLevel,
                            defaultMessageNotifications: oldGuild.defaultMessageNotifications,
                            explicitContentFilter: oldGuild.explicitContentFilter,
                            afkChannel: oldGuild.afkChannelId || null,
                            afkTimeout: oldGuild.afkTimeout,
                            features: oldGuild.features || null,
                        }, "Roynix Antinuke System | Guild Update Reverted");
                        return true;
                    } catch {
                        return false;
                    }
                })
                : Promise.resolve(false);

            const [actionTaken, guildReverted] = await Promise.all([punishPromise, revertPromise]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle("Anti-Guild Update Triggered")
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || "No Action"}\n` +
                            `${emojis.server} **Guild Changes Reverted**: ${guildReverted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
