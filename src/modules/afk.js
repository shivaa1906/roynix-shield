import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    Collection
} from 'discord.js';
import emojis from '../config/emojis.js';
import { isBotOwner } from '../utils/isBotOwner.js';

/**
 * @param {import('discord.js').Message} message 
 * @param {import('discord.js').Client} client 
 */
export default async function handleMessage(message, client) {
    const userId = message.author.id;
    const guildId = message.guild.id;

    const globalAFKData = await client.afkDB.get(`global_${userId}`);
    const serverAFKData = await client.afkDB.get(`server_${guildId}_${userId}`);
    const afkData = globalAFKData || serverAFKData;

    if (afkData) {
        const afkKey = globalAFKData ? `global_${userId}` : `server_${guildId}_${userId}`;
        await client.afkDB.delete(afkKey);

        const afkDuration = Math.floor((Date.now() - afkData.timestamp) / 1000);
        const weeks = Math.floor(afkDuration / (60 * 60 * 24 * 7));
        const days = Math.floor((afkDuration % (60 * 60 * 24 * 7)) / (60 * 60 * 24));
        const hours = Math.floor((afkDuration % (60 * 60 * 24)) / (60 * 60));
        const minutes = Math.floor((afkDuration % (60 * 60)) / 60);
        const seconds = afkDuration % 60;

        const durationParts = [];
        if (weeks) durationParts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
        if (days) durationParts.push(`${days} day${days > 1 ? 's' : ''}`);
        if (hours) durationParts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
        if (minutes) durationParts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
        if (seconds || durationParts.length === 0)
            durationParts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);

        const durationString = durationParts.join(', ');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('show_pings')
                .setLabel('Pings')
                .setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
            .setDescription(
                `${emojis.hi} Welcome back, ${message.author}! You were AFK: **${afkData.reason}**\n` +
                `- You were AFK for **${durationString}**.\n` +
                `- You were pinged **${afkData.mentions || 0}** times while you were away.`
            )
            .setColor(client.color);

        const reply = await message.reply({ embeds: [embed], components: [row] });

        const filter = (interaction) => interaction.customId === 'show_pings' && interaction.user.id === userId;
        const collector = reply.createMessageComponentCollector({ filter, time: 40000 });

        collector.on('collect', async (interaction) => {
            const mentions = afkData.mentionsDetails || [];
        
            if (mentions.length === 0) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} No one pinged you while you were AFK.`)
                            .setColor(client.color)
                    ],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        
            let page = 0;
            const itemsPerPage = 5;
            const totalPages = Math.ceil(mentions.length / itemsPerPage);
        
            const getRow = (pageNum) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('first')
                        .setEmoji(emojis.first)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageNum === 0),
        
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setEmoji(emojis.prev)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageNum === 0),
        
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setEmoji(emojis.delete)
                        .setStyle(ButtonStyle.Danger),
        
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setEmoji(emojis.next)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageNum === totalPages - 1),
        
                    new ButtonBuilder()
                        .setCustomId('last')
                        .setEmoji(emojis.last)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageNum === totalPages - 1)
                );
            };
        
            const generateEmbed = (pageNum) => {
                const start = pageNum * itemsPerPage;
                const end = start + itemsPerPage;
                const pageItems = mentions.slice(start, end);
        
                const embed = new EmbedBuilder()
                    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setColor(client.color)
                    .setTitle('AFK Mentions')
                    .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` });
        
                const description = pageItems.map(m =>
                    `**${m.username}** (${m.count} ping${m.count > 1 ? 's' : ''}) → [View Message](https://discord.com/channels/${guildId}/${m.channelId}/${m.messageId})`
                ).join('\n');
        
                embed.setDescription(description || "No pings on this page.");
                return embed;
            };
        
            await interaction.update({
                embeds: [generateEmbed(page)],
                components: [getRow(page)]
            });
        
            const pageCollector = interaction.message.createMessageComponentCollector({
                filter: (btn) => btn.user.id === userId,
                time: 60000
            });
        
            pageCollector.on('collect', async (btn) => {
                switch (btn.customId) {
                    case 'first':
                        page = 0;
                        break;
                    case 'prev':
                        if (page > 0) page--;
                        break;
                    case 'next':
                        if (page < totalPages - 1) page++;
                        break;
                    case 'last':
                        page = totalPages - 1;
                        break;
                    case 'delete':
                        await btn.message.delete().catch(() => {});
                        pageCollector.stop();
                        return;
                }
        
                await btn.update({
                    embeds: [generateEmbed(page)],
                    components: [getRow(page)]
                });
            });
        
            pageCollector.on('end', async () => {
                if (interaction.message.editable) {
                    await interaction.message.edit({ components: [] }).catch(() => {});
                }
            });
        });
        

        collector.on('end', async () => {
            await reply.edit({ components: [] });
        });
    }

    for (const mention of message.mentions.users.values()) {
        const mentionedUserId = mention.id;

        const mentionedGlobalAFK = await client.afkDB.get(`global_${mentionedUserId}`);
        const mentionedServerAFK = await client.afkDB.get(`server_${guildId}_${mentionedUserId}`);
        const mentionedUserAFK = mentionedGlobalAFK || mentionedServerAFK;

        if (mentionedUserAFK) {
            const isOwner = isBotOwner(message.author.id)
            const cooldownName = "afkMention";
            const cooldownAmount = 5000; 
        
            if (!isOwner) {
                if (!client.cooldowns.has(cooldownName)) {
                    client.cooldowns.set(cooldownName, new Collection());
                }
        
                const now = Date.now();
                const timestamps = client.cooldowns.get(cooldownName);
        
                if (timestamps.has(message.author.id)) {
                    const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
        
                    if (now < expirationTime) {
                        if (!client.cooldownLocks.has(message.author.id)) {
                            const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                            client.cooldownLocks.set(message.author.id, new Set());
                            const userLocks = client.cooldownLocks.get(message.author.id);
                            userLocks.add(cooldownName);
        
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor(client.color)
                                        .setDescription(`${emojis.warn} **Cooldown: Wait** \`${timeLeft}s\` **before triggering AFK pings**`)
                                ]
                            });
        
                            setTimeout(() => {
                                userLocks.delete(cooldownName);
                                if (userLocks.size === 0) {
                                    client.cooldownLocks.delete(message.author.id);
                                }
                            }, expirationTime - now);
                        }
                        return;
                    }
                }
        
                timestamps.set(message.author.id, now);
                setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
            }
        
            const key = mentionedGlobalAFK ? `global_${mentionedUserId}` : `server_${guildId}_${mentionedUserId}`;
        
            if (!mentionedUserAFK.mentionsDetails) {
                mentionedUserAFK.mentionsDetails = [];
            }
        
            const existingMention = mentionedUserAFK.mentionsDetails.find((m) => m.userId === message.author.id);
        
            if (existingMention) {
                existingMention.count += 1;
                existingMention.channelId = message.channel.id;
                existingMention.messageId = message.id;
            } else {
                mentionedUserAFK.mentionsDetails.push({
                    userId: message.author.id,
                    username: message.author.username,
                    count: 1,
                    channelId: message.channel.id,
                    messageId: message.id
                });
            }
        
            await client.afkDB.set(key, {
                ...mentionedUserAFK,
                mentions: (mentionedUserAFK.mentions || 0) + 1,
                mentionsDetails: mentionedUserAFK.mentionsDetails
            });
        
            const embed = new EmbedBuilder()
                .setAuthor({ name: mention.username, iconURL: mention.displayAvatarURL({ size: 1024 }) })
                .setDescription(`- **${mention.username}** is currently AFK: **${mentionedUserAFK.reason}**`)
                .setColor(client.color);
        
            await message.reply({ embeds: [embed] });
        }
        
    }
}
