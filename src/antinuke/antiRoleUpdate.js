import {
    AuditLogEvent,
    EmbedBuilder,
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
      client.on('roleUpdate', async (oldRole, newRole) => {
        const guild = newRole.guild;
        const event = 'antiRoleUpdate';
  
        const antinukeData = await client.getAntinukeData(guild.id);
        if (!antinukeData?.enabled) return;
        if (antinukeData?.disabledEvents?.includes(event)) return;
  
        const extraOwners = antinukeData.extraOwners || [];
        const whitelisted = antinukeData.whitelisted || {};
        const punishment = antinukeData.punishment || 'ban';
  
        const executor = await getAuditExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id, client);
        if (!executor) return;
  
        if (
          executor.id === client.user.id ||
          executor.id === guild.ownerId ||
          isBotOwner(executor.id) ||
          extraOwners.includes(executor.id) ||
          whitelisted[executor.id]?.events?.includes(event)
        ) return;
  
        const trackingKey = `${guild.id}_antiRoleUpdate_${newRole.id}_${executor.id}`;
        const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Role Update', client, trackingKey);
        const revertPromise = (async () => {
          if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
            try {
              await newRole.edit({
                name: oldRole.name,
                color: oldRole.color,
                hoist: oldRole.hoist,
                permissions: oldRole.permissions,
                mentionable: oldRole.mentionable,
                position: oldRole.position
              }, 'Roynix Antinuke System | Reverting Role Update');
              return true;
            } catch {
              return false;
            }
          }
          return false;
        })();

        const [actionTaken, reverted] = await Promise.all([punishPromise, revertPromise]);
  
        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle('Anti-Role Update Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                `${emojis.role} **Changes Reverted**: ${reverted ? emojis.tick : emojis.cross}`
              )
              .setTimestamp();
  
            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      });
    }
  };
  