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
    client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
      const guild = newEmoji?.guild;
      if (!guild) return;
      const event = 'antiEmojiUpdate';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const punishment = antinukeData.punishment || 'ban';
      const executor = await getAuditExecutor(guild, AuditLogEvent.EmojiUpdate, newEmoji.id, client);
      const coordinator = client.incidentCoordinator || incidentCoordinator;

      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.EmojiUpdate,
        moduleKey: event,
        targetId: newEmoji.id,
        executorId: executor?.id || null,
        auditEntryId: executor?.auditEntryId || null
      });

      if (incident.decision !== 'enforce' || !executor?.id) return;

      const trackingKey = `${guild.id}_antiEmojiUpdate_${newEmoji.id}_${executor.id}`;
      const punishPromise = punishExecutor(
        guild,
        executor,
        punishment,
        'Roynix Antinuke System | Anti Emoji Update',
        client,
        trackingKey,
        { incident, antinukeData, moduleKey: event, targetId: newEmoji.id }
      );
      const revertPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
        ? coordinator.executeRecovery(incident, async () => {
            try {
              if (oldEmoji.name !== newEmoji.name) {
                await newEmoji.edit({ name: oldEmoji.name }, 'Roynix Antinuke System | Reverting Emoji Update');
                return true;
              }
              return false;
            } catch {
              return false;
            }
          })
        : Promise.resolve(false);

      const [actionTaken, reverted] = await Promise.all([punishPromise, revertPromise]);

      const logChannelId = antinukeData.logsChannel;
      if (logChannelId) {
        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle('Anti-Emoji Update Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
              `${emojis.emoji} **Emoji**: \`${newEmoji.name}\` (${newEmoji.id})\n` +
              `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
              `${emojis.gear} **Changes Reverted**: ${reverted ? emojis.tick : emojis.cross}`
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  }
};
