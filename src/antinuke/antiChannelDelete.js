import {
    AuditLogEvent,
    ChannelType,
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
      client.on('channelDelete', async (channel) => {
        if (!channel.guild || channel.isThread()) return;
        const guild = channel.guild;
        const event = 'antiChannelDelete';
  
        const antinukeData = await client.getAntinukeData(guild.id);
        if (!antinukeData?.enabled) return;
        if (antinukeData?.disabledEvents?.includes(event)) return;
  
        const extraOwners = antinukeData.extraOwners || [];
        const whitelisted = antinukeData.whitelisted || {};
        const punishment = antinukeData.punishment || 'ban';
  
        const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id, client);
        if (!executor) return;
  
        if (
          executor.id === client.user.id ||
          executor.id === guild.ownerId ||
          isBotOwner(executor.id) ||
          extraOwners.includes(executor.id) ||
          whitelisted[executor.id]?.events?.includes(event)
        ) return;
  
        const trackingKey = `${guild.id}_antiChannelDelete_${channel.id}_${executor.id}`;
        const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Channel Delete', client, trackingKey);

        const recoverPromise = (async () => {
          if (antinukeData?.disabledEvents?.includes('autoRecovery')) return false;
          try {
            switch (channel.type) {
                case ChannelType.GuildText:
                  await guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildText,
                    topic: channel.topic || undefined,
                    nsfw: channel.nsfw,
                    rateLimitPerUser: channel.rateLimitPerUser,
                    position: channel.rawPosition,
                    parent: channel.parentId,
                    permissionOverwrites: channel.permissionOverwrites.cache,
                    reason: 'Roynix Antinuke System | Channel Recovered'
                  });
                  return true;
              
                case ChannelType.GuildVoice:
                  await guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildVoice,
                    bitrate: channel.bitrate,
                    userLimit: channel.userLimit,
                    rtcRegion: channel.rtcRegion,
                    videoQualityMode: channel.videoQualityMode,
                    position: channel.rawPosition,
                    parent: channel.parentId,
                    permissionOverwrites: channel.permissionOverwrites.cache,
                    reason: 'Roynix Antinuke System | Channel Recovered'
                  });
                  return true;
              
                case ChannelType.GuildForum:
                  await guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildForum,
                    topic: channel.topic || undefined,
                    position: channel.rawPosition,
                    parent: channel.parentId,
                    permissionOverwrites: channel.permissionOverwrites.cache,
                    reason: 'Roynix Antinuke System | Channel Recovered',
                    availableTags: channel.availableTags,
                    defaultReactionEmoji: channel.defaultReactionEmoji,
                    defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser,
                    defaultSortOrder: channel.defaultSortOrder
                  });
                  return true;
              
                case ChannelType.GuildAnnouncement:
                  await guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildAnnouncement,
                    topic: channel.topic || undefined,
                    nsfw: channel.nsfw,
                    position: channel.rawPosition,
                    parent: channel.parentId,
                    permissionOverwrites: channel.permissionOverwrites.cache,
                    reason: 'Roynix Antinuke System | Channel Recovered'
                  });
                  return true;
              
                case ChannelType.GuildStageVoice:
                  await guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildStageVoice,
                    bitrate: channel.bitrate,
                    userLimit: channel.userLimit,
                    rtcRegion: channel.rtcRegion,
                    position: channel.rawPosition,
                    parent: channel.parentId,
                    permissionOverwrites: channel.permissionOverwrites.cache,
                    reason: 'Roynix Antinuke System | Channel Recovered'
                  });
                  return true;
              
                case ChannelType.GuildCategory:
                  await guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildCategory,
                    position: channel.rawPosition,
                    permissionOverwrites: channel.permissionOverwrites.cache,
                    reason: 'Roynix Antinuke System | Channel Recovered'
                  });
                  return true;
              
                default:
                  return false;
            }
          } catch {
            return false;
          }
        })();

        const [actionTaken, recreated] = await Promise.all([punishPromise, recoverPromise]);
  
        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle('Anti-Channel Delete Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                `${emojis.channel} **Channel**: \`${channel.name}\` (${channel.id})\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                `${emojis.gear} **Channel Recreated**: ${recreated ? emojis.tick : emojis.cross}`
              )
              .setTimestamp();
  
            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      });
    }
  };
  