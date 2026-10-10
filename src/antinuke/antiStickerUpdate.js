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
    client.on('stickerUpdate', async (oldSticker, newSticker) => {
      if (!newSticker?.guild) return;
      const guild = newSticker.guild;
      const event = 'antiStickerUpdate';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const punishment = antinukeData.punishment || 'ban';
      const executor = await getAuditExecutor(guild, AuditLogEvent.StickerUpdate, newSticker.id, client);
      const coordinator = client.incidentCoordinator || incidentCoordinator;

      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.StickerUpdate,
        moduleKey: event,
        targetId: newSticker.id,
        executorId: executor?.id || null,
        auditEntryId: executor?.auditEntryId || null
      });

      if (incident.decision !== 'enforce' || !executor?.id) return;

      const trackingKey = `${guild.id}_antiStickerUpdate_${newSticker.id}_${executor.id}`;
      const punishPromise = punishExecutor(
        guild,
        executor,
        punishment,
        'Roynix Antinuke System | Anti Sticker Update',
        client,
        trackingKey,
        { incident, antinukeData, moduleKey: event, targetId: newSticker.id }
      );
      const revertPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
        ? coordinator.executeRecovery(incident, async () => {
            try {
              if (oldSticker.name !== newSticker.name || oldSticker.description !== newSticker.description) {
                await newSticker.edit({
                  name: oldSticker.name,
                  description: oldSticker.description || null,
                }, 'Roynix Antinuke System | Reverting Sticker Update');
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
            .setTitle('Anti-Sticker Update Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
              `${emojis.sticker} **Sticker**: \`${newSticker.name}\` (${newSticker.id})\n` +
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
