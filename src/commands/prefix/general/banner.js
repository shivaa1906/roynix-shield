import { ButtonStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'banner',
    description: 'Shows the avatar of a user.',
    aliases: ['bnr'],
    category: 'general',
    args: [
        {
            name: 'User',
            description: 'The user banner you want to see',
            required: false
        }
    ],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        let member = message.mentions.members.first() ||
            (args[0] ? message.guild.members.cache.get(args[0]) : null) ||
            (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null) ||
            message.member;

        member = await member.fetch(true)

        const globalBanner = member?.user?.bannerURL({ size: 1024 });
        const guildBanner = member?.bannerURL({ size: 1024 }) 
        const hasGlobal = !!member?.user?.banner;
        const hasGuild = !!member?.banner;

        if (!hasGlobal && !hasGuild) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **The member doesn't have any banner.**`)
                        .setColor(client.color)
                ]
            });
        }

        const bannerButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('global_banner')
                .setLabel('User Banner')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emojis.user)
                .setDisabled(!hasGlobal),
            new ButtonBuilder()
                .setCustomId('guild_banner')
                .setLabel('Server Banner')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emojis.server)
                .setDisabled(!hasGuild)  
        );

        const globalFormatButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('PNG')
                .setURL(hasGlobal ? member.user.bannerURL({ size: 4096, extension: 'png', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('WEBP')
                .setURL(hasGlobal ? member.user.bannerURL({ size: 4096, extension: 'webp', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('JPG')
                .setURL(hasGlobal ? member.user.bannerURL({ size: 4096, extension: 'jpg', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('GIF')
                .setURL(hasGlobal ? member.user.bannerURL({ size: 4096, extension: 'gif' }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setDisabled(!member.user?.banner?.startsWith('a_'))
        );

        const guildFormatButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('PNG')
                .setURL(hasGuild ? member.bannerURL({ size: 4096, extension: 'png', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('WEBP')
                .setURL(hasGuild ? member.bannerURL({ size: 4096, extension: 'webp', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('JPG')
                .setURL(hasGuild ? member.bannerURL({ size: 4096, extension: 'jpg', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('GIF')
                .setURL(hasGuild ? member.bannerURL({ size: 4096, extension: 'gif' }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setDisabled(!member?.banner?.startsWith('a_'))
        );

        let currentBanner;
        let format;

        if (hasGlobal) {
            currentBanner = globalBanner;
            format = globalFormatButtons;
        } else {
            currentBanner = guildBanner;
            format = guildFormatButtons;
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${member.user.username}'s Banner`, iconURL: member.user.displayAvatarURL({ size: 1024 }) })
            .setImage(currentBanner)
            .setColor(client.color)
            .setFooter({
                text: `Requested by ${message.author.username}`,
                iconURL: message.author.displayAvatarURL({ size: 1024 })
            });

        const msg = await message.reply({
            embeds: [embed],
            components: [bannerButtons, format]
        });

        const collector = msg.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if(i.user.id !== message.author.id) {
                            return i.reply({ content: 'This is not for you.', flags: MessageFlags.Ephemeral})
                        }
            if (i.customId === 'global_banner' && globalBanner) {
                embed.setImage(globalBanner);
                await i.update({ embeds: [embed], components: [bannerButtons, globalFormatButtons].filter(Boolean) });
            } else if (i.customId === 'banner' && guildBanner) {
                embed.setImage(guildBanner);
                await i.update({ embeds: [embed], components: [bannerButtons, guildFormatButtons].filter(Boolean) });
            }
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    }
};
