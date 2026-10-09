import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import { isBotOwner } from '../utils/isBotOwner.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';

export const data = {
    /**
     * 
     * @param {import('../base/Roynix').Roynix} client 
     */
    async execute(client) {
        client.on('guildUpdate', async (oldGuild, newGuild) => {
            const event = 'antiGuildUpdate';
            const guild = newGuild;

            const antinukeData = await client.getAntinukeData(guild.id);
            const isAntinukeEnabled = antinukeData?.enabled || false;
            if (!isAntinukeEnabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const extraOwners = antinukeData?.extraOwners || [];
            const whitelisted = antinukeData?.whitelisted || {};
            const punishment = antinukeData?.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.GuildUpdate, guild.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            const trackingKey = `${guild.id}_antiGuildUpdate_${guild.id}_${executor.id}`;
            const punishPromise = punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Guild Update', client, trackingKey);

            const revertPromise = (async () => {
                if (antinukeData?.disabledEvents?.includes('autoRecovery')) return false;
                try {
                    await newGuild.edit({
                        name: oldGuild.name,
                        description: oldGuild.description || null,
                        icon: oldGuild.iconURL({ dynamic: true }) || null,
                        banner: oldGuild.bannerURL({ dynamic: true }) || null,
                        splash: oldGuild.splashURL({ dynamic: true }) || null,
                        systemChannel: oldGuild.systemChannelId || null,
                        verificationLevel: oldGuild.verificationLevel,
                        defaultMessageNotifications: oldGuild.defaultMessageNotifications,
                        explicitContentFilter: oldGuild.explicitContentFilter,
                        afkChannel: oldGuild.afkChannelId || null,
                        afkTimeout: oldGuild.afkTimeout,
                        features: oldGuild.features || null,
                    }, "Roynix Antinuke System | Guild Update Reverted");
                    return true;
                } catch {
                    return false;
                }
            })();

            const [actionTaken, guildReverted] = await Promise.all([punishPromise, revertPromise]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle("Anti-Guild Update Triggered")
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || "No Action"}\n` +
                            `${emojis.server} **Guild Changes Reverted**: ${guildReverted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
