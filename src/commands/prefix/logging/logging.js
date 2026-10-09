import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    PermissionsBitField,
    StringSelectMenuBuilder
} from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'logging',
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    subCommandCount: 3,
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const guild = message.guild;
        const loggingDB = client.loggingDB;
        const subcommand = args[0];

        const fields = [
            { name: 'Message Logs', key: 'messageLogs' },
            { name: 'Member Join Leave', key: 'memberJoinLeave' },
            { name: 'Channel Changes', key: 'channelChanges' },
            { name: 'Role Changes', key: 'roleChanges' },
            { name: 'Voice State', key: 'voiceState' },
            { name: 'Emoji Changes', key: 'emojiChanges' },
            { name: 'Moderation Actions', key: 'moderationActions' },
            { name: 'Member Update', key: 'memberUpdate' },
            { name: 'Guild Update', key: 'guildUpdate' }
        ];

        switch (subcommand) {
            case 'setup': {
                const loggingData = await loggingDB.get(`loggingData_${guild.id}`) || {};
                if (loggingData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Logging is already enabled in this server.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`logging_select`)
                    .setPlaceholder('Select events to setup')
                    .setMinValues(1)
                    .setMaxValues(fields.length)
                    .addOptions(fields.map(field => ({ label: field.name, value: field.key })));

                const whitelistAllButton = new ButtonBuilder()
                    .setCustomId(`logging_all`)
                    .setLabel('All Events')
                    .setEmoji(emojis.gear)
                    .setStyle(ButtonStyle.Secondary);

                const actionRow = new ActionRowBuilder().addComponents(selectMenu);
                const buttonRow = new ActionRowBuilder().addComponents(whitelistAllButton);

                const embed = new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: 'Select Events to Enable Logging', iconURL: guild.iconURL({ size: 1024 }) || undefined })
                    .setDescription(`Use the dropdown below to select the server events you want to log.\nYou can also use the button to enable logging for all events at once.`)
                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) });

                const sentMessage = await message.reply({ embeds: [embed], components: [actionRow, buttonRow] });

                const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

                collector.on('collect', async (i) => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: 'You cannot interact with this.', flags: MessageFlags.Ephemeral });
                    }

                    if (i.customId === 'logging_select' || i.customId === 'logging_all') {
                        await i.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.loading} **Setting up logging channels, please wait...**`)
                                    .setColor(client.color)
                            ],
                            flags: MessageFlags.Ephemeral
                        });

                        const is_enabled = await loggingDB.get(`loggingData_${guild.id}.enabled`);
                        if (is_enabled) {
                            return i.editReply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Logging is already enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            });
                        }

                        const selectedEvents = i.customId === 'logging_all'
                            ? fields.map(f => f.key)
                            : i.values;

                        const createdChannels = {};

                        const category = await guild.channels.create({
                            name: 'Server Logs',
                            type: ChannelType.GuildCategory,
                        });

                        for (const eventKey of selectedEvents) {
                            const field = fields.find(f => f.key === eventKey);
                            if (!field) continue;

                            const channel = await guild.channels.create({
                                name: field.name.toLowerCase().replace(/\s+/g, '-'),
                                type: ChannelType.GuildText,
                                parent: category.id,
                            });

                            createdChannels[eventKey] = channel.id;
                        }

                        await loggingDB.set(`loggingData_${guild.id}`, {
                            enabled: true,
                            events: createdChannels,
                            categoryId: category.id
                        });

                        const selectedLabels = fields
                            .filter(field => selectedEvents.includes(field.key))
                            .map(field => `${emojis.enabled} **${field.name}** → <#${createdChannels[field.key]}>`)
                            .join("\n");

                        await i.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Logging setup completed successfully!**`)
                                    .setColor(client.color)
                            ]
                        });

                        await sentMessage.edit({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(client.color)
                                    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 1024 }) || undefined })
                                    .setDescription(`${emojis.tick} **Logging has been enabled for the following events:**\n\n${selectedLabels}`)
                                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                            ],
                            components: []
                        });

                        collector.stop();
                    }
                });
                break;
            }

            case 'config': {
                const loggingData = await loggingDB.get(`loggingData_${guild.id}`);
                if (!loggingData?.enabled || !loggingData?.events) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Logging is not enabled in this server.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const eventMappings = {
                    messageLogs: 'Message Logs',
                    memberJoinLeave: 'Member Join Leave',
                    channelChanges: 'Channel Changes',
                    roleChanges: 'Role Changes',
                    voiceState: 'Voice State',
                    emojiChanges: 'Emoji Changes',
                    moderationActions: 'Moderation Actions',
                    memberUpdate: 'Member Update',
                    guildUpdate: 'Guild Update'
                };

                const description = Object.entries(loggingData.events)
                    .map(([eventKey, channelId]) => {
                        const eventName = eventMappings[eventKey] || eventKey;
                        return `${emojis.enabled} **${eventName}** → <#${channelId}>`;
                    })
                    .join("\n");

                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(client.color)
                            .setAuthor({ name: `${guild.name} - Logging Configuration`, iconURL: guild.iconURL({ size: 1024 }) || undefined })
                            .setDescription(description)
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    ]
                });
                break;
            }

            case 'reset': {
                const loggingData = await loggingDB.get(`loggingData_${guild.id}`);
                if (!loggingData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Logging is not enabled in this server.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const loadingMessage = await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.loading} **Resetting logging system... Please wait.**`)
                            .setColor(client.color)
                    ]
                });
            
                if (loggingData?.events) {
                    for (const channelId of Object.values(loggingData.events)) {
                        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
                        if (channel) {
                            try { await channel.delete().catch(() => {}); } catch {}
                        }
                    }
                }
            
                if (loggingData?.categoryId) {
                    const category = guild.channels.cache.get(loggingData.categoryId) || await guild.channels.fetch(loggingData?.categoryId).catch(() => null);
                    if (category) {
                        try { await category.delete().catch(() => {}); } catch {}
                    }
                }
            
                await loggingDB.delete(`loggingData_${guild.id}`);
            
                await loadingMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Logging system has been successfully reset, and all channels have been deleted!**`)
                            .setColor(client.color)
                    ]
                });
                
                break;
            }
            

            default: {
                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Invalid subcommand! Available:** \`setup\`, \`config\`, \`reset\``)
                            .setColor(client.color)
                    ]
                });
                break;
            }
        }
    }
};
