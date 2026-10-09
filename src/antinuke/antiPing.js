import { EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client 
   */
  async execute(client) {
    client.on('messageCreate', async (message) => {
      if (!message.guild) return;
      const guild = message.guild;
      const event = 'antiPing';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const extraOwners = antinukeData?.extraOwners || [];
      const whitelisted = antinukeData?.whitelisted || {};
      const punishment = antinukeData?.punishment || 'ban';

      const executor = message.author;
      if (
        executor.id === client.user.id ||
        executor.id === guild.ownerId ||
        isBotOwner(executor.id) ||
        extraOwners.includes(executor.id) ||
        whitelisted[executor.id]?.events?.includes(event)
      ) return;

      if (message.mentions.everyone) {
        const trackingKey = `${guild.id}_antiPing_${message.id}_${executor.id}`;
        const [actionTaken] = await Promise.all([
          punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Mass Ping', client, trackingKey),
          message.delete().catch(() => null)
        ]);

        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle('Anti-Ping Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                `${emojis.message} **Message**: [Jump](${message.url})\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}`
              )
              .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }

        await message.delete().catch(() => null);
      }
    });
  }
};
