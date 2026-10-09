import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { paginate } from '../../../utils/pagination.js'
import config from '../../../config/config.js'

export const data = {
    name: 'autorole',
    description: 'Configure automatic role assignment system',
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    aliases: ['ar', 'auto-role'],
    subCommandCount: 4,
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const autoroleDB = client.autoroleDB
        const autoroleData = await autoroleDB.get(`autorole_${message.guild.id}`) || {}
        const allPremiumEntries = await client.premiumGuildDB.all();
        const premium = allPremiumEntries.some(entry =>
            entry.id.startsWith(`guild_${message.guild.id}_`)
        )
        const subcommand = args[0]
        const action = args[1]

        switch (subcommand) {
            case 'humans': {
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
                                            `\`\`\`autorole humans add <role>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`role\` - A role mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
                                ]
                            });
                        }
                        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]) || await message.guild.roles.fetch(args[2]).catch(() => null)

                        if (!role) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid Role Provided**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Cannot add roles with Administrator permission**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const roles = autoroleData?.humans || []

                        if (roles?.includes(role.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Role is already in human autoroles**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        if (roles.length >= (premium ? 20 : 5)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **This guild has reached the maximum number of autorole for humans**\n\n` +
                                            `- Premium Guilds: 15 autoroles allowed.\n- Non-Premium Guilds: 3 autoroles allowed.`)
                                        .setColor(client.color)
                                ],
                                components: [
                                    new ActionRowBuilder()
                                        .addComponents(
                                            new ButtonBuilder()
                                                .setLabel('Buy Premium Here !')
                                                .setEmoji(emojis.premium_user)
                                                .setStyle(ButtonStyle.Link)
                                                .setURL(config.links.supportServer)
                                        )
                                ],
                            });
                        }


                        roles.push(role.id)

                        await autoroleDB.set(`autorole_${message.guild.id}.humans`, roles)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Role added to human autoroles**`)
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
                                            `\`\`\`autorole humans remove <role>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`role\` - A role mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]) || await message.guild.roles.fetch(args[2]).catch(() => null)

                        if (!role) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid Role Provided**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const roles = autoroleData?.humans || []

                        if (!roles?.includes(role.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Role is not in human autoroles**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        roles.splice(roles.indexOf(role.id), 1)

                        await autoroleDB.set(`autorole_${message.guild.id}.humans`, roles)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Role removed from human autoroles**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const roles = autoroleData?.humans || []

                        if (!roles?.length) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No human autoroles configured**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const itemsPerPage = 5;
                        const totalPages = Math.ceil(roles.length / itemsPerPage);

                        const generateEmbed = (pageNum) => {
                            const start = pageNum * itemsPerPage;
                            const end = start + itemsPerPage;
                            const pageItems = roles.slice(start, end);

                            const embed = new EmbedBuilder()
                                .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 1024 }) })
                                .setTitle(`Human Autoroles`)
                                .setColor(client.color)
                                .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                                .setThumbnail(message.guild.iconURL({ size: 1024 }));

                            let description = "";
                            pageItems.forEach(r => {
                                description += `<@&${r}>\n`;
                            })

                            embed.setDescription(description || "No roles found.");
                            return embed;
                        };

                        await paginate(message, roles, itemsPerPage, generateEmbed);
                        return;
                    }

                    case 'reset': {
                        const roles = autoroleData?.humans || []

                        if (!roles?.length) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No human autoroles to reset**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        await autoroleDB.set(`autorole_${message.guild.id}.humans`, [])

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Human autoroles reset successfully**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Human Autoroles', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `- \`autorole humans add\`\n└  Add role for human members\n\n` +
                                        `- \`autorole humans remove\`\n└  Remove role from humans\n\n` +
                                        `- \`autorole humans list\`\n└  Show human autoroles\n\n` +
                                        `- \`autorole humans reset\`\n└  Reset all human roles`
                                    )
                                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                                    .setThumbnail(client.user.avatarURL({ size: 1024 }))
                                    .setColor(client.color)
                            ]
                        })
                    }
                }
            }

            case 'bots': {
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
                                            `\`\`\`autorole bots add <role>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`role\` - A role mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
                                ]
                            });
                        }

                        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]) || await message.guild.roles.fetch(args[2]).catch(() => null)

                        if (!role) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid Role Provided**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Cannot add roles with Administrator permission**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const roles = autoroleData?.bots || []

                        if (roles?.includes(role.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Role is already in bot autoroles**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        if (roles.length >= (premium ? 20 : 5)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **This guild has reached the maximum number of autorole for bots**\n\n` +
                                            `- Premium Guilds: 15 autoroles allowed.\n- Non-Premium Guilds: 3 autoroles allowed.`)
                                        .setColor(client.color)
                                ],
                                components: [
                                    new ActionRowBuilder()
                                        .addComponents(
                                            new ButtonBuilder()
                                                .setLabel('Buy Premium Here !')
                                                .setEmoji(emojis.premium_user)
                                                .setStyle(ButtonStyle.Link)
                                                .setURL(config.links.supportServer)
                                        )
                                ],
                            });
                        }

                        roles.push(role.id)

                        await autoroleDB.set(`autorole_${message.guild.id}.bots`, roles)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Role added to bot autoroles**`)
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
                                            `\`\`\`autorole bots remove <role>\`\`\`\n` +
                                            `**Arguments**\n` +
                                            `\`role\` - A role mention or ID <required>\n\n` +
                                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                        )
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]) || await message.guild.roles.fetch(args[2]).catch(() => null)

                        if (!role) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Invalid Role Provided**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const roles = autoroleData?.bots || []

                        if (!roles?.includes(role.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Role is not in bot autoroles**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        roles.splice(roles.indexOf(role.id), 1)

                        await autoroleDB.set(`autorole_${message.guild.id}.bots`, roles)

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Role removed from bot autoroles**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const roles = autoroleData?.bots || []

                        if (!roles?.length) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No bot autoroles configured**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const itemsPerPage = 5;
                        const totalPages = Math.ceil(roles.length / itemsPerPage);

                        const generateEmbed = (pageNum) => {
                            const start = pageNum * itemsPerPage;
                            const end = start + itemsPerPage;
                            const pageItems = roles.slice(start, end);

                            const embed = new EmbedBuilder()
                                .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 1024 }) })
                                .setTitle(`Bot Autoroles`)
                                .setColor(client.color)
                                .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                                .setThumbnail(message.guild.iconURL({ size: 1024 }));

                            let description = "";
                            pageItems.forEach(r => {
                                description += `<@&${r}>\n`;
                            })

                            embed.setDescription(description || "No roles found.");
                            return embed;
                        };

                        await paginate(message, roles, itemsPerPage, generateEmbed);
                        return;
                    }

                    case 'reset': {
                        const roles = autoroleData?.bots || []

                        if (!roles?.length) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No bot autoroles to reset**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        await autoroleDB.set(`autorole_${message.guild.id}.bots`, [])

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Bot autoroles reset successfully**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Bot Autoroles', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `- \`autorole bots add\`\n└  Add role for bot members\n\n` +
                                        `- \`autorole bots remove\`\n└  Remove role from bots\n\n` +
                                        `- \`autorole bots list\`\n└  Show bot autoroles\n\n` +
                                        `- \`autorole bots reset\`\n└  Reset all bot roles`
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
                            .setAuthor({ name: 'Autorole System', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`autorole humans\`\n└  Manage roles for human members\n\n` +
                                `- \`autorole bots\`\n└  Manage roles for bot members`
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