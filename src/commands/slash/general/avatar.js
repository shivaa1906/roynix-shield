import { ButtonStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Shows the avatar of a user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose avatar you want to see')
                .setRequired(false)
        ),
    /**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('../../../base/Roynix').Roynix} client
 */
    async execute(interaction, client) {
        const member = interaction.options.getMember('user') || interaction.guild.members.cache.get(interaction.user.id) || interaction.member;

        const globalAvatar = member?.user?.displayAvatarURL({ size: 1024 });
        const guildAvatar = member?.displayAvatarURL({ size: 1024 });
        const hasGlobal = !!member?.user?.avatar;
        const hasGuild = !!member?.avatar;

        if (!hasGlobal && !hasGuild) {
            return interaction.reply({
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
                text: `Requested by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL({ size: 1024 })
            });

        const msg = await interaction.reply({
            embeds: [embed],
            components: [avatarButtons, format],
            
        });

        const collector = msg.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'This is not for you.', flags: MessageFlags.Ephemeral });
            }
            if (i.customId === 'global_avatar' && globalAvatar) {
                embed.setImage(globalAvatar);
                await i.update({ embeds: [embed], components: [avatarButtons, globalFormatButtons].filter(Boolean) });
            } else if (i.customId === 'guild_avatar' && guildAvatar) {
                embed.setImage(guildAvatar);
                await i.update({ embeds: [embed], components: [avatarButtons, guildFormatButtons].filter(Boolean) });
            }
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(() => { }));
    }
}