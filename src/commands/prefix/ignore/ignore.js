import { EmbedBuilder } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { paginate } from '../../../utils/pagination.js'

export const data = {
    name: 'ignore',
    description: 'Configure ignore system',
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    aliases: ['ign'],
    subCommandCount: 8,
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const ignoreDB = client.ignoreDB
        const ignoreData = await ignoreDB.get(`ignore_${message.guild.id}`) || {}
        const subcommand = args[0]
        const action = args[1]

        switch (subcommand) {
            case 'channel': {
                switch (action) {
                    case 'add': {
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                        .setDescription(
                                            `${emojis.warn}: **Missing Required Argument**\n\n` +
                                            `**Usage:**\n` +
                                            `\`\`\`ignore channel add <channel>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`channel\` - A channel mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
                                ]
                            });
                        }
                        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[2]) || await message.guild.channels.fetch(args[2]).catch(() => null)

                        if (!channel) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid Channel Provided**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const channels = ignoreData?.channels || []

                        if (channels?.includes(channel.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is already ignored**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        channels.push(channel.id)

                        await ignoreDB.set(`ignore_${message.guild.id}.channels`, channels)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Channel added to ignore list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'remove': {
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                        .setDescription(
                                            `${emojis.warn}: **Missing Required Argument**\n\n` +
                                            `**Usage:**\n` +
                                            `\`\`\`ignore channel remove <channel>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`channel\` - A channel mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                ]
                            })
                        }

                        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[2]) || await message.guild.channels.fetch(args[2]).catch(() => null)

                        if (!channel) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid Channel Provided**`)
                                        .setColor(client.color)

                                ]
                            })
                        }

                        const channels = ignoreData?.channels || []

                        if (!channels?.includes(channel.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is not ignored**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        channels.splice(channels.indexOf(channel.id), 1)

                        await ignoreDB.set(`ignore_${message.guild.id}.channels`, channels)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Channel removed from ignore list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const channels = ignoreData?.channels || []

                        if (!channels?.length || channels?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No channels are ignored**`)
                                        .setColor(client.color)
                                ]
                            })
                        }


                        const itemsPerPage = 5;
                        const totalPages = Math.ceil(channels.length / itemsPerPage);

                        const generateEmbed = (pageNum) => {
                            const start = pageNum * itemsPerPage;
                            const end = start + itemsPerPage;
                            const pageItems = channels.slice(start, end);

                            const embed = new EmbedBuilder()
                                .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 1024 }) })
                                .setTitle(`Ignored Channels`)
                                .setColor(client.color)
                                .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                                .setThumbnail(message.guild.iconURL({ size: 1024 }));

                            let description = "";
                            pageItems.forEach(m => {
                                description += `<#${m}>\n`;
                            })

                            embed.setDescription(description || "No channels found.");
                            return embed;
                        };


                        await paginate(message, channels, itemsPerPage, generateEmbed);
                        return;
                    }

                    case 'reset': {
                        const channels = ignoreData?.channels || []

                        if (!channels?.length || channels?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                       .setDescription(`${emojis.warn} **No channels are ignored**`)
                                       .setColor(client.color)
                                ]
                            })
                        }

                        await ignoreDB.set(`ignore_${message.guild.id}.channels`, [])

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                   .setDescription(`${emojis.tick} **Channels reseted successfully**`)
                                   .setColor(client.color)
                            ]
                        })
                    }

                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Roynix Ignore Channel', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `- \`ignore channel add\`\n└  Adds a channel to the ignore channel list\n\n` +
                                        `- \`ignore channel remove\`\n└  Removes a channel from ignore channel list\n\n` +
                                        `- \`ignore channel list\`\n└  Shows the list of ignored channles\n\n` +
                                        `- \`ignore channel reset\`\n└  Resets the ignore channel list`
                                    )
                                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                                    .setThumbnail(client.user.avatarURL({ size: 1024 }))
                                    .setColor(client.color)
                            ]
                        })
                    }
                }
            }

            case 'bypass': {
                switch (action) {
                    case 'add': {
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                        .setDescription(
                                            `${emojis.warn}: **Missing Required Argument**\n\n` +
                                            `**Usage:**\n` +
                                            `\`\`\`ignore bypass add <user>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`user\` - A user mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
                                ]
                            });
                        }

                        const user = message.mentions.users.first() || message.guild.members.cache.get(args[2]) || await message.guild.members.fetch(args[2]).catch(() => null)

                        if (!user) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid User Provided**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const bypass = ignoreData?.bypass || []

                        if (bypass?.includes(user.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **User is already bypassed**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        bypass.push(user.id)

                        await ignoreDB.set(`ignore_${message.guild.id}.bypass`, bypass)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **User added to bypass list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'remove': {
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                        .setDescription(
                                            `${emojis.warn}: **Missing Required Argument**\n\n` +
                                            `**Usage:**\n` +
                                            `\`\`\`ignore bypass remove <user>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`user\` - A user mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const user = message.mentions.users.first() || message.guild.members.cache.get(args[2]) || await message.guild.members.fetch(args[2]).catch(() => null)

                        if (!user) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid User Provided**`)
                                        .setColor(client.color)

                                ]
                            })
                        }

                        const bypass = ignoreData?.bypass || []

                        if (!bypass?.includes(user.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **User is not bypassed**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        bypass.splice(bypass.indexOf(user.id), 1)

                        await ignoreDB.set(`ignore_${message.guild.id}.bypass`, bypass)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **User removed from bypass list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const bypass = ignoreData?.bypass || []

                        if (!bypass?.length || bypass?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No users are bypassed**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const itemsPerPage = 5;
                        const totalPages = Math.ceil(bypass.length / itemsPerPage);

                        const generateEmbed = (pageNum) => {
                            const start = pageNum * itemsPerPage;
                            const end = start + itemsPerPage;
                            const pageItems = bypass.slice(start, end);

                            const embed = new EmbedBuilder()
                                .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 1024 }) })
                                .setTitle(`Bypassed Users`)
                                .setColor(client.color)
                                .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                                .setThumbnail(message.guild.iconURL({ size: 1024 }));

                            let description = "";
                            pageItems.forEach(m => {
                                description += `<@${m}>\n`;
                            })

                            embed.setDescription(description || "No users found.");
                            return embed;
                        };

                        await paginate(message, bypass, itemsPerPage, generateEmbed);
                        return;
                    }

                    case 'reset': {
                        const bypass = ignoreData?.bypass || []

                        if (!bypass?.length || bypass?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                       .setDescription(`${emojis.warn} **No users are bypassed**`)
                                       .setColor(client.color)
                                ]
                            })
                        }

                        await ignoreDB.set(`ignore_${message.guild.id}.bypass`, [])

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                   .setDescription(`${emojis.tick} **Bypassed users reseted successfully**`)
                                   .setColor(client.color)
                            ]
                        })
                    }
                
                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Roynix Ignore Bypass', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `- \`ignore bypass add\`\n└  Adds a user to the bypass list\n\n` +
                                        `- \`ignore bypass remove\`\n└  Removes a user from bypass list\n\n` +
                                        `- \`ignore bypass list\`\n└  Shows the list of bypassed users\n\n` +
                                        `- \`ignore bypass reset\`\n└  Resets the bypass list`
                                    )
                                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                                    .setThumbnail(client.user.avatarURL({ size: 1024 }))
                                    .setColor(client.color)
                            ]
                        })
                    }
                }
            }

            default: {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Ignore', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`ignore channel\`\n└  Configure the ignore channel system\n\n` +
                                `- \`ignore bypass\`\n└  Configure the bypass system`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                })
            }
        }


    }
}