import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user in the server.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to unmute.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason for unmuting the user.')
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
        const reason = interaction.options.getString('reason') || 'None';
        const guild = interaction.guild;

        if (!user) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **Please provide a valid user to unmute.**`)
                ]
            });
        }

        if (!user.isCommunicationDisabled()) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **This user is not muted.**`)
                ]
            });
        }

        if (
            user.roles.highest.position >= interaction.member.roles.highest.position &&
            !client.isBotOwner?.(interaction.user.id) &&
            interaction.member.id !== guild.ownerId
        ) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **You cannot unmute a member if their highest role is equal to or higher than yours.**`)
                ]
            });
        }

        if (
            !user.moderatable ||
            user.roles.highest.position >= guild.members.me.roles.highest.position
        ) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **I cannot unmute this member.**`)
                ]
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

        await user.timeout(null, `${reason} | Mod: ${interaction.user.username} (${interaction.user.id})`);

        let msg = await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Unmuted`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${interaction.user}\n` +
                        `${emojis.user} **Target:** ${user}\n` +
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
            await msg.edit({ components: [disabledRow] }).catch(() => { });
        });
    }
};