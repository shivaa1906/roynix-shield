import { EmbedBuilder, subtext } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { paginate } from '../../../utils/pagination.js'

export const data = {
    name: 'media',
    description: 'Configure media-only restriction system',
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    aliases: ['mediaonly', 'mo'],
    subCommandCount:8,
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const mediaDB = client.mediaDB
        const mediaData = await mediaDB.get(`media_${message.guild.id}`) || {}
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
                                            `\`\`\`media channel add <channel>\`\`\`\n` +
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

                        const channels = mediaData?.channels || []

                        if (channels?.includes(channel.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is already media-only restricted**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        channels.push(channel.id)

                        await mediaDB.set(`media_${message.guild.id}.channels`, channels)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Channel added to media-only restriction list**`)
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
                                            `\`\`\`media channel remove <channel>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`channel\` - A channel mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
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

                        const channels = mediaData?.channels || []

                        if (!channels?.includes(channel.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is not media-only restricted**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        channels.splice(channels.indexOf(channel.id), 1)

                        await mediaDB.set(`media_${message.guild.id}.channels`, channels)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Channel removed from media-only restriction list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const channels = mediaData?.channels || []

                        if (!channels?.length || channels?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No channels have media-only restrictions**`)
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
                                .setTitle(`Media-Only Channels`)
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
                        const channels = mediaData?.channels || []

                        if (!channels?.length || channels?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                       .setDescription(`${emojis.warn} **No channels have media-only restrictions**`)
                                       .setColor(client.color)
                                ]
                            })
                        }

                        await mediaDB.set(`media_${message.guild.id}.channels`, [])

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                   .setDescription(`${emojis.tick} **Media-only channels reset successfully**`)
                                   .setColor(client.color)
                            ]
                        })
                    }

                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Roynix Media-Only Channels', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `- \`media channel add\`\n└  Adds a media-only channel restriction\n\n` +
                                        `- \`media channel remove\`\n└  Removes a media-only restriction\n\n` +
                                        `- \`media channel list\`\n└  Shows media-only restricted channels\n\n` +
                                        `- \`media channel reset\`\n└  Resets all media-only channels`
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
                                            `\`\`\`media bypass add <user>\`\`\`\n` +
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

                        const bypass = mediaData?.bypass || []

                        if (bypass?.includes(user.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **User already bypasses media restrictions**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        bypass.push(user.id)

                        await mediaDB.set(`media_${message.guild.id}.bypass`, bypass)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **User added to media bypass list**`)
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
                                            `\`\`\`media bypass remove <user>\`\`\`\n` +
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

                        const bypass = mediaData?.bypass || []

                        if (!bypass?.includes(user.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **User is not in bypass list**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        bypass.splice(bypass.indexOf(user.id), 1)

                        await mediaDB.set(`media_${message.guild.id}.bypass`, bypass)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **User removed from media bypass list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const bypass = mediaData?.bypass || []

                        if (!bypass?.length || bypass?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No users bypass media restrictions**`)
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
                                .setTitle(`Media Bypass Users`)
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
                        const bypass = mediaData?.bypass || []

                        if (!bypass?.length || bypass?.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                       .setDescription(`${emojis.warn} **No users bypass media restrictions**`)
                                       .setColor(client.color)
                                ]
                            })
                        }

                        await mediaDB.set(`media_${message.guild.id}.bypass`, [])

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                   .setDescription(`${emojis.tick} **Media bypass list reset successfully**`)
                                   .setColor(client.color)
                            ]
                        })
                    }
                
                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Roynix Media Bypass', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `- \`media bypass add\`\n└  Allow user to bypass media restrictions\n\n` +
                                        `- \`media bypass remove\`\n└  Remove media bypass permission\n\n` +
                                        `- \`media bypass list\`\n└  Show users who bypass restrictions\n\n` +
                                        `- \`media bypass reset\`\n└  Clear all bypass permissions`
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
                            .setAuthor({ name: 'Roynix Media Restrictions', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`media channel\`\n└  Configure media-only channels\n\n` +
                                `- \`media bypass\`\n└  Manage bypass permissions`
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