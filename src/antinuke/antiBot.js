import {
    AuditLogEvent,
    EmbedBuilder
} from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { evaluateActorTrust } from '../utils/securityPolicy.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client
     */
    async execute(client) {
        client.on('guildMemberAdd', async (member) => {
            if (!member?.user?.bot || !member.guild) return;
            const guild = member.guild;
            const event = 'antiBot';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const punishment = antinukeData.punishment || 'ban';

            // 1. Check if the joining bot itself is self or explicitly whitelisted for antiBot
            const targetTrust = evaluateActorTrust({
                guild,
                client,
                antinukeData,
                moduleKey: event,
                executorId: null,
                targetId: member.id
            });
            if (targetTrust.isExempt) return;

            // 2. Resolve inviter BEFORE deciding whether the invited bot is unauthorized
            const executor = await getAuditExecutor(guild, AuditLogEvent.BotAdd, member.id, client);
            const coordinator = client.incidentCoordinator || incidentCoordinator;

            const incident = coordinator.coordinateIncident({
                guild,
                client,
                antinukeData,
                actionType: AuditLogEvent.BotAdd,
                moduleKey: event,
                targetId: member.id,
                executorId: executor?.id || null,
                auditEntryId: executor?.auditEntryId || null
            });

            // 3. Trusted inviter (Guild Owner, Bot Owner, Extra Owner, or antiBot-whitelisted): allow bot
            if (incident.decision === 'allow' || incident.trustState === 'trusted') {
                return;
            }

            // 4. Incomplete/missing attribution: do NOT punish the new bot or any user speculatively
            if (incident.trustState === 'unknown' || !executor?.id) {
                const logChannelId = antinukeData.logsChannel;
                if (logChannelId) {
                    const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                    if (logChannel) {
                        const botTag = member.user.tag || member.user.username || member.id;
                        const embed = new EmbedBuilder()
                            .setColor(client.color)
                            .setTitle('Anti-Bot Alert (Attribution Unresolved)')
                            .setDescription(
                                `${emojis.user} **Executor**: Unknown (Attribution Unresolved)\n` +
                                `${emojis.bot} **Bot Added**: ${botTag} (${member.id})\n` +
                                `${emojis.action} **Actions Taken**: No Action (Unresolved Attribution)\n` +
                                `${emojis.antinuke} **Protection**: ${emojis.warn || emojis.tick} Anti-Bot System`
                            )
                            .setTimestamp();

                        await logChannel.send({ embeds: [embed] }).catch(() => null);
                    }
                }
                return;
            }

            // 5. Confirmed untrusted inviter: remove unauthorized bot and punish inviter via coordinated incident
            const trackingKey = `${guild.id}_antiBot_${member.id}_${executor.id}`;

            const botRemovalPromise = coordinator.executeRecovery(incident, async () => {
                const banned = await guild.bans.create(member.id, { reason: 'Roynix Antinuke System | Unauthorized Bot' })
                    .then((res) => (res !== null && res !== false ? 'Bot Banned' : null))
                    .catch(() => null);
                if (banned) return banned;

                const kicked = await member.kick('Roynix Antinuke System | Unauthorized Bot')
                    .then((res) => (res !== null && res !== false ? 'Bot Kicked' : null))
                    .catch(() => null);
                return kicked || false;
            });

            const inviterPunishPromise = punishExecutor(
                guild,
                executor,
                punishment,
                'Roynix Antinuke System | Unauthorized Bot Addition',
                client,
                trackingKey,
                { incident, antinukeData, moduleKey: event, targetId: member.id }
            );

            const [botResult, executorAction] = await Promise.all([botRemovalPromise, inviterPunishPromise]);
            const botStatusText = typeof botResult === 'string' ? botResult : 'Failed to Remove Bot';
            const actionTaken = `${botStatusText}, ${executorAction || 'No Action on Inviter'}`;

            const logChannelId = antinukeData.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const executorTag = executor.tag || executor.username || executor.id;
                    const botTag = member.user.tag || member.user.username || member.id;
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Bot Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executorTag})\n` +
                            `${emojis.bot} **Bot Added**: ${botTag} (${member.id})\n` +
                            `${emojis.action} **Actions Taken**: ${actionTaken}\n` +
                            `${emojis.antinuke} **Protection**: ${emojis.tick} Anti-Bot System`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};