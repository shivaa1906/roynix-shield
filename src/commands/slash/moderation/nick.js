import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
} from "discord.js";
import emojis from "../../../config/emojis.js";

export const data = {
    data: new SlashCommandBuilder()
        .setName("nick")
        .setDescription("Set a nickname in the server for a user.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to set the nickname for.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("nickname")
                .setDescription("The nickname to set.")
                .setRequired(false)
        ),
    userPerms: ["ManageNicknames"],
    botPerms: ["ManageNicknames"],

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const member = interaction.options.getMember("user");
        const nickname = interaction.options.getString("nickname") || null;
        const guild = interaction.guild;

        if (!member) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Please provide a valid user to set the nickname for.**`)
                        .setColor(client.color),
                ],
                
            });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You cannot set your own nickname.**`)
                        .setColor(client.color),
                ],
                
            });
        }

        if (member.id === guild.members.me.id) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **I cannot set my own nickname.**`)
                        .setColor(client.color),
                ],
                
            });
        }

        if (member.id === guild.ownerId) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You cannot set the nickname of the server owner.**`)
                        .setColor(client.color),
                ],
                
            });
        }

        if (
            member.roles.highest.position >= interaction.member.roles.highest.position &&
            !client.isBotOwner?.(interaction.user.id) &&
            interaction.member.id !== guild.ownerId
        ) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You cannot set the nickname of a user with a higher or equal role.**`)
                        .setColor(client.color),
                ],
                
            });
        }

        if (
            member.roles.highest.position >= guild.members.me.roles.highest.position ||
            !member.manageable
        ) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **I cannot set the nickname of this user.**`)
                        .setColor(client.color),
                ],
                
            });
        }

        if (nickname && nickname.length > 32) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **The nickname must be less than 32 characters.**`)
                        .setColor(client.color),
                ],
                
            });
        }

        await member.setNickname(nickname).catch(() => null);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("delete")
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emojis.delete)
        );

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("delete")
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emojis.delete)
                .setDisabled(true)
        );

        const msg = await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Nicked`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${interaction.user}\n` +
                        `${emojis.user} **Target:** ${member}\n` +
                        `${emojis.reason} **Nickname:** ${nickname || "Reset to default"}`)
                    .setThumbnail(member.displayAvatarURL({ size: 1024 }))
                    .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) }),
            ],
            components: [row],
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 });

        collector.on("collect", async (i) => {
            if (!i.isButton()) return;

            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: "Only the command author can use this button.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (i.customId === "delete") {
                await msg.delete().catch(() => {});
                collector.stop();
            }
        });

        collector.on("end", async () => {
            await msg.edit({ components: [disabledRow] }).catch(() => {});
        });
    },
};