import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { handleWelcome } from '../../../functions/handleWelcome.js';

export const data = {
    name: 'welcome',
    description: 'Configure the welcome system of the server',
    UserPerms: ['Administrator'],
    botPerms: ['Administrator'],
    subCommandCount: 3,
    /**
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const welcomeDB = client.welcomeDB
        const guild = message.guild
        const welcomeData = await welcomeDB.get(`welcomeData_${guild.id}`) || {}
        const isSetuped = welcomeData?.enabled || false
        const subcommand = args[0]

        switch (subcommand) {
            case 'variables': {
                message.reply({
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
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} Welcome system is already enabled`)
                                .setColor(client.color)
                        ]
                    });
                }

                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n` +
                                    `\`\`\`welcome setup <channel>\`\`\`\n` +
                                    `**Arguments**\n` +
                                    `\`channel\` - A channel mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }

                const channel = message.mentions.channels.first() || guild.channels.cache.get(args[1]);
                if (!channel?.isTextBased()) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} Invalid text channel`)
                                .setColor(client.color)
                        ]
                    });
                }

                const setupEmbed = new EmbedBuilder()
                    .setDescription('**Click the button below to set up your welcome message!**')
                    .setFooter({ text: 'use welcome variables to see the welcome variables', iconURL: guild.iconURL({ size: 1024 }) })
                    .setColor(client.color);

                const button = new ButtonBuilder()
                    .setCustomId('set_welcome_msg')
                    .setLabel('Set Welcome Message')
                    .setStyle(ButtonStyle.Success);

                const sentMessage = await message.reply({
                    embeds: [setupEmbed],
                    components: [new ActionRowBuilder().addComponents(button)]
                });

                const collector = sentMessage.createMessageComponentCollector({
                    time: 180_000
                });

                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
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

                            await sentMessage.edit({
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
                    try {
                        if (reason === 'time') {
                            const disabledButton = new ButtonBuilder()
                                .setCustomId('set_welcome_msg')
                                .setLabel('Setup Expired')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true);

                            await sentMessage.edit({
                                components: [new ActionRowBuilder().addComponents(disabledButton)]
                            });

                            await message.channel.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} Welcome setup timed out`)
                                        .setColor(client.color)
                                ]
                            });
                        }
                    } catch (error) {
                        console.error('Collector end error:', error);
                    }
                });
                break;
            }

            case 'reset': {
                if (!isSetuped) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Welcome system is not set up yet**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await welcomeDB.delete(`welcomeData_${guild.id}`);

                const resetEmbed = new EmbedBuilder()
                    .setDescription(`${emojis.tick} **Welcome system reset successfully!**`)
                    .setColor(client.color);

                message.reply({
                    embeds: [resetEmbed]
                });
                break;
            }

            case 'config': {
                if (!isSetuped) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Welcome system is not set up yet**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const channel = guild.channels.cache.get(welcomeData.channel);
                const configEmbed = new EmbedBuilder()
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
                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) });

                message.reply({ embeds: [configEmbed] });
                break;
            }

            case 'test': {
                if (!isSetuped) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Welcome system is not set up yet**`)
                                .setColor(client.color)
                        ]
                    });
                }

                handleWelcome(guild, message.member, client);

                message.reply({
                    embeds: [
                        new EmbedBuilder()
                           .setDescription(`${emojis.tick} **Welcome message sent to <#${welcomeData?.channel}>**`)
                           .setColor(client.color)
                    ]
                })
                break;
            }

            default: {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Welcome Commands', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`welcome variables\`\n└ Shows all available welcome variables\n\n` +
                                `- \`welcome setup <channel>\`\n└ Setup welcome system in a channel\n\n` +
                                `- \`welcome config\`\n└ Show current welcome configuration\n\n` +
                                `- \`welcome test\`\n└ Test the welcome message you made\n\n` +
                                `- \`welcome reset\`\n└ Reset welcome system configuration`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                });
            }
        }
    }
};
