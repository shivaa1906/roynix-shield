import {
    AuditLogEvent,
    EmbedBuilder,
  } from 'discord.js';
  import emojis from '../config/emojis.js';
  import { getAuditExecutor } from '../utils/getExecutor.js';
  import { punishExecutor } from '../utils/punishExecutor.js';
  import { incidentCoordinator } from '../utils/incidentCoordinator.js';

  export const data = {
    /**
     * @param {import('../base/Roynix').Roynix} client
     */
    async execute(client) {
      client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const guild = newMember?.guild;
        if (!guild) return;
        const event = 'antiMemberUpdate';

        const antinukeData = await client.getAntinukeData(guild.id);
        if (!antinukeData?.enabled) return;
        if (antinukeData?.disabledEvents?.includes(event)) return;

        const punishment = antinukeData.punishment || 'ban';
        const logChannelId = antinukeData.logsChannel;

        const roleChanged = JSON.stringify([...(oldMember?.roles?.cache?.keys?.() || [])].sort()) !== JSON.stringify([...(newMember?.roles?.cache?.keys?.() || [])].sort());
        const nicknameChanged = oldMember?.nickname !== newMember?.nickname;
        const timeoutChanged = oldMember?.communicationDisabledUntilTimestamp !== newMember?.communicationDisabledUntilTimestamp;

        if (!roleChanged && !nicknameChanged && !timeoutChanged) return;

        const actionType = roleChanged ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate;
        const executor = roleChanged
          ? (await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, client)
             || await getAuditExecutor(guild, AuditLogEvent.MemberUpdate, newMember.id, client))
          : (await getAuditExecutor(guild, AuditLogEvent.MemberUpdate, newMember.id, client)
             || await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, client));

        const coordinator = client.incidentCoordinator || incidentCoordinator;
        const incident = coordinator.coordinateIncident({
          guild,
          client,
          antinukeData,
          actionType,
          moduleKey: event,
          targetId: newMember.id,
          executorId: executor?.id || null,
          auditEntryId: executor?.auditEntryId || null
        });

        if (incident.decision !== 'enforce' || !executor?.id) return;

        const trackingKey = `${guild.id}_antiMemberUpdate_${newMember.id}_${executor.id}`;
        const punishPromise = punishExecutor(
          guild,
          executor,
          punishment,
          'Roynix Antinuke System | Anti Member Update',
          client,
          trackingKey,
          { incident, antinukeData, moduleKey: event, targetId: newMember.id }
        );

        const recoverPromise = !antinukeData?.disabledEvents?.includes('autoRecovery')
          ? coordinator.executeRecovery(incident, async () => {
              try {
                if (roleChanged) {
                  await newMember.roles.set(oldMember.roles.cache, 'Roynix Antinuke System | Reverting Role Update');
                }
                if (nicknameChanged) {
                  await newMember.setNickname(oldMember.nickname || null, 'Roynix Antinuke System | Reverting Nickname Change');
                }
                if (timeoutChanged) {
                  await newMember.timeout(null, 'Roynix Antinuke System | Reverting Timeout');
                }
                return true;
              } catch {
                return false;
              }
            })
          : Promise.resolve(false);

        const [actionTaken, reverted] = await Promise.all([punishPromise, recoverPromise]);

        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle('Anti-Member Update Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                `${emojis.user} **Target**: <@${newMember.id}> (${newMember.user.tag})\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                `${emojis.gear} **Changes Reverted**: ${reverted ? emojis.tick : emojis.cross}\n\n` +
                `${roleChanged ? `**Roles**: Changed\n` : ''}` +
                `${nicknameChanged ? `**Nickname**: Changed\n` : ''}` +
                `${timeoutChanged ? `**Timeout**: Changed\n` : ''}`
              )
              .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      });
    }
  };
