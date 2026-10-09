import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import emojis from '../../../config/emojis.js';
import moment from 'moment';

export const data = {
    name: 'serverinfo',
    description: 'shows information about the server.',
    category: 'general',
    aliases: ['server', 'guildinfo', 'si'],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const guild = message.guild;
        if (!guild) return message.reply({ content: "This command can only be used in a server." });

        const msg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Fetching information for ${guild.name}**`)
                    .setColor(client.color)
            ]
        });

        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;
        const boosters = (await guild.members.fetch({ withPresences: true }))
            .filter(m => m.premiumSince !== null).size;

        const textChannels = guild.channels.cache.filter(c => c.isTextBased()).size;
        const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased()).size;
        const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
        const threads = guild.channels.cache.filter(c => c.isThread()).size;

        const memberCount = guild.memberCount;
        const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = memberCount - bots;

        const verificationLevelMap = {
            0: 'None',
            1: 'Low',
            2: 'Medium',
            3: 'High',
            4: 'Highest'
        };

        const createdTimestamp = `<t:${Math.floor(guild.createdTimestamp / 1000)}:F> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`;
        const createdAgo = moment(guild.createdAt).fromNow();

        const roleCount = guild.roles.cache.size - 1;

        const emojiCount = guild.emojis.cache.size;
        const animatedEmojis = guild.emojis.cache.filter(e => e.animated).size;
        const staticEmojis = emojiCount - animatedEmojis;

        const embeds = {
            overview: new EmbedBuilder()
                .setAuthor({ name: `${guild.name}'s Information`, iconURL: guild.iconURL({ size: 1024 }) })
                .setDescription(`${emojis.server} __**Server Overview**__\n> **Server Name**: \`${guild.name}\`\n` +
                    `> **Server ID**: \`${guild.id}\`\n` +
                    `> **Owner**: <@${guild.ownerId}>\n` +
                    `> **Region**: \`${guild.preferredLocale}\`\n` +
                    `> **Verification Level**: \`${verificationLevelMap[guild.verificationLevel]}\`\n` +
                    `> **Explicit Content Filter**: \`${guild.explicitContentFilter}\`\n\n` +
                    `${emojis.expire} __**Timestamps**__\n> **Created At**: ${createdTimestamp}\n` +
                    `> **Created**: \`${createdAgo}\``)
                .setThumbnail(guild.iconURL({ size: 1024 }))
                .setColor(client.color)
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) }),

            stats: new EmbedBuilder()
                .setAuthor({ name: `${guild.name}'s Statistics`, iconURL: guild.iconURL({ size: 1024 }) })
                .setDescription(`${emojis.stats} __**Server Statistics**__\n` +
                    `> **Members**: \`${memberCount}\` (\`${onlineMembers}\` online)\n` +
                    `> **Humans**: \`${humans}\` | **Bots**: \`${bots}\`\n` +
                    `> **Roles**: \`${roleCount}\`\n` +
                    `> **Emojis**: \`${emojiCount}\` (\`${staticEmojis}\` static, \`${animatedEmojis}\` animated)\n` +
                    `> **Stickers**: \`${guild.stickers.cache.size}\`\n\n` +
                    `${emojis.channel} __**Channels**__\n` +
                    `> **Categories**: \`${categories}\`\n` +
                    `> **Text Channels**: \`${textChannels}\`\n` +
                    `> **Voice Channels**: \`${voiceChannels}\`\n` +
                    `> **Threads**: \`${threads}\`\n\n` +
                    `${emojis.boost} __**Boosts**__\n` +
                    `> **Boost Level**: \`Tier ${boostLevel}\`\n` +
                    `> **Boost Count**: \`${boostCount}\`\n` +
                    `> **Boosters**: \`${boosters}\``)
                .setColor(client.color)
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) }),

            features: new EmbedBuilder()
                .setAuthor({ name: `${guild.name}'s Features`, iconURL: guild.iconURL({ size: 1024 }) })
                .setDescription(`${emojis.general} __**Server Features**__\n` +
                    `${guild.features.map(f => `> \`${f.replace(/_/g, ' ')}\``).join('\n') || '> No special features'}\n\n` +
                    `${emojis.info} __**Other Information**__\n` +
                    `> **AFK Channel**: ${guild.afkChannel ? `<#${guild.afkChannelId}> (Timeout: \`${guild.afkTimeout}\` seconds)` : 'None'}\n` +
                    `> **System Channel**: ${guild.systemChannel ? `<#${guild.systemChannelId}>` : 'None'}\n` +
                    `> **Rules Channel**: ${guild.rulesChannel ? `<#${guild.rulesChannelId}>` : 'None'}\n` +
                    `> **Public Updates Channel**: ${guild.publicUpdatesChannel ? `<#${guild.publicUpdatesChannelId}>` : 'None'}\n` +
                    `> **Maximum Members**: \`${guild.maximumMembers}\`\n` +
                    `> **Maximum Bitrate**: \`${guild.maximumBitrate / 1000}kbps\``)
                .setColor(client.color)
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                .setImage(guild.bannerURL({ size: 2048 }) || null)
        };

        const genRow = (type) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('overview').setLabel('Overview').setStyle(type === 'overview' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(type === 'overview'),
                new ButtonBuilder().setCustomId('stats').setLabel('Statistics').setStyle(type === 'stats' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(type === 'stats'),
                new ButtonBuilder().setCustomId('features').setLabel('Features').setStyle(type === 'features' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(type === 'features')
            );
        };

        await msg.edit({ embeds: [embeds.overview], components: [genRow('overview')] });

        const collector = msg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({
                    content: "Only the command author can use these buttons",
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.update({
                embeds: [embeds[interaction.customId]],
                components: [genRow(interaction.customId)]
            });
        });

        collector.on('end', async () => {
            await msg.edit({
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('overview').setLabel('Overview').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('stats').setLabel('Statistics').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('features').setLabel('Features').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    )
                ]
            }).catch(() => { });
        });
    }
};