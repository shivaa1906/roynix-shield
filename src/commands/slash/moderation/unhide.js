import {
    SlashCommandBuilder,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ChatInputCommandInteraction,
} from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('unhide')
        .setDescription('reveals a channel for everyone')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The channel to reveal')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for reveal the channel')
                .setRequired(false)
        ),
    userPerms: ['ManageChannels', 'ManageRoles'],
    botPerms: ['ManageChannels', 'ManageRoles'],

    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const target = interaction.guild.roles.everyone;

        if (!channel || !channel.permissionsFor) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Channel not found or invalid.**`)
                        .setColor(client.color)
                ],
            });
        }

        const currentPerms = channel.permissionsFor(target);
        if (!currentPerms) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Cannot check permissions for @everyone.**`)
                        .setColor(client.color)
                ],
            });
        }

        if (currentPerms.has(PermissionsBitField.Flags.ViewChannel)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **This channel is already revealed for @everyone.**`)
                        .setColor(client.color)
                ],
            });
        }

        const botPerms = channel.permissionsFor(interaction.guild.members.me);
        if (!botPerms?.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **I don't have permission to manage this channel.**`)
                        .setColor(client.color)
                ],
            });
        }

        const hideResult = await channel.permissionOverwrites.edit(target, {
            ViewChannel: true
        }).then(() => true).catch(() => false);

        if (!hideResult) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.cross} **Failed to reveal the channel.**`)
                        .setColor(client.color)
                ],
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emojis.delete)
        );

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emojis.delete)
                .setDisabled(true)
        );

        const msg = await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setThumbnail(interaction.guild.iconURL({ size: 1024 }))
                    .setAuthor({
                        name: 'Channel Revealed',
                        iconURL: interaction.user.displayAvatarURL({ size: 1024 }),
                    })
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${interaction.user}\n` +
                        `${emojis.channel} **Channel:** ${channel}\n` +
                        `${emojis.reason} **Reason:** ${reason}`
                    )
                    .setFooter({
                        text: `Executed by ${interaction.user.username}`,
                        iconURL: interaction.user.displayAvatarURL({ size: 1024 }),
                    }),
            ],
            components: [row],
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 });

        collector.on('collect', async (i) => {
            if (!i.isButton() || i.customId !== 'delete') return;
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: 'Only the command author can use this button.',
                    ephemeral: true,
                });
            }
            await interaction.deleteReply().catch(() => {});
            collector.stop();
        });

        collector.on('end', () => {
            msg.edit({ components: [disabledRow] }).catch(() => {});
        });
    }
};
