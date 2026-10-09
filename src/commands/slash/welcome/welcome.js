import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import { handleWelcome } from '../../../functions/handleWelcome.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Configure the welcome system of the server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('variables')
                .setDescription('Shows all available welcome variables')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup welcome system')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send welcome messages')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset welcome system configuration')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Show current welcome configuration')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Test the welcome message')
        ),
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],

    async execute(interaction, client) {
        const welcomeDB = client.welcomeDB;
        const guild = interaction.guild;
        const welcomeData = await welcomeDB.get(`welcomeData_${guild.id}`) || {};
        const isSetuped = welcomeData?.enabled || false;
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'variables': {
                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Roynix Welcome System Variables')
                            .setDescription(
                                `${emojis.user} **User Variables**\n` +
                                '- `{user_name}` - Username of the joined user\n' +
                                '- `{user_tag}` - Full tag (e.g., User#8697)\n' +
                                '- `{user_id}` - ID of the joined user\n' +
                                '- `{user_gname}` - Global name of the user\n' +
                                '- `{user_discriminator}` - Discriminator\n' +
                                '- `{user_created}` - Account creation date\n' +
                                '- `{user_mention}` - Mention of the user\n\n' +

                                `${emojis.server} **Server Variables**\n` +
                                '- `{server_name}` - Server name\n' +
                                '- `{server_id}` - Server ID\n' +
                                '- `{server_created}` - Server creation date\n' +
                                '- `{server_owner}` - Server owner tag\n' +
                                '- `{server_owner_mention}` - Owner mention\n\n' +

                                `${emojis.stats} **Statistics**\n` +
                                '- `{total_members}` - Total members\n' +
                                '- `{human_count}` - Human members\n' +
                                '- `{bot_count}` - Bot members\n\n' +

                                `${emojis.expire} **Timestamps**\n` +
                                '- `{timestamp}` - Current timestamp\n' +
                                '- `{join_position}` - Join position'
                            )
                            .setColor(client.color)
                    ]
                });
                break;
            }

            case 'setup': {
                if (isSetuped) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} Welcome system is already enabled`)
                                .setColor(client.color)
                        ]
                    });
                }

                const channel = interaction.options.getChannel('channel');
                if (!channel?.isTextBased()) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} Invalid text channel`)
                                .setColor(client.color)
                        ]
                    });
                }

                const setupEmbed = new EmbedBuilder()
                    .setDescription('**Click the button below to set up your welcome message!**')
                    .setFooter({ text: 'use /welcome variables to see the welcome variables', iconURL: guild.iconURL({ size: 1024 }) })
                    .setColor(client.color);

                const button = new ButtonBuilder()
                    .setCustomId('set_welcome_msg')
                    .setLabel('Set Welcome Message')
                    .setStyle(ButtonStyle.Success);

                const msg = await interaction.reply({
                    embeds: [setupEmbed],
                    components: [new ActionRowBuilder().addComponents(button)]
                });

                const collector = msg.createMessageComponentCollector({
                    time: 180_000
                });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: 'This interaction is not for you', flags: MessageFlags.Ephemeral });
                    }
                    if (i.customId === 'set_welcome_msg') {
                        const modal = new ModalBuilder()
                            .setCustomId('welcome_modal')
                            .setTitle('Welcome Message Configuration');

                        const messageInput = new TextInputBuilder()
                            .setCustomId('welcome_msg')
                            .setLabel('Message Content (supports variables)')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(2000)
                            .setPlaceholder('Welcome {user_mention} to {server_name}!');

                        modal.addComponents(new ActionRowBuilder().addComponents(messageInput));

                        await i.showModal(modal);

                        try {
                            const modalSubmit = await i.awaitModalSubmit({
                                time: 300_000,
                                filter: m => m.user.id === i.user.id
                            });

                            const content = modalSubmit.fields.getTextInputValue('welcome_msg');

                            await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

                            await welcomeDB.set(`welcomeData_${guild.id}`, {
                                enabled: true,
                                channel: channel.id,
                                message: content
                            });

                            const successEmbed = new EmbedBuilder()
                                .setDescription(
                                    `- ${emojis.gear} **__System Status__**\n` +
                                    `   - ${emojis.tick} **Enabled:** ${welcomeData.enabled ? 'Yes' : 'No'}\n` +
                                    `   - ${emojis.channel} **Channel:** ${channel ? channel : 'Not Found'}\n\n` +
                                    `- ${emojis.message} **__Welcome Message__**\n` +
                                    content
                                )
                                .setColor(client.color);

                            await msg.edit({
                                embeds: [successEmbed],
                                components: []
                            });

                            await modalSubmit.editReply({ content: `${emojis.tick} Welcome message set` });

                            collector.stop('completed');

                        } catch (error) {
                            console.error('Modal submission error:', error);
                        }
                    }
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'time') {
                        const disabledButton = new ButtonBuilder()
                            .setCustomId('set_welcome_msg')
                            .setLabel('Setup Expired')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true);

                        await msg.edit({
                            components: [new ActionRowBuilder().addComponents(disabledButton)]
                        });

                        await interaction.followUp({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} Welcome setup timed out`)
                                    .setColor(client.color)
                            ]
                        });
                    }
                });
                break;
            }

            case 'reset': {
                if (!isSetuped) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Welcome system is not set up yet**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await welcomeDB.delete(`welcomeData_${guild.id}`);

                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Welcome system reset successfully!**`)
                            .setColor(client.color)
                    ]
                });
                break;
            }

            case 'config': {
                if (!isSetuped) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Welcome system is not set up yet**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const channel = guild.channels.cache.get(welcomeData.channel);
                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Welcome System Configuration', iconURL: guild.iconURL({ size: 1024 }) })
                            .setDescription(
                                `- ${emojis.gear} **__System Status__**\n` +
                                `   - ${emojis.tick} **Enabled:** ${welcomeData.enabled ? 'Yes' : 'No'}\n` +
                                `   - ${emojis.channel} **Channel:** ${channel ? channel : 'Not Found'}\n\n` +
                                `- ${emojis.message} **__Welcome Message__**\n` +
                                welcomeData.message
                            )
                            .setColor(client.color)
                            .setThumbnail(guild.iconURL({ size: 1024 }))
                            .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.avatarURL({ size: 1024 }) })
                    ]
                });
                break;
            }

            case 'test': {
                if (!isSetuped) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Welcome system is not set up yet**`)
                                .setColor(client.color)
                        ]
                    });
                }

                handleWelcome(guild, interaction.member, client);

                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Welcome message sent to <#${welcomeData?.channel}>**`)
                            .setColor(client.color)
                    ]
                });
                break;
            }
        }
    }
};