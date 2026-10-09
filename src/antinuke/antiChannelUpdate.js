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
        client.on('channelUpdate', async (oldChannel, newChannel) => {
            if (!newChannel.guild || newChannel.isThread()) return;
            const guild = newChannel.guild;
            const event = 'antiChannelUpdate';

            const antinukeData = await client.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};
            const punishment = antinukeData.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelUpdate, newChannel.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            const trackingKey = `${guild.id}_antiChannelUpdate_${newChannel.id}_${executor.id}`;
            const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Channel Update', client, trackingKey);

            const recoverPromise = (async () => {
                if (!antinukeData?.disabledEvents?.includes('autoRecovery')) {
                    try {
                    const baseOptions = {
                        name: oldChannel.name,
                        parent: oldChannel.parentId || null,
                        reason: 'Roynix Antinuke System | Reverting Channel Update',
                    };

                    switch (oldChannel.type) {
                        case ChannelType.GuildText:
                        case ChannelType.GuildAnnouncement:
                            await newChannel.edit({
                                ...baseOptions,
                                topic: oldChannel.topic || null,
                                nsfw: oldChannel.nsfw,
                                rateLimitPerUser: oldChannel.rateLimitPerUser,
                            });
                            reverted = true;
                            break;

                        case ChannelType.GuildVoice:
                        case ChannelType.GuildStageVoice:
                            await newChannel.edit({
                                ...baseOptions,
                                bitrate: oldChannel.bitrate,
                                userLimit: oldChannel.userLimit,
                            });
                            reverted = true;
                            break;

                        case ChannelType.GuildForum:
                            await newChannel.edit({
                                ...baseOptions,
                                defaultSortOrder: oldChannel.defaultSortOrder,
                                rateLimitPerUser: oldChannel.rateLimitPerUser,
                            });
                            reverted = true;
                            break;

                        case ChannelType.GuildCategory:
                            await newChannel.edit(baseOptions);
                            reverted = true;
                            break;

                        case ChannelType.GuildMedia:
                            await newChannel.edit({
                                ...baseOptions,
                                nsfw: oldChannel.nsfw,
                                rateLimitPerUser: oldChannel.rateLimitPerUser,
                            });
                            reverted = true;
                            break;

                        default:
                            await newChannel.edit(baseOptions);
                            reverted = true;
                            break;
                    }
                } catch {}
                return reverted;
            })();

            const [actionTaken, reverted] = await Promise.all([punishPromise, recoverPromise]);

            const logChannelId = antinukeData.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle('Anti-Channel Update Triggered')
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}\n` +
                            `${emojis.channel} **Changes Reverted**: ${reverted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
