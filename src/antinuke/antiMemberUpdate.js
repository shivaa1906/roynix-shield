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
      client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const guild = newMember.guild;
        const event = 'antiMemberUpdate';
  
        const antinukeData = await client.getAntinukeData(guild.id);
        if (!antinukeData?.enabled) return;
        if (antinukeData?.disabledEvents?.includes(event)) return;
  
        const extraOwners = antinukeData.extraOwners || [];
        const whitelisted = antinukeData.whitelisted || {};
        const punishment = antinukeData.punishment || 'ban';
  
        const logChannelId = antinukeData.logsChannel;
  
        const roleChanged = JSON.stringify([...oldMember.roles.cache.keys()].sort()) !== JSON.stringify([...newMember.roles.cache.keys()].sort());
        const nicknameChanged = oldMember.nickname !== newMember.nickname;
        const timeoutChanged = oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp;
  
        if (!roleChanged && !nicknameChanged && !timeoutChanged) return;
  
        const executor = await getAuditExecutor(guild, AuditLogEvent.MemberUpdate, newMember.id, client)
          || await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, client);
        if (!executor) return;
  
        if (
          executor.id === client.user.id ||
          executor.id === guild.ownerId ||
          isBotOwner(executor.id) ||
          extraOwners.includes(executor.id) ||
          whitelisted[executor.id]?.events?.includes(event)
        ) return;
  
        const trackingKey = `${guild.id}_antiMemberUpdate_${newMember.id}_${executor.id}`;
        const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Member Update', client, trackingKey);
  
        const recoverPromise = (async () => {
          let reverted = false;
          if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
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
      
              reverted = true;
            } catch (err) {}
          }
          return reverted;
        })();

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
  