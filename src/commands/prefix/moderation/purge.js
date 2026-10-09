import { EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';

const sendTemp = async (channel, options, delay = 3500) => {
    const sent = await channel.send(options).catch(() => null);
    if (sent) {
        setTimeout(() => {
            sent.delete().catch(() => { });
        }, delay);
    }
    return sent;
};

export const data = {
    name: 'purge',
    aliases: ['clear', 'c'],
    description: 'Delete a number of messages from a channel.',
    userPerms: ['ManageMessages'],
    botPerms: ['ManageMessages'],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const a = args[0];

        message.delete().catch(() => { });

        if (!['bots', 'user', 'contains', 'mentions', 'attachments', 'embeds']?.includes(a)) {
            if (!a || isNaN(a)) {
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                            .setDescription(
                                `${emojis.warn}: **Missing Required Argument**\n\n` +
                                `**Usage:**\n` +
                                `\`\`\`purge <amount>\`\`\`\n` +
                                `**Arguments**\n` +
                                `\`amount\` - Amount for purging number of messages in the channel <required>\n\n` +
                                `\`\`\`ansi\n [31m<required> [0m  [34m[optional] [0m\`\`\``
                            )
                            .setColor(client.color)
                    ]
                }, 5000);
            }


            if (a > 100 || a < 1) {
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Please provide a number between 1 and 100**`)
                            .setColor(client.color)
                    ]
                }, 5000);
            }
            try {
                const deleted = await message.channel.bulkDelete(a, true).catch(() => { });
                if (!deleted) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.error} **An error occurred while purging messages**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }

                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                        .setDescription(`${emojis.tick} **Purged \`${deleted.size}\` messages**`)
                        .setColor(client.color)
                    ]
                }, 3500);
            } catch (error) {
                console.log(error);
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.error} **An error occurred while purging messages**`)
                            .setColor(client.color)
                    ]
                }, 5000);
            }
        }

        switch (a) {
            case 'bots': {
                const botMessages = await message.channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (!botMessages) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.error} **An error occurred while purging messages**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const botMessagesFiltered = botMessages.filter(m => m.author.bot).first(100);
                if (botMessagesFiltered.size < 1) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No bot messages found**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const deleted = await message.channel.bulkDelete(botMessagesFiltered, true).catch(() => { });
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Purged \`${deleted.size}\` bot messages**`)
                            .setColor(client.color)
                    ]
                }, 3500);
            }

            case 'user': {
                if(!args[1]) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n` +
                                    `\`\`\`purge user <user>\`\`\`\n` +
                                    `**Arguments**\n` +
                                    `\`user\` - A user mention or ID <required> <required>\n\n` +
                                    `\`\`\`ansi\n [31m<required> [0m  [34m[optional] [0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    }, 5000);
                }

                const user = message.mentions.members.first() || message.guild.members.cache.get(args[1]) || await message.guild.members.fetch(args[1]).catch(() => null);
                if (!user) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a valid user mention or ID**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }

                const userMessages = await message.channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (!userMessages) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.error} **An error occurred while purging messages**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const userMessagesFiltered = userMessages.filter(m => m.user.id === user).first(100);
                if (userMessagesFiltered.size < 1) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No user messages found**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const deleted = await message.channel.bulkDelete(userMessagesFiltered, true).catch(() => { });
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Purged \`${deleted.size}\` user messages**`)
                            .setColor(client.color)
                    ]
                }, 3500);
            }

            case 'contains': {
                const containsMessages = await message.channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (!containsMessages) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.error} **An error occurred while purging messages**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const containsMessagesFiltered = containsMessages.filter(m => m.content.toLowerCase().includes(args[1]?.toLowerCase())).first(args[2] || 100);
                if (containsMessagesFiltered.size < 1) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No messages found containing \`${args[1]}\`**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const deleted = await message.channel.bulkDelete(containsMessagesFiltered, true).catch(() => { });
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Purged \`${deleted.size}\` messages containing \`${args[1]}\`**`)
                            .setColor(client.color)
                    ]
                }, 3500);
            }

            case 'mentions': {
                const mentionsMessages = await message.channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (!mentionsMessages) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.error} **An error occurred while purging messages**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const mentionsMessagesFiltered = mentionsMessages.filter(m => m.mentions.has(message.author)).first(100);
                if (mentionsMessagesFiltered.size < 1) {
                    return sendTemp(message.channel, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No messages found with mentions**`)
                                .setColor(client.color)
                        ]
                    }, 5000);
                }
                const deleted = await message.channel.bulkDelete(mentionsMessagesFiltered, true).catch(() => { });
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Purged \`${deleted.size}\` messages with mentions**`)
                            .setColor(client.color)
                    ]
                }, 3500);
            }

            default:
                return sendTemp(message.channel, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Invalid Option**`)
                            .setColor(client.color)
                    ]
                }, 5000);
        }
    }
};