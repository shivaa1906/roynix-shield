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
    client.on('emojiDelete', async (emoji) => {
      const guild = emoji?.guild;
      if (!guild) return;
      const event = 'antiEmojiDelete';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const punishment = antinukeData.punishment || 'ban';
      const executor = await getAuditExecutor(guild, AuditLogEvent.EmojiDelete, emoji.id, client);
      const coordinator = client.incidentCoordinator || incidentCoordinator;

      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.EmojiDelete,
        moduleKey: event,
        targetId: emoji.id,
        executorId: executor?.id || null,
        auditEntryId: executor?.auditEntryId || null
      });

      if (incident.decision !== 'enforce' || !executor?.id) return;

      const trackingKey = `${guild.id}_antiEmojiDelete_${emoji.id}_${executor.id}`;
      const punishPromise = punishExecutor(
        guild,
        executor,
        punishment,
        'Roynix Antinuke System | Anti Emoji Delete',
        client,
        trackingKey,
        { incident, antinukeData, moduleKey: event, targetId: emoji.id }
      );
      const recoverPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
        ? coordinator.executeRecovery(incident, async () => {
            try {
              const emojiBuffer = await fetch(emoji.url).then(res => res.arrayBuffer());
              const file = Buffer.from(emojiBuffer);
              const newEmoji = await guild.emojis.create({
                attachment: file,
                name: emoji.name,
                reason: 'Roynix Antinuke System | Emoji Recovered'
              });
              return !!newEmoji;
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
            .setTitle('Anti-Emoji Delete Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
              `${emojis.emoji} **Emoji**: \`${emoji.name}\` (${emoji.id})\n` +
              `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
              `${emojis.gear} **Emoji Recreated**: ${recreated ? emojis.tick : emojis.cross}`
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  }
};
