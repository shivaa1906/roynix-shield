import { EmbedBuilder } from "@discordjs/builders";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import emojis from "../../../config/emojis.js";

export const data = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a member.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The member to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for banning the member')
                .setRequired(false)),
    userPerms: ['BanMembers'],
    botPerms: ['BanMembers'],

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const user = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'None';
        const guild = interaction.guild;

        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Member Not Found**`)
                        .setColor(client.color)
                ]
            });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You can't ban yourself.**`)
                        .setColor(client.color)
                ]
            });
        }

        if (member.id === guild.ownerId) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You can't ban the server owner.**`)
                        .setColor(client.color)
                ]
            });
        }

        if (
            interaction.member.id !== guild.ownerId &&
            member.roles.highest.comparePositionTo(interaction.member.roles.highest) >= 0 &&
            !client.isBotOwner?.(interaction.user.id)
        ) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **You cannot ban a member if their highest role is equal to or higher than yours.**`)
                ]
            });
        }

        if (
            !member.bannable ||
            member.roles.highest.comparePositionTo(guild.members.me.roles.highest) >= 0
        ) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **I don’t have permission to ban them, likely because their highest role is equal to or higher than mine.**`)
                ]
            });
        }

        await member.user.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setTitle(`You have been banned from ${guild.name}`)
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${interaction.user.tag}\n` +
                        `${emojis.reason} **Reason:** ${reason}`
                    )
                    .setThumbnail(guild.iconURL({ size: 1024 }))
                    .setFooter({ text: `You can contact a moderator if you believe this is a mistake.` })
            ]
        }).catch(() => {});

        await member.ban({ reason: `${reason} | Mod: ${interaction.user.username} (${interaction.user.id})` });

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
                    .setAuthor({ name: `Successfully Banned`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${interaction.user}\n` +
                        `${emojis.rmv} **Target:** ${member}\n` +
                        `${emojis.reason} **Reason:** ${reason}`
                    )
                    .setThumbnail(member.displayAvatarURL({ size: 1024 }))
                    .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
            ],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 });

        collector.on('collect', async (i) => {
            if (!i.isButton()) return;

            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: 'Only the command author can use this button.',
                    flags: MessageFlags.Ephemeral
                });
            }

            
             if (i.customId === 'delete') {
                await msg.delete().catch(() => {});
                collector.stop();
            }
        });

        collector.on('end', async () => {
            await msg.edit({ components: [disabledRow] });
        });
    }
};