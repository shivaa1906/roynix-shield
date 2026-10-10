import {
  AuditLogEvent,
  EmbedBuilder,
  PermissionsBitField,
} from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client
   */
  async execute(client) {
    client.on('roleUpdate', async (oldRole, newRole) => {
      if (!newRole?.guild) return;
      const guild = newRole.guild;
      const event = 'antiRoleUpdate';

      if (oldRole) {
        blueprintManager.seedRoleIfMissing(oldRole);
      }

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;

      const isProtectRole = Boolean(
        antinukeData?.protectRole &&
        (newRole.id === antinukeData.protectRole || oldRole?.id === antinukeData.protectRole)
      );

      if (antinukeData?.disabledEvents?.includes(event) && !isProtectRole) return;

      const punishment = antinukeData.punishment || 'ban';

      const executor = await getAuditExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id, client);

      const coordinator = client.incidentCoordinator || incidentCoordinator;
      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.RoleUpdate,
        moduleKey: event,
        targetId: newRole.id,
        executorId: executor?.id || null,
        auditEntryId: executor?.auditEntryId || null,
        isProtectRole
      });

      if (incident.decision === 'allow' || incident.trustState === 'trusted') {
        blueprintManager.recordRole(newRole, { trusted: true });
        return;
      }
      if (incident.decision !== 'enforce' && !isProtectRole) return;

      if (isProtectRole && !executor?.id) {
        const snap = blueprintManager.getRoleSnapshot(guild.id, newRole.id);
        const expectedName = snap?.name || oldRole?.name || 'Roynix Protect';
        const currentPerms = typeof newRole.permissions?.bitfield === 'bigint'
          ? newRole.permissions.bitfield
          : typeof newRole.permissions === 'bigint'
            ? newRole.permissions
            : 0n;
        const botHighestPos = guild.members?.me?.roles?.highest?.position ?? 0;
        const expectedMinPos = botHighestPos > 1 ? botHighestPos - 1 : 0;
        const isTampered =
          currentPerms !== 0n ||
          (newRole.name && newRole.name !== expectedName) ||
          (expectedMinPos > 0 && typeof newRole.position === 'number' && newRole.position < expectedMinPos);
        if (!isTampered) return;
      }

      const punishPromise = (incident.decision === 'enforce' && executor?.id)
        ? punishExecutor(
            guild,
            executor,
            punishment,
            isProtectRole
              ? 'Roynix Antinuke System | Protection Role Tampering Detected'
              : 'Roynix Antinuke System | Anti Role Update',
            client,
            `${guild.id}_antiRoleUpdate_${newRole.id}_${executor.id}`,
            { incident, antinukeData, moduleKey: event, targetId: newRole.id }
          )
        : Promise.resolve('No Action');

      let hierarchyIssue = null;
      const shouldRecover = isProtectRole || !antinukeData?.disabledEvents?.includes('autoRecovery');
      const revertPromise = shouldRecover
        ? coordinator.executeRecovery(
            incident,
            async () => {
              try {
                const botHighestPos = guild.members?.me?.roles?.highest?.position ?? 0;
                if (
                  newRole.editable === false ||
                  (botHighestPos > 0 && typeof newRole.position === 'number' && newRole.position >= botHighestPos)
                ) {
                  hierarchyIssue = 'Blocked by Role Hierarchy';
                  return false;
                }

                const snap = blueprintManager.getRoleSnapshot(guild.id, newRole.id);
                const targetName = isProtectRole
                  ? (snap?.name || oldRole?.name || 'Roynix Protect')
                  : (snap?.name ?? oldRole?.name ?? newRole.name);
                const targetColor = snap?.color ?? oldRole?.color ?? newRole.color;
                const targetHoist = snap?.hoist ?? oldRole?.hoist ?? newRole.hoist;
                const targetMentionable = snap?.mentionable ?? oldRole?.mentionable ?? newRole.mentionable;
                const targetPermissions = isProtectRole
                  ? 0n
                  : snap?.permissions != null
                    ? new PermissionsBitField(BigInt(snap.permissions))
                    : (oldRole?.permissions?.bitfield ?? oldRole?.permissions);

                const rawDesiredPos = isProtectRole && botHighestPos > 1
                  ? Math.max(snap?.position ?? 0, oldRole?.position ?? 0, botHighestPos - 1)
                  : (snap?.position ?? oldRole?.rawPosition ?? oldRole?.position);

                let safePosition = rawDesiredPos;
                if (typeof rawDesiredPos === 'number' && botHighestPos > 0 && rawDesiredPos >= botHighestPos) {
                  safePosition = Math.max(1, botHighestPos - 1);
                  hierarchyIssue = 'Position Clamped by Role Hierarchy';
                }

                const baseEditPayload = {
                  name: targetName,
                  color: targetColor,
                  hoist: targetHoist,
                  permissions: targetPermissions,
                  mentionable: targetMentionable,
                };

                await newRole.edit(baseEditPayload, 'Roynix Antinuke System | Reverting Role Update');

                if (
                  typeof newRole.setPosition === 'function' &&
                  typeof safePosition === 'number' &&
                  safePosition > 0 &&
                  newRole.position !== safePosition
                ) {
                  const moved = await newRole.setPosition(safePosition).catch(() => null);
                  if (!moved) {
                    hierarchyIssue = hierarchyIssue || 'Position Revert Blocked by Hierarchy';
                  }
                }

                if (isProtectRole && typeof guild.members?.me?.roles?.add === 'function') {
                  if (!guild.members.me.roles.cache?.has?.(newRole.id)) {
                    await guild.members.me.roles.add(newRole.id, 'Roynix Antinuke System | Restoring Protection Role').catch(() => null);
                  }
                }

                return true;
              } catch {
                return false;
              }
            },
            { allowAuthorizedUnattributed: isProtectRole }
          )
        : Promise.resolve(false);

      const [actionTaken, reverted] = await Promise.all([punishPromise, revertPromise]);

      const logChannelId = antinukeData.logsChannel;
      if (logChannelId && (executor?.id || reverted)) {
        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const revertText = reverted
            ? `${emojis.tick}${hierarchyIssue ? ` (${hierarchyIssue})` : ''}`
            : `${emojis.cross}${hierarchyIssue ? ` (${hierarchyIssue})` : ''}`;

          const executorLabel = executor?.id
            ? `<@${executor.id}> (${executor.tag || executor.id})`
            : 'Unknown (Unattributed Tampering)';

          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle(isProtectRole ? 'Protection Role Tampering Blocked' : 'Anti-Role Update Triggered')
            .setDescription(
              `${emojis.user} **Executor**: ${executorLabel}\n` +
              `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
              `${emojis.role} **Changes Reverted**: ${revertText}`
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  }
};
