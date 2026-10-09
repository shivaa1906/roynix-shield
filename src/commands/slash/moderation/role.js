import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags, PermissionsBitField, UserSelectMenuBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import wait from 'wait';

export const data = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Adds or removes roles from users')
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('The role to manage')
                .setRequired(true)
        ),
    async execute(interaction, client) {
        const role = interaction.options.getRole('role');

        if (!role) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Invalid Role Provided**`)
                        .setColor(client.color)
                ],
                ephemeral: true
            });
        }

        if (role.position >= interaction.member.roles.highest.position) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You cannot manage this role**`)
                        .setColor(client.color)
                ],
                ephemeral: true
            });
        }

        if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **I cannot manage this role**`)
                        .setColor(client.color)
                ],
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
            .setDescription(
                `${emojis.info} **Select an action**\n\n` +
                `- ${emojis.gear} **Actions:**\n` +
                `   - **Add Role** - Add a role to a member\n` +
                `   - **Remove Role** - Remove a role from a user\n` +
                `   - **Cancel** - Cancel the operation\n` +
                `   - **Humans** - Give role to all humans in the server\n` +
                `   - **Bots** Give role to all bots in the server\n` +
                `   - **Everyone** Give role to all members in the server\n`
            )
            .setThumbnail(interaction.guild.iconURL({ size: 1024 }))
            .setColor(client.color);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('add')
                    .setLabel('Add Role')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('remove')
                    .setLabel('Remove Role')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('everyone')
                    .setLabel('Everyone')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('humans')
                    .setLabel('Humans')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('bots')
                    .setLabel('Bots')
                    .setStyle(ButtonStyle.Secondary),
            );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );

        let msg = await interaction.reply({
            embeds: [embed],
            components: [row, row2],
        });

        msg = await interaction.fetchReply();

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: `${emojis.warn} **This is not your command**`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (i.customId === 'cancel') {
                i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Cancelled**`)
                            .setColor(client.color)
                    ],
                });
                msg.edit({
                    components: [
                        disableComponents(row),
                        disableComponents(row2)
                    ],
                });
                return collector.stop('cancel');
            }

            if (i.customId === 'add') {
                await handleAddRole(i);
            }

            if (i.customId === 'remove') {
                await handleRemoveRole(i);
            }

            if (['everyone', 'humans', 'bots'].includes(i.customId)) {
                await handleBulkOperation(i);
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await msg.edit({
                    components: [
                        disableComponents(row),
                        disableComponents(row2)
                    ],
                });
            }
        });

        async function handleAddRole(interaction) {
            let reply = await interaction.reply({
                content: `${emojis.info} **Select users to add the role to**`,
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new UserSelectMenuBuilder()
                                .setCustomId('add_role')
                                .setPlaceholder('Select users')
                                .setMinValues(1)
                                .setMaxValues(10)
                        )
                ],
                flags: MessageFlags.Ephemeral
            });

            reply = await reply.fetch();

            const collector = reply.createMessageComponentCollector({
                componentType: ComponentType.UserSelect,
                time: 60000,
                filter: (i) => i.user.id === interaction.user.id
            });

            collector.on('collect', async (selectInteraction) => {
                const members = selectInteraction.values.map(id => interaction.guild.members.cache.get(id));
                let successCount = 0;

                await selectInteraction.deferUpdate();

                for (const member of members) {
                    try {
                        await member.roles.add(role);
                        successCount++;
                        await wait(1000);
                    } catch (error) {
                        console.error(`Failed to add role to ${member.user.tag}:`, error);
                    }
                }

                await selectInteraction.editReply({
                    content: `${emojis.tick} **Added ${role} to ${successCount}/${members.length} members**`,
                    components: []
                });
            });
        }

        async function handleRemoveRole(interaction) {
            let reply = await interaction.reply({
                content: `${emojis.info} **Select users to remove the role from**`,
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new UserSelectMenuBuilder()
                                .setCustomId('remove_role')
                                .setPlaceholder('Select users')
                                .setMinValues(1)
                                .setMaxValues(10)
                        )
                ],
                flags: MessageFlags.Ephemeral
            });

            reply = await reply.fetch();

            const collector = reply.createMessageComponentCollector({
                componentType: ComponentType.UserSelect,
                time: 60000,
                filter: (i) => i.user.id === interaction.user.id
            });

            collector.on('collect', async (selectInteraction) => {
                const members = selectInteraction.values.map(id => interaction.guild.members.cache.get(id));
                let successCount = 0;

                await selectInteraction.deferUpdate();

                for (const member of members) {
                    try {
                        await member.roles.remove(role);
                        successCount++;
                        await wait(1000);
                    } catch (error) {
                    }
                }

                await selectInteraction.editReply({
                    content: `${emojis.tick} **Removed ${role} from ${successCount}/${members.length} members**`,
                    components: []
                });
            });
        }

        async function handleBulkOperation(interaction) {
            if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({
                    content: `${emojis.warn} **You cannot add this role to all members**\n- This role has administrator permissions`,
                    flags: MessageFlags.Ephemeral
                });
            }
            const operationType = interaction.customId;
            const confirmEmbed = new EmbedBuilder()
                .setDescription(`${emojis.warn} **Are you sure you want to add ${role} to ${operationType.toUpperCase()} in this server?**`)
                .setColor(client.color);

            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm')
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            let response = await interaction.reply({
                embeds: [confirmEmbed],
                components: [confirmRow],
                flags: MessageFlags.Ephemeral,
            });

            response = await response.fetch();

            const confirmation = await response.awaitMessageComponent({
                filter: (i) => i.user.id === interaction.user.id,
                time: 30000
            }).catch(() => null);

            if (!confirmation || confirmation.customId === 'cancel') {
                await interaction.editReply({
                    content: `${emojis.tick} **Operation cancelled**`,
                    embeds: [],
                    components: []
                });
                return;
            }

            await confirmation.deferUpdate();
            let members;

            switch (operationType) {
                case 'everyone':
                    members = await interaction.guild.members.fetch();
                    break;
                case 'humans':
                    members = (await interaction.guild.members.fetch()).filter(m => !m.user.bot);
                    break;
                case 'bots':
                    members = (await interaction.guild.members.fetch()).filter(m => m.user.bot);
                    break;
            }

            let successCount = 0;
            const total = members.size;
            await interaction.editReply({
                content: `${emojis.loading} **Processing ${total} members...**`,
                embeds: [],
                components: [],
            });

            for (const [id, member] of members) {
                try {
                    await member.roles.add(role);
                    successCount++;
                    await wait(1000);
                } catch (error) {
                }
            }

            await interaction.editReply({
                content: `${emojis.tick} **Successfully added ${role} to ${successCount}/${total} ${operationType}**\n` +
                    `- Failed: ${total - successCount}`,
            });
        }

        function disableComponents(row) {
            return new ActionRowBuilder().addComponents(
                row.components.map(component =>
                    ButtonBuilder.from(component)
                        .setDisabled(true)
                )
            );
        }
    }
};