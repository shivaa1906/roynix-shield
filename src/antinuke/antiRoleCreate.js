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
        client.on('roleCreate', async (role) => {
            const guild = role.guild;
            if (!guild) return;
            const event = 'antiRoleCreate';

            const antinukeData = await client.getAntinukeData(guild.id);
            const isAntinukeEnabled = antinukeData?.enabled || false;
            if (!isAntinukeEnabled) return;
            if (antinukeData?.disabledEvents?.includes(event)) return;

            const extraOwners = antinukeData?.extraOwners || [];
            const whitelisted = antinukeData?.whitelisted || {};
            const punishment = antinukeData?.punishment || 'ban';

            const executor = await getAuditExecutor(guild, AuditLogEvent.RoleCreate, role.id, client);
            if (!executor) return;

            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isBotOwner(executor.id) ||
                extraOwners.includes(executor.id) ||
                whitelisted[executor.id]?.events?.includes(event)
            ) return;

            const trackingKey = `${guild.id}_antiRoleCreate_${role.id}_${executor.id}`;
            const [actionTaken, roleDeleted] = await Promise.all([
                punishExecutor(guild, executor, punishment, 'Roynix Antinuke System | Anti Role Create', client, trackingKey),
                role.delete('Roynix Antinuke System | Unauthorized Role Creation').then(() => true).catch(() => false)
            ]);

            const logChannelId = antinukeData?.logsChannel;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setTitle("Anti-Role Create Triggered")
                        .setDescription(
                            `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag})\n` +
                            `${emojis.role} **Role**: \`${role.name}\` (${role.id})\n` +
                            `${emojis.action} **Action Taken**: ${actionTaken || "No Action"}\n` +
                            `${emojis.trash} **Role Deleted**: ${roleDeleted ? emojis.tick : emojis.cross}`
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] }).catch(() => null);
                }
            }
        });
    }
};
