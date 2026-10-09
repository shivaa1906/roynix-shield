import { EmbedBuilder, AuditLogEvent } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';

export const data = {
    async execute(client) {
        client.on('guildUpdate', async (oldGuild, newGuild) => {
            const executor = await getAuditExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
            if (!executor) return;

            const changes = [];
            
            // Name change
            if (oldGuild.name !== newGuild.name) {
                changes.push(`${emojis.yellow_dot} **Name:** ${oldGuild.name} → ${newGuild.name}`);
            }
            
            // Description change
            if (oldGuild.description !== newGuild.description) {
                const oldDesc = oldGuild.description || 'None';
                const newDesc = newGuild.description || 'None';
                changes.push(`${emojis.yellow_dot} **Description:** ${oldDesc} → ${newDesc}`);
            }
            
            // AFK channel change
            if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
                const oldAfk = oldGuild.afkChannel?.name || 'None';
                const newAfk = newGuild.afkChannel?.name || 'None';
                changes.push(`${emojis.yellow_dot} **AFK Channel:** ${oldAfk} → ${newAfk}`);
            }
            
            // System channel change
            if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
                const oldSystem = oldGuild.systemChannel?.name || 'None';
                const newSystem = newGuild.systemChannel?.name || 'None';
                changes.push(`${emojis.yellow_dot} **System Channel:** ${oldSystem} → ${newSystem}`);
            }
            
            // Verification level change
            if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
                changes.push(`${emojis.yellow_dot} **Verification Level:** ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
            }
            
            // Explicit content filter change
            if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
                changes.push(`${emojis.yellow_dot} **Content Filter:** ${oldGuild.explicitContentFilter} → ${newGuild.explicitContentFilter}`);
            }
            
            // Features changes
            if (oldGuild.features.length !== newGuild.features.length || 
                !oldGuild.features.every(feat => newGuild.features.includes(feat))) {
                const added = newGuild.features.filter(f => !oldGuild.features.includes(f));
                const removed = oldGuild.features.filter(f => !newGuild.features.includes(f));
                
                if (added.length > 0) {
                    changes.push(`${emojis.green_dot} **Features Added:** ${added.join(', ')}`);
                }
                if (removed.length > 0) {
                    changes.push(`${emojis.red_dot} **Features Removed:** ${removed.join(', ')}`);
                }
            }
            
            if (changes.length === 0) return;
            
            await logGuildUpdate(
                client,
                'Guild Updated',
                `${emojis.yellow_dot} **Executor:** ${executor.tag}\n` +
                `${emojis.yellow_dot} **Executor ID:** ${executor.id}\n\n` +
                `**Changes:**\n${changes.join('\n')}`,
                newGuild
            );
        });
    }
};

async function logGuildUpdate(client, eventType, description, guild) {
    const loggingChannelId = await client.loggingDB.get(`loggingData_${guild.id}.events.guildUpdate`);
    if (!loggingChannelId) return;

    const loggingChannel = guild.channels.cache.get(loggingChannelId) || 
                         await guild.channels.fetch(loggingChannelId).catch(() => null);
    if (!loggingChannel) return;

    const embed = new EmbedBuilder()
        .setColor(client.color)
        .setTitle(eventType)
        .setAuthor({ 
            name: guild.name, 
            iconURL: guild.iconURL({ size: 1024 }) || null 
        })
        .setDescription(description)
        .setFooter({ text: `${eventType} Notification` })
        .setTimestamp();

    loggingChannel.send({ embeds: [embed] }).catch(() => null);
}