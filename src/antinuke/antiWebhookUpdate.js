import {
    AuditLogEvent,
    EmbedBuilder,
  } from 'discord.js';
  import { isBotOwner } from '../utils/isBotOwner.js';
  import emojis from '../config/emojis.js';
  import { punishExecutor } from '../utils/punishExecutor.js';
  
  export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client
     */
    async execute(client) {
      client.on('webhooksUpdates', async (channel) => {
        if (!channel.guild) return;
        const guild = channel.guild;
        const event = 'antiWebhookUpdate';
  
        const antinukeData = await client.getAntinukeData(guild.id);
        if (!antinukeData?.enabled) return;
        if (antinukeData?.disabledEvents?.includes(event)) return;
  
        const extraOwners = antinukeData.extraOwners || [];
        const whitelisted = antinukeData.whitelisted || {};
        const punishment = antinukeData.punishment || 'ban';
  
        let entry = null;
        if (client.auditLogCache) {
          const cached = client.auditLogCache.get(guild.id);
          if (cached && [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookDelete, AuditLogEvent.WebhookUpdate].includes(cached.action)) {
            const age = Date.now() - cached.timestamp;
            if (age < 5000 && (!cached.entry?.target?.channelId || cached.entry?.target?.channelId === channel.id)) {
              entry = cached.entry;
            }
          }
        }

        if (!entry) {
          const logs = await guild.fetchAuditLogs({ limit: 3 }).catch(() => null);
          entry = logs?.entries.find(e =>
            [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookDelete, AuditLogEvent.WebhookUpdate].includes(e.action) &&
            e.target &&
            'channelId' in e.target &&
            e.target.channelId === channel.id
          );
        }
  
        if (!entry) return;
  
        const executor = entry.executor;
        const actionType = entry.action;
  
        if (
          executor.id === client.user.id ||
          executor.id === guild.ownerId ||
          isBotOwner(executor.id) ||
          extraOwners.includes(executor.id) ||
          whitelisted[executor.id]?.events?.includes(event)
        ) return;
  
        const trackingKey = `${guild.id}_antiWebhookUpdate_${channel.id}_${executor.id}`;
        const actionTaken = await punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Webhook Update', client, trackingKey);
  
        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle('Anti-Webhook Update Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                `${emojis.action} **Action Type**: ${actionType.toString().replace('Webhook', '')}\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}`
              )
              .setTimestamp();
  
            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      });
    },
  };
  