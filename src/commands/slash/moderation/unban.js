import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
  } from "discord.js";
  import emojis from "../../../config/emojis.js";
  
  export const data = {
    data: new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unbans a user by ID.")
      .addStringOption(option =>
        option.setName("user")
          .setDescription("The user ID to unban.")
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName("reason")
          .setDescription("Reason for unbanning the user.")
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    userPerms: ["BanMembers"],
    botPerms: ["BanMembers"],
  
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
      const userId = interaction.options.getString("user");
      const reason = interaction.options.getString("reason") || "None";
  
      if (!/^\d{17,19}$/.test(userId)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`${emojis.warn} **Please provide a valid user ID.**`)
              .setColor(client.color),
          ],
        });
      }
  
      const banList = await interaction.guild.bans.fetch().catch(() => null);
      if (!banList) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`${emojis.cross} **Failed to fetch ban list.**`)
              .setColor(client.color),
          ],
        });
      }
  
      const bannedUser = banList.get(userId);
      if (!bannedUser) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`${emojis.warn} **User is not banned.**`)
              .setColor(client.color),
          ],
        });
      }
  
      await interaction.guild.bans.remove(userId, `${reason} | Mod: ${interaction.user.username} (${interaction.user.id})`);
  
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("delete")
          .setEmoji(emojis.delete)
          .setStyle(ButtonStyle.Danger)
      );
  
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("delete")
          .setEmoji(emojis.delete)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
  
      const msg = await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(client.color)
            .setAuthor({ name: `Successfully Unbanned`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
            .setDescription(
              `${emojis.moderator} **Moderator:** ${interaction.user}\n` +
              `${emojis.rmv} **Target:** <@${userId}>\n` +
              `${emojis.reason} **Reason:** ${reason}`
            )
            .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) }),
        ],
        components: [row],
      });
  
      const collector = msg.createMessageComponentCollector({ time: 180_000 });
  
      collector.on("collect", async i => {
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
  