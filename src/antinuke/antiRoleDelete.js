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
    client.on('roleDelete', async (role) => {
      if (!role.guild) return;
      const guild = role.guild;
      const event = 'antiRoleDelete';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const extraOwners = antinukeData.extraOwners || [];
      const whitelisted = antinukeData.whitelisted || {};
      const punishment = antinukeData.punishment || 'ban';

      const executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, role.id, client);
      if (!executor) return;

      if (
        executor.id === client.user.id ||
        executor.id === guild.ownerId ||
        isBotOwner(executor.id) ||
        extraOwners.includes(executor.id) ||
        whitelisted[executor.id]?.events?.includes(event)
      ) return;

      const trackingKey = `${guild.id}_antiRoleDelete_${role.id}_${executor.id}`;
      const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Role Delete', client, trackingKey);
      const recoverPromise = (async () => {
        if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
          try {
            const newRole = await guild.roles.create({
              name: role.name,
              color: role.color,
              hoist: role.hoist,
              permissions: role.permissions,
              mentionable: role.mentionable,
              position: role.rawPosition,
              reason: 'Roynix Antinuke System | Role Recovered',
            });
            return !!newRole;
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
            .setTitle('Anti-Role Delete Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
              `${emojis.role} **Role**: \`${role.name}\` (${role.id})\n` +
              `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
              `${emojis.gear} **Role Recreated**: ${recreated ? emojis.tick : emojis.cross}`
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  }
};
