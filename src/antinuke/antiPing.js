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
      if (!message.guild || !message.author) return;
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

      const now = Date.now();
      const isMassPing = message.mentions.everyone || 
        ((message.mentions.users?.size || 0) + (message.mentions.roles?.size || 0) >= 4);

      // Bot spam burst detection (quarantine rogue nuke bots spamming channels)
      let isBotSpamBurst = false;
      if (executor.bot) {
        if (!client.botMessageSpamTracker) client.botMessageSpamTracker = new Map();
        const spamKey = `${guild.id}_${executor.id}`;
        let timestamps = client.botMessageSpamTracker.get(spamKey) || [];
        timestamps = timestamps.filter(t => now - t < 3000);
        timestamps.push(now);
        client.botMessageSpamTracker.set(spamKey, timestamps);
        if (timestamps.length >= 4) {
          isBotSpamBurst = true;
        }
      }

      if (isMassPing || isBotSpamBurst) {
        const reason = isBotSpamBurst
          ? 'Roynix Antinuke System | Rogue Bot Message Spam Raid'
          : 'Roynix Antinuke System | Unauthorized Mass Mention';

        const trackingKey = `${guild.id}_antiPing_${executor.id}_${Math.floor(now / 5000)}`;
        const [actionTaken] = await Promise.all([
          punishExecutor(guild, executor, punishment, reason, client, trackingKey),
          message.delete().catch(() => null)
        ]);

        if (isBotSpamBurst && message.channel && typeof message.channel.bulkDelete === 'function') {
          message.channel.bulkDelete(6).catch(() => null);
        }

        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle(isBotSpamBurst ? 'Anti-Bot Spam Shield Triggered' : 'Anti-Ping Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username})\n` +
                `${emojis.action} **Violation**: ${isBotSpamBurst ? 'Rapid Message Flooding (Raid)' : 'Mass Mention / @everyone'}\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}`
              )
              .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      }
    });
  }
};
