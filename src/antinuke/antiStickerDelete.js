import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client 
   */
  async execute(client) {
    client.on('stickerDelete', async (sticker) => {
      if (!sticker.guild) return;
      const guild = sticker.guild;
      const event = 'antiStickerDelete';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const extraOwners = antinukeData.extraOwners || [];
      const whitelisted = antinukeData.whitelisted || {};
      const punishment = antinukeData.punishment || 'ban';

      const executor = await getAuditExecutor(guild, AuditLogEvent.StickerDelete, sticker.id, client);
      if (!executor) return;

      if (
        executor.id === client.user.id ||
        executor.id === guild.ownerId ||
        isBotOwner(executor.id) ||
        extraOwners.includes(executor.id) ||
        whitelisted[executor.id]?.events?.includes(event)
      ) return;

      const trackingKey = `${guild.id}_antiStickerDelete_${sticker.id}_${executor.id}`;
      const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Sticker Delete', client, trackingKey);
      const recoverPromise = (async () => {
        if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
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
        }
        return false;
      })();

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
