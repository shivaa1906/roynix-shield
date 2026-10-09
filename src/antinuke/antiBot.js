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
  
        if (member.id === client.user.id) return;
        // If bot is explicitly whitelisted, allow it
        if (whitelisted[member.id]?.events?.includes(event) || whitelisted[member.id]?.whitelisted) return;

        // Instant 0ms ban on the rogue bot itself
        const botBanPromise = guild.bans.create(member.id, { reason: 'Roynix Antinuke System | Unauthorized Bot' })
            .then(() => 'Bot Banned, ')
            .catch(() => member.kick('Roynix Antinuke System | Unauthorized Bot').then(() => 'Bot Kicked, ').catch(() => 'Failed to Remove Bot, '));

        const executor = await getAuditExecutor(guild, AuditLogEvent.BotAdd, member.id, client);
        let executorAction = 'No Action on Inviter';

        if (executor && 
            executor.id !== client.user.id && 
            executor.id !== guild.ownerId && 
            !isBotOwner(executor.id) && 
            !extraOwners.includes(executor.id) && 
            !whitelisted[executor.id]?.events?.includes(event)
        ) {
            const trackingKey = `${guild.id}_antiBot_${member.id}_${executor.id}`;
            executorAction = await punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Unauthorized Bot Addition', client, trackingKey);
        }

        const botResult = await botBanPromise;
        const actionTaken = botResult + executorAction;
  
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