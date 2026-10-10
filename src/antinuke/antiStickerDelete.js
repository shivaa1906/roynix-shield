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
    client.on('stickerDelete', async (sticker) => {
      if (!sticker?.guild) return;
      const guild = sticker.guild;
      const event = 'antiStickerDelete';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const punishment = antinukeData.punishment || 'ban';
      const executor = await getAuditExecutor(guild, AuditLogEvent.StickerDelete, sticker.id, client);
      const coordinator = client.incidentCoordinator || incidentCoordinator;

      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.StickerDelete,
        moduleKey: event,
        targetId: sticker.id,
        executorId: executor?.id || null,
        auditEntryId: executor?.auditEntryId || null
      });

      if (incident.decision !== 'enforce' || !executor?.id) return;

      const trackingKey = `${guild.id}_antiStickerDelete_${sticker.id}_${executor.id}`;
      const punishPromise = punishExecutor(
        guild,
        executor,
        punishment,
        'Roynix Antinuke System | Anti Sticker Delete',
        client,
        trackingKey,
        { incident, antinukeData, moduleKey: event, targetId: sticker.id }
      );
      const recoverPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
        ? coordinator.executeRecovery(incident, async () => {
            try {
              const newSticker = await guild.stickers.create({
                name: sticker.name,
                description: sticker.description || '',
                tags: sticker.tags,
                file: sticker.url,
                reason: 'Roynix Antinuke System | Sticker Recovered'
              });
              return !!newSticker;
            } catch {
              return false;
            }
          })
        : Promise.resolve(false);

      const [actionTaken, recreated] = await Promise.all([punishPromise, recoverPromise]);

      const logChannelId = antinukeData.logsChannel;
      if (logChannelId) {
        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle('Anti-Sticker Delete Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
              `${emojis.sticker} **Sticker**: \`${sticker.name}\` (${sticker.id})\n` +
              `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
              `${emojis.gear} **Sticker Recreated**: ${recreated ? emojis.tick : emojis.cross}`
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  }
};
