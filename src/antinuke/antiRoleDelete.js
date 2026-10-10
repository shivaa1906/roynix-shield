import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { quarantineGuildBots } from './zeroTrustQuarantine.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client 
   */
  async execute(client) {
    client.on('roleDelete', async (role) => {
      if (!role?.guild) return;
      const guild = role.guild;
      const event = 'antiRoleDelete';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;

      const isProtectRole = Boolean(antinukeData?.protectRole && role.id === antinukeData.protectRole);
      if (antinukeData?.disabledEvents?.includes(event) && !isProtectRole) return;

      const punishment = antinukeData.punishment || 'ban';
      const executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, role.id, client);
      const isRaidIncident = circuitBreaker.isLockedDown(guild.id);
      const coordinator = client.incidentCoordinator || incidentCoordinator;

      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.RoleDelete,
        moduleKey: event,
        targetId: role.id,
        executorId: executor?.id || null,
        auditEntryId: executor?.auditEntryId || null,
        isRaidIncident,
        isProtectRole
      });

      if (incident.decision === 'allow' || incident.trustState === 'trusted') {
        blueprintManager.removeRoleSnapshot(guild.id, role.id);
        if (isProtectRole) {
          antinukeData.protectRole = null;
          if (typeof client?.antinukeDB?.set === 'function') {
            await client.antinukeDB.set(`antinukeData_${guild.id}.protectRole`, null).catch(() => null);
          } else if (typeof client?.setAntinukeData === 'function') {
            await client.setAntinukeData(guild.id, { ...antinukeData, protectRole: null }).catch(() => null);
          }
        }
        return;
      }
      if (incident.decision !== 'enforce' && !isRaidIncident && !isProtectRole) {
        return;
      }

      if (incident.decision === 'enforce' || isRaidIncident) {
        quarantineGuildBots(guild, client, antinukeData).catch(() => null);
      }

      let actionTaken = null;
      if (incident.decision === 'enforce' && executor?.id) {
        const trackingKey = `${guild.id}_antiRoleDelete_${role.id}_${executor.id}`;
        actionTaken = await punishExecutor(
          guild,
          executor,
          punishment,
          isProtectRole
            ? 'Roynix Antinuke System | Protection Role Deleted'
            : 'Roynix Antinuke System | Anti Role Delete',
          client,
          trackingKey,
          { incident, antinukeData, moduleKey: event, targetId: role.id }
        );
        if (coordinator.claimCircuitBreaker(incident)) {
          circuitBreaker.recordIncident(guild, client, 'Anti Role Delete', executor, {
            incidentKey: incident.incidentId,
            auditEntryId: executor?.auditEntryId || null,
            targetId: role.id,
            moduleKey: event
          }).catch(() => null);
        }
      }

      // Auto-Recovery: Recreate role from blueprint with permission sanitization (deduplicated per incident)
      let recreated = false;
      if (isProtectRole || !antinukeData?.disabledEvents?.includes('autoRecovery')) {
        recreated = await coordinator.executeRecovery(
          incident,
          () => blueprintManager.restoreRole(guild, role),
          { allowAuthorizedUnattributed: isRaidIncident || isProtectRole }
        );
        if (isProtectRole && recreated) {
          const newProtectRoleId = blueprintManager.recreatedRoles.get(role.id);
          if (newProtectRoleId && antinukeData.protectRole !== newProtectRoleId) {
            antinukeData.protectRole = newProtectRoleId;
            if (typeof client?.antinukeDB?.set === 'function') {
              await client.antinukeDB.set(`antinukeData_${guild.id}.protectRole`, newProtectRoleId).catch(() => null);
            } else if (typeof client?.setAntinukeData === 'function') {
              await client.setAntinukeData(guild.id, { ...antinukeData, protectRole: newProtectRoleId }).catch(() => null);
            }
          }
        }
      }

      const logChannelId = antinukeData.logsChannel;
      if (logChannelId && executor?.id) {
        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle(isProtectRole ? 'Protection Role Deletion Blocked' : 'Anti-Role Delete Triggered')
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
