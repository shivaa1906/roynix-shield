import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user in the server.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to mute.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('The duration to mute the user for. eg. 1h, 30m, 1d')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason for muting the user.')
                .setRequired(false)
        ),
    userPerms: ['ModerateMembers'],
    botPerms: ['ModerateMembers'],

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const user = interaction.options.getMember('user');
        const duration = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'None';
        const guild = interaction.guild;

        if (!user) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **Please provide a valid user to mute.**`)
                ],

            });
        }

        if (user.id === interaction.user.id) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **You cannot mute yourself.**`)
                ],

            });
        }

        if (user.isCommunicationDisabled()) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **This user is already muted.**`)
                ],

            });
        }

        if (user.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **You cannot mute an administrator.**`)
                ],

            });
        }

        if (
            user.roles.highest.position >= interaction.member.roles.highest.position &&
            !client.isBotOwner(interaction.user.id) &&
            interaction.member.id !== guild.ownerId
        ) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **You cannot mute a member if their highest role is equal to or higher than yours.**`)
                ],

            });
        }

        if (user.id === guild.ownerId) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **You cannot mute the server owner.**`)
                ],

            });
        }

        if (!user.moderatable || user.roles.highest.position >= guild.members.me.roles.highest.position) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **I cannot mute this member.**`)
                ],

            });
        }

        const durationMap = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const durationRegex = /(\d+)([smhd])/g;
        const durationMatch = duration.match(durationRegex);

        if (!durationMatch) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **Please provide a valid duration. eg. 10m, 1h, 1d**`)
                ],

            });
        }

        const durationMs = durationMatch.reduce((acc, match) => {
            const [_, value, unit] = match.match(/(\d+)([smhd])/);
            return acc + parseInt(value) * durationMap[unit];
        }, 0);

        if (durationMs > 2419200000) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **Please provide a duration less than 28 days.**`)
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

        user.user.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setTitle(`You have been muted in ${guild.name}`)
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${interaction.user.tag}\n` +
                        `${emojis.reason} **Reason:** ${reason}\n` +
                        `${emojis.time} **Duration:** ${duration}`
                    )
                    .setThumbnail(guild.iconURL({ size: 1024 }))
                    .setFooter({ text: `You can contact a moderator if you believe this is a mistake.` })
            ]
        }).catch(() => { });

        await user.timeout(durationMs, `${reason} | Mod: ${interaction.user.username} (${interaction.user.id})`);

        let msg = await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Muted`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${interaction.user}\n` +
                        `${emojis.user} **Target:** ${user}\n` +
                        `${emojis.expire} **Duration:** ${duration}\n` +
                        `${emojis.reason} **Reason:** ${reason}`)
                    .setThumbnail(user.displayAvatarURL({ size: 1024 }))
                    .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
            ],
            components: [row],
        });

        msg = await msg.fetch()

        const collector = msg.createMessageComponentCollector({ time: 180000 });

        collector.on('collect', async (i) => {
            if (!i.isButton()) return;
            if (i.user.id !== interaction.user.id) {
                return await i.reply({
                    content: 'Only the command author can use this button.',
                    flags: MessageFlags.Ephemeral
                });
            }
            if (i.customId === 'delete') {
                await msg.delete().catch(() => { });
                collector.stop();
            }
        });

        collector.on('end', async () => {
            await msg.edit({ components: [disabledRow] });
        });
    }
};