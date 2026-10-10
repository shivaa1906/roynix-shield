import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor, resolveEntryExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

const PRUNE_ACTION = AuditLogEvent.MemberPrune ?? AuditLogEvent.Prune ?? 21;

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client
   */
  async execute(client) {
    client.on('guildAuditLogEntryCreate', async (entry, guild) => {
      if (!entry || !guild || entry.action !== PRUNE_ACTION) return;
      const event = 'antiPrune';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const punishment = antinukeData.punishment || 'ban';
      const executor = resolveEntryExecutor(guild, entry, entry.id)
        || await getAuditExecutor(guild, PRUNE_ACTION, null, client);
      const coordinator = client.incidentCoordinator || incidentCoordinator;

      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: PRUNE_ACTION,
        moduleKey: event,
        targetId: null,
        executorId: executor?.id || null,
        auditEntryId: entry.id || executor?.auditEntryId || null
      });

      if (incident.decision !== 'enforce' || !executor?.id) return;

      const trackingKey = `${guild.id}_antiPrune_${entry.id || 'targetless'}_${executor.id}`;
      const actionTaken = await punishExecutor(
        guild,
        executor,
        punishment,
        'Roynix Antinuke System | Anti Prune',
        client,
        trackingKey,
        { incident, antinukeData, moduleKey: event, targetId: null }
      );

      const logChannelId = antinukeData.logsChannel;
      if (logChannelId) {
        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle('Anti-Prune Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
              `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
              `${emojis.gear} **Estimated Users Pruned**: \`${entry.extra?.pruned ?? 'Unknown'}\``
            )
            .setTimestamp();

          logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  }
};
