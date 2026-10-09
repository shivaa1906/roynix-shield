import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, RoleSelectMenuBuilder, MessageFlags } from "discord.js";
import emojis from "../../../config/emojis.js";

export const data = {
    data: new SlashCommandBuilder()
        .setName("activityrole")
        .setDescription("Configure Activity Roles")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Configure activity roles")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("reset")
                .setDescription("Reset all activity roles")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("config")
                .setDescription("Show current activity role configuration")
        ),
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        const activityroleDB = client.activityroleDB;
        const guild = interaction.guild;

        const activityDescriptions = {
            spotify: "Role for members listening to Spotify",
            watching: "Role for members watching videos/streams",
            playing: "Role for members playing games",
            streaming: "Role for members live streaming"
        };

        switch (subcommand) {
            case "setup": {
                const buttonsRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("activityrole_setup_spotify")
                        .setLabel("Spotify")
                        .setEmoji(emojis.spotify)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("activityrole_setup_watching")
                        .setLabel("Watching")
                        .setEmoji(emojis.watching)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("activityrole_setup_playing")
                        .setLabel("Playing")
                        .setEmoji(emojis.playing)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("activityrole_setup_streaming")
                        .setLabel("Streaming")
                        .setEmoji(emojis.streaming)
                        .setStyle(ButtonStyle.Secondary)
                );

                const resetRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("activityrole_reset")
                        .setLabel("Reset All")
                        .setEmoji(emojis.warn)
                        .setStyle(ButtonStyle.Danger)
                );

                const activityRoles = await activityroleDB.get(`activityrole_${guild.id}`) || {};

                const embed = new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: "Roynix Activity Role", iconURL: client.user.avatarURL({ size: 1024 }) })
                    .setDescription(
                        `- **Select an activity to configure roles:**\n` +
                        `   - ${emojis.spotify} **Spotify** - ${activityDescriptions.spotify}\n` +
                        `   - ${emojis.watching} **Watching** - ${activityDescriptions.watching}\n` +
                        `   - ${emojis.playing} **Playing** - ${activityDescriptions.playing}\n` +
                        `   - ${emojis.streaming} **Streaming** - ${activityDescriptions.streaming}\n\n` +
                        `- ${emojis.gear} **Configuration:**\n` +
                        `   - ${emojis.spotify} **Spotify:** ${activityRoles?.spotify ? `<@&${activityRoles?.spotify}>` : "Not set"}\n` +
                        `   - ${emojis.watching} **Watching:** ${activityRoles?.watching ? `<@&${activityRoles?.watching}>` : "Not set"}\n` +
                        `   - ${emojis.playing} **Playing:** ${activityRoles?.playing ? `<@&${activityRoles?.playing}>` : "Not set"}\n` +
                        `   - ${emojis.streaming} **Streaming:** ${activityRoles?.streaming ? `<@&${activityRoles?.streaming}>` : "Not set"}\n\n` +
                        `*Click the buttons below to configure roles or reset existing configuration*`
                    )
                    .setThumbnail(guild.iconURL({ size: 1024 }));

                let setupMessage = await interaction.reply({
                    embeds: [embed],
                    components: [buttonsRow, resetRow],
                });

                setupMessage = await setupMessage.fetch();

                const collector = setupMessage.createMessageComponentCollector({ time: 60000 });

                collector.on("collect", async (i) => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({
                            content: `${emojis.warn} This configuration panel is not for you!`,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (i.customId === "activityrole_reset") {
                        const confirmEmbed = new EmbedBuilder()
                            .setColor(client.color)
                            .setDescription(`${emojis.warn} **Are you sure you want to reset all activity roles?**`);

                        const confirmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("confirm_reset")
                                .setLabel("Confirm Reset")
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji(emojis.warn),
                            new ButtonBuilder()
                                .setCustomId("cancel_reset")
                                .setLabel("Cancel")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.cross)
                        );

                        let confirmMessage = await i.reply({
                            embeds: [confirmEmbed],
                            components: [confirmRow],
                            flags: MessageFlags.Ephemeral
                        })

                        confirmMessage = await confirmMessage.fetch();

                        const confirmationCollector = confirmMessage.createMessageComponentCollector({
                            time: 15000
                        });

                        confirmationCollector.on("collect", async (confirmation) => {
                            if (confirmation.customId === "cancel_reset") {
                                confirmationCollector.stop();
                                return confirmation.update({
                                    content: `${emojis.tick} Reset cancelled`,
                                    components: [],
                                    embeds: []
                                });
                            }

                            await client.activityroleDB.delete(`activityrole_${guild.id}`);
                            await confirmation.update({
                                content: `${emojis.tick} Successfully reset all activity roles!`,
                                components: [],
                                embeds: []
                            }).catch(() => { });
                        });

                        confirmationCollector.on("end", () => {
                            confirmMessage.edit({ components: [] }).catch(() => { });
                        });
                        return;
                    }

                    const activity = i.customId.split("_")[2];

                    const roleSelect = new RoleSelectMenuBuilder()
                        .setCustomId(`activityrole_select_${activity}`)
                        .setPlaceholder(`Select ${activity} role`)
                        .setMaxValues(1)
                        .setMinValues(1);

                    const roleRow = new ActionRowBuilder().addComponents(roleSelect);

                    let roleMessage = await i.reply({
                        content: `Select a role for **${activity}** activity:`,
                        components: [roleRow],
                        flags: MessageFlags.Ephemeral
                    })

                    roleMessage = await roleMessage.fetch();

                    const roleCollector = roleMessage.createMessageComponentCollector({
                        componentType: ComponentType.RoleSelect,
                        filter: roleInteraction => roleInteraction.customId === `activityrole_select_${activity}` && roleInteraction.user.id === i.user.id,
                        time: 30000,
                        max: 1
                    });

                    roleCollector.on("collect", async (roleInteraction) => {
                        const role = roleInteraction.roles.first();
                        await activityroleDB.set(`activityrole_${guild.id}.${activity}`, role.id);

                        await roleInteraction.update({
                            content: `${emojis.tick} Successfully set ${role} for \`${activity}\` activity!`,
                            components: []
                        });

                        const updatedData = await activityroleDB.get(`activityrole_${guild.id}`) || {};
                        const configEmbed = new EmbedBuilder()
                            .setColor(client.color)
                            .setAuthor({ name: "Roynix Activity Role", iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- **Select an activity to configure roles:**\n` +
                                `   - ${emojis.spotify} **Spotify** - ${activityDescriptions.spotify}\n` +
                                `   - ${emojis.watching} **Watching** - ${activityDescriptions.watching}\n` +
                                `   - ${emojis.playing} **Playing** - ${activityDescriptions.playing}\n` +
                                `   - ${emojis.streaming} **Streaming** - ${activityDescriptions.streaming}\n` +
                                `- ${emojis.gear} **Configuration:**\n\n` +
                                `   - ${emojis.spotify} **Spotify:** ${updatedData?.spotify ? `<@&${updatedData?.spotify}>` : "Not set"}\n` +
                                `   - ${emojis.watching} **Watching:** ${updatedData?.watching ? `<@&${updatedData?.watching}>` : "Not set"}\n` +
                                `   - ${emojis.playing} **Playing:** ${updatedData?.playing ? `<@&${updatedData?.playing}>` : "Not set"}\n` +
                                `   - ${emojis.streaming} **Streaming:** ${updatedData?.streaming ? `<@&${updatedData?.streaming}>` : "Not set"}\n\n` +
                                `*Click the buttons below to configure roles or reset existing configuration*`
                            )
                            .setThumbnail(guild.iconURL({ size: 1024 }));

                        await setupMessage.edit({ embeds: [configEmbed] }).catch(() => { });
                    });

                    roleCollector.on("end", (collected) => {
                        if (collected.size === 0) {
                            roleMessage.edit({
                                content: `${emojis.warn} Role selection timed out`,
                                components: []
                            }).catch(() => { });
                        }
                    });
                });

                collector.on("end", () => {
                    setupMessage.edit({ components: [] }).catch(() => { });
                });
                break;
            }

            case "reset": {
                const activityRoles = await activityroleDB.get(`activityrole_${guild.id}`) || {};

                if (Object.keys(activityRoles).length === 0) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setDescription(`${emojis.warn} **No activity roles configured.**`)
                        ]
                    });
                }

                await client.activityroleDB.delete(`activityrole_${guild.id}`);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(client.color)
                            .setDescription(`${emojis.tick} **Successfully reset all activity roles.**`)
                    ]
                });
                break;
            }

            case "config": {
                const activityRoles = await activityroleDB.get(`activityrole_${guild.id}`) || {};

                if (Object.keys(activityRoles).length === 0) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setDescription(`${emojis.warn} **No activity roles configured.**`)
                        ]
                    });
                }

                const configEmbed = new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: "Activity Role Configuration", iconURL: client.user.avatarURL({ size: 1024 }) })
                    .setThumbnail(guild.iconURL({ size: 1024 }))
                    .setDescription(`- ${emojis.gear} **Configured Activity Roles:**\n` +
                        `   - ${emojis.spotify} **Spotify:** ${activityRoles?.spotify ? `<@&${activityRoles?.spotify}>` : "None"}\n` +
                        `   - ${emojis.watching} **Watching:** ${activityRoles?.watching ? `<@&${activityRoles?.watching}>` : "None"}\n` +
                        `   - ${emojis.playing} **Playing:** ${activityRoles?.playing ? `<@&${activityRoles?.playing}>` : "None"}\n` +
                        `   - ${emojis.streaming} **Streaming:** ${activityRoles?.streaming ? `<@&${activityRoles?.streaming}>` : "None"}`);

                await interaction.reply({ embeds: [configEmbed] });
                break;
            }
        }
    }
};