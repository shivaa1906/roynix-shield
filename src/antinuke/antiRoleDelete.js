import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { quarantineGuildBots } from './zeroTrustQuarantine.js';

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client 
   */
  async execute(client) {
    client.on('roleDelete', async (role) => {
      if (!role.guild) return;
      const guild = role.guild;
      const event = 'antiRoleDelete';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      // Neutralize any other unwhitelisted bots holding administrative roles during destructive actions
      quarantineGuildBots(guild, client, antinukeData).catch(() => null);

      const extraOwners = antinukeData.extraOwners || [];
      const whitelisted = antinukeData.whitelisted || {};
      const punishment = antinukeData.punishment || 'ban';

      let executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, role.id, client);
      const isRaidIncident = circuitBreaker.isLockedDown(guild.id);

      if (executor) {
        if (
          executor.id === client.user.id ||
          executor.id === guild.ownerId ||
          isBotOwner(executor.id) ||
          extraOwners.includes(executor.id) ||
          whitelisted[executor.id]?.events?.includes(event)
        ) return;
      } else if (!isRaidIncident) {
        await new Promise(r => setTimeout(r, 350));
        executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, role.id, client);
        if (executor) {
          if (
            executor.id === client.user.id ||
            executor.id === guild.ownerId ||
            isBotOwner(executor.id) ||
            extraOwners.includes(executor.id) ||
            whitelisted[executor.id]?.events?.includes(event)
          ) return;
        } else {
          return;
        }
      }

      let actionTaken = null;
      if (executor) {
        const trackingKey = `${guild.id}_antiRoleDelete_${role.id}_${executor.id}`;
        actionTaken = await punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Role Delete', client, trackingKey);
        circuitBreaker.recordIncident(guild, client, 'Anti Role Delete', executor).catch(() => null);
      }

      // Auto-Recovery: Recreate role from blueprint with permission sanitization
      let recreated = false;
      if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
        recreated = await blueprintManager.restoreRole(guild, role);
      }

      const logChannelId = antinukeData.logsChannel;
      if (logChannelId && executor) {
        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle('Anti-Role Delete Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
              `${emojis.role} **Role**: \`${role.name}\` (${role.id})\n` +
              `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
              `${emojis.gear} **Role Recreated**: ${recreated ? emojis.tick : emojis.cross}`
            )
            .setTimestamp();

          logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  }
};
