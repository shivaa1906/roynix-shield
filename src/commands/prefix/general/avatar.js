import { ButtonStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'avatar',
    description: 'Shows the avatar of a user.',
    aliases: ['ava', 'pfp', 'av'],
    category: 'general',
    args: [
        {
            name: 'User',
            description: 'The user avatar you want to see',
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
        const member = message.mentions.members.first() ||
            (args[0] ? message.guild.members.cache.get(args[0]) : null) ||
            (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null) ||
            message.member;

        const globalAvatar = member?.user?.displayAvatarURL({ size: 1024 });
        const guildAvatar = member?.displayAvatarURL({ size: 1024 }) 
        const hasGlobal = !!member?.user?.avatar;
        const hasGuild = !!member?.avatar;

        if (!hasGlobal && !hasGuild) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **The member doesn't have any avatar.**`)
                        .setColor(client.color)
                ]
            });
        }

        const avatarButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('global_avatar')
                .setLabel('User Avatar')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emojis.user)
                .setDisabled(!hasGlobal),
            new ButtonBuilder()
                .setCustomId('guild_avatar')
                .setLabel('Server Avatar')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emojis.server)
                .setDisabled(!hasGuild)  
        );

        const globalFormatButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('PNG')
                .setURL(hasGlobal ? member.user.displayAvatarURL({ size: 4096, extension: 'png', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('WEBP')
                .setURL(hasGlobal ? member.user.displayAvatarURL({ size: 4096, extension: 'webp', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('JPG')
                .setURL(hasGlobal ? member.user.displayAvatarURL({ size: 4096, extension: 'jpg', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('GIF')
                .setURL(hasGlobal ? member.user.displayAvatarURL({ size: 4096, extension: 'gif' }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setDisabled(!member.user?.avatar?.startsWith('a_'))
        );

        const guildFormatButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('PNG')
                .setURL(hasGuild ? member.displayAvatarURL({ size: 4096, extension: 'png', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('WEBP')
                .setURL(hasGuild ? member.displayAvatarURL({ size: 4096, extension: 'webp', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('JPG')
                .setURL(hasGuild ? member.displayAvatarURL({ size: 4096, extension: 'jpg', forceStatic: true }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('GIF')
                .setURL(hasGuild ? member.displayAvatarURL({ size: 4096, extension: 'gif' }) : 'https://discord.com')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setDisabled(!member?.avatar?.startsWith('a_'))
        );

        let currentAvatar;
        let format;

        if (hasGlobal) {
            currentAvatar = globalAvatar;
            format = globalFormatButtons;
        } else {
            currentAvatar = guildAvatar;
            format = guildFormatButtons;
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${member.user.username}'s Avatar`, iconURL: member.user.displayAvatarURL({ size: 1024 }) })
            .setImage(currentAvatar)
            .setColor(client.color)
            .setFooter({
                text: `Requested by ${message.author.username}`,
                iconURL: message.author.displayAvatarURL({ size: 1024 })
            });

        const msg = await message.reply({
            embeds: [embed],
            components: [avatarButtons, format]
        });

        const collector = msg.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if(i.user.id !== message.author.id) {
                return i.reply({ content: 'This is not for you.', flags: MessageFlags.Ephemeral})
            }
            if (i.customId === 'global_avatar' && globalAvatar) {
                embed.setImage(globalAvatar);
                await i.update({ embeds: [embed], components: [avatarButtons, globalFormatButtons].filter(Boolean) });
            } else if (i.customId === 'guild_avatar' && guildAvatar) {
                embed.setImage(guildAvatar);
                await i.update({ embeds: [embed], components: [avatarButtons, guildFormatButtons].filter(Boolean) });
            }
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    }
};
