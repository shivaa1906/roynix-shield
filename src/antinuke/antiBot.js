import {
    AuditLogEvent,
    EmbedBuilder,
    PermissionFlagsBits
  } from 'discord.js';
  import { isBotOwner } from '../utils/isBotOwner.js';
  import emojis from '../config/emojis.js';
  import { getAuditExecutor } from '../utils/getExecutor.js';
  import { punishExecutor } from '../utils/punishExecutor.js';
  
  export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
      client.on('guildMemberAdd', async (member) => {
        if (!member.user.bot) return; 
        const guild = member.guild;
        const event = 'antiBot';
  
        const antinukeData = await client.getAntinukeData(guild.id);
        if (!antinukeData?.enabled) return;
        if (antinukeData?.disabledEvents?.includes(event)) return;
  
        const extraOwners = antinukeData.extraOwners || [];
        const whitelisted = antinukeData.whitelisted || {};
        const punishment = antinukeData.punishment || 'ban';
  
        const executor = await getAuditExecutor(guild, AuditLogEvent.BotAdd, member.id, client);
        if (!executor) return;
  
        if (
          executor.id === client.user.id ||
          executor.id === guild.ownerId ||
          isBotOwner(executor.id) ||
          extraOwners.includes(executor.id) ||
          whitelisted[executor.id]?.events?.includes(event)
        ) return;
  
        const trackingKey = `${guild.id}_antiBot_${member.id}_${executor.id}`;
        const [botKickResult, executorAction] = await Promise.all([
          member.kick('Roynix Antinuke System | Unauthorized Bot').then(() => 'Bot Removed, ').catch(() => 'Failed to Remove Bot, '),
          punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Unauthorized Bot Addition', client, trackingKey)
        ]);
        const actionTaken = botKickResult + executorAction;
  
        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle('Anti-Bot Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                `${emojis.bot} **Bot Added**: ${member.user.tag} (${member.id})\n` +
                `${emojis.action} **Actions Taken**: ${actionTaken || 'No Action'}\n` +
                `${emojis.antinuke} **Protection**: ${emojis.tick} Anti-Bot System`
              )
              .setTimestamp();
  
            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      });
    }
  };