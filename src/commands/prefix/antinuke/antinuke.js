import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Embed, EmbedBuilder, MessageFlags, PermissionFlagsBits, StringSelectMenuBuilder } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { isBotOwner } from '../../../utils/isBotOwner.js'
import { paginate } from '../../../utils/pagination.js'
import { antinukeModules, findModule, renderEventsList } from '../../../utils/antinukeModules.js'
import { quarantineGuildBots } from '../../../antinuke/zeroTrustQuarantine.js'
export const data = {
    name: 'antinuke',
    description: 'manages the antinuke system of the bot.',
    aliases: ['an'],
    subcCommandCount: 14,
    /**
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix.js').Roynix} client 
     */
    async execute(message, args, client) {
        const guild = message.guild
        const antinukeDB = client.antinukeDB
        const antinukeData = await antinukeDB.get(`antinukeData_${guild.id}`)
        if (!isBotOwner(message.author.id) && message.author.id !== guild.ownerId && !antinukeData?.extraOwners?.includes(message.author.id)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Only server owner & extra owners can use this command.**`)
                        .setColor(client.color)
                ]
            })
        }

        const subcommand = args[0]
        const action = args[1]

        switch (subcommand) {
            case 'enable': {
                if (action) {
                    if (!antinukeData?.enabled) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server.**\nUse \`!antinuke enable\` first to initialize protection.`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const targetModule = findModule(args.slice(1).join(' '));
                    if (!targetModule) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.cross} **Invalid module name.** Use \`!antinuke modules\` to see all available modules.`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const disabled = antinukeData.disabledEvents || [];
                    if (!disabled.includes(targetModule.key)) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **${targetModule.name} is already enabled.** ${emojis.enabled}`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const newDisabled = disabled.filter(k => k !== targetModule.key);
                    await antinukeDB.set(`antinukeData_${guild.id}.disabledEvents`, newDisabled);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **${targetModule.name}** has been enabled. ${emojis.enabled}`)
                                .setColor(client.color)
                        ]
                    });
                }

                if (antinukeData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                .setDescription(`${emojis.warn} **Antinuke system is already enabled in this server.**\n\n`
                                    + `__**Current Status**__\n`
                                    + `${emojis.arrow} **State:** ${antinukeData?.enabled ? `\`Enabled\` ${emojis.tick}` : `\`Disabled\` ${emojis.cross}`}\n`
                                    + `${emojis.arrow} **Use \`antinuke disable\` to turn off protection**\n\n`
                                    + `${emojis.info} **Note:** For full functionality, ensure "Roynix Protect" role is at the top`)
                                .setThumbnail(guild.iconURL({ size: 1024 }))
                                .setColor(client.color)
                        ]
                    })
                }

                const setupEmbed = new EmbedBuilder()
                    .setAuthor({ name: 'Roynix Antinuke Setup', iconURL: client.user.avatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.antinuke} **Initializing protection setup...**\n`
                        + `> ${emojis.loading} Checking required permissions`
                    )
                    .setColor(client.color)
                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                    .setThumbnail(guild.iconURL({ size: 1024 }))

                const msg = await message.reply({ embeds: [setupEmbed] })

                const me = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null)
                if (!me || !me.permissions.has(PermissionFlagsBits.Administrator)) {
                    setupEmbed.setDescription(`${emojis.cross} **Setup failed**\n`
                        + `> Missing required permission: \`Administrator\`\n\n`
                        + `${emojis.info} The bot requires administrator permissions to properly protect your server.`
                    )
                    return msg.edit({ embeds: [setupEmbed] }).catch(() => null)
                }

                await new Promise(resolve => setTimeout(resolve, 800))

                // Frame 2: Permission check passed & Creating protection role
                setupEmbed.setDescription(`${emojis.antinuke} **Initializing protection setup...**\n`
                    + `> ${emojis.tick} Permission check passed\n`
                    + `> ${emojis.loading} Creating protection role & configuring settings`
                )
                await msg.edit({ embeds: [setupEmbed] }).catch(() => null)

                let protectRole = (antinukeData?.protectRole && guild.roles.cache.get(antinukeData.protectRole))
                    || guild.roles.cache.find(r => r.name === 'Roynix Protect' || r.name === 'Roynix Shield Protect')

                if (!protectRole) {
                    try {
                        protectRole = await guild.roles.create({
                            name: 'Roynix Protect',
                            color: '#ef9a12',
                            reason: 'Server protection system',
                            permissions: []
                        })
                    } catch (roleError) {
                        setupEmbed.setDescription(`${emojis.cross} **Setup failed**\n`
                            + `> Failed to create protection role: \`${roleError.message || 'Missing Permissions'}\`\n\n`
                            + `${emojis.info} Please ensure the bot has permission to manage roles and the server has not reached the role limit.`
                        )
                        return msg.edit({ embeds: [setupEmbed] }).catch(() => null)
                    }
                }

                const newConfig = {
                    enabled: true,
                    extraOwners: antinukeData?.extraOwners || [],
                    whitelisted: antinukeData?.whitelisted || {},
                    whitelistedRoles: antinukeData?.whitelistedRoles || {},
                    protectRole: protectRole.id,
                    logsChannel: antinukeData?.logsChannel || null,
                    punishment: antinukeData?.punishment || 'ban',
                    disabledEvents: antinukeData?.disabledEvents || []
                }
                await client.setAntinukeData(guild.id, newConfig)

                try {
                    const highestBotRolePos = me.roles?.highest?.position ?? 0
                    if (highestBotRolePos > 1 && protectRole.position < highestBotRolePos - 1) {
                        await protectRole.setPosition(highestBotRolePos - 1).catch(() => null)
                    }
                } catch (roleError) {
                }

                await new Promise(resolve => setTimeout(resolve, 900))

                // Frame 3: Roles ready & configuration saved
                setupEmbed.setDescription(`${emojis.antinuke} **Initializing protection setup...**\n`
                    + `> ${emojis.tick} Permission check passed\n`
                    + `> ${emojis.tick} Created protection role (<@&${protectRole.id}>)\n`
                    + `> ${emojis.tick} System configuration saved\n`
                    + `> ${emojis.loading} Finalizing security audit`
                )
                await msg.edit({ embeds: [setupEmbed] }).catch(() => null)

                // Security Audit: Check un-whitelisted bots for warning notice without proactively stripping roles
                let warningText = '';
                try {
                    const unwhitelistedBots = guild.members.cache.filter(m =>
                        m.user.bot &&
                        m.id !== client.user.id &&
                        !isBotOwner(m.id) &&
                        !newConfig.whitelisted?.[m.id] &&
                        !newConfig.extraOwners?.includes(m.id) &&
                        (m.permissions.has(PermissionFlagsBits.Administrator) ||
                         m.permissions.has(PermissionFlagsBits.ManageChannels) ||
                         m.permissions.has(PermissionFlagsBits.ManageRoles) ||
                         m.permissions.has(PermissionFlagsBits.BanMembers) ||
                         m.permissions.has(PermissionFlagsBits.KickMembers))
                    );

                    if (unwhitelistedBots.size > 0) {
                        const botTags = unwhitelistedBots.map(b => `<@${b.id}>`).slice(0, 5).join(', ');
                        warningText += `\n\n${emojis.warn} **Security Notice**: Detected ${unwhitelistedBots.size} un-whitelisted bot(s) holding permissions: ${botTags}${unwhitelistedBots.size > 5 ? ' and more' : ''}.\n> Run \`antinuke whitelist @bot\` if trusted, or their dangerous actions will trigger instant dual-action bans.`;
                    }
                } catch {}

                await new Promise(resolve => setTimeout(resolve, 900))

                // Final Frame: Complete!
                setupEmbed.setDescription(
                    `${emojis.tick} **Protection Setup Complete!**\n\n` +
                    `__**${emojis.antinuke} Protection Details**__\n` +
                    `> ${emojis.arrow} **Role:** <@&${protectRole.id}>\n` +
                    `> ${emojis.arrow} **Default Action:** \`${newConfig.punishment.toUpperCase()}\`\n\n` +
                    `__**${emojis.gear} Active Protection Events**__\n` +
                    renderEventsList(newConfig.disabledEvents) +
                    warningText +
                    `\n\n-# **Note:- Move my "Roynix Protect" role to the top of all roles for the best performance**`
                )
                setupEmbed.setThumbnail(guild.iconURL({ size: 1024 }))
                setupEmbed.setColor(client.color)
                await msg.edit({ embeds: [setupEmbed] }).catch(() => null)
                break;
            }

            case 'disable': {
                if (action) {
                    if (!antinukeData?.enabled) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server.**`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const targetModule = findModule(args.slice(1).join(' '));
                    if (!targetModule) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.cross} **Invalid module name.** Use \`!antinuke modules\` to see all available modules.`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const disabled = antinukeData.disabledEvents || [];
                    if (disabled.includes(targetModule.key)) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **${targetModule.name} is already disabled.** ${emojis.disabled}`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const newDisabled = [...disabled, targetModule.key];
                    await antinukeDB.set(`antinukeData_${guild.id}.disabledEvents`, newDisabled);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **${targetModule.name}** has been disabled. ${emojis.disabled}`)
                                .setColor(client.color)
                        ]
                    });
                }

                if (!antinukeData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                .setDescription(`${emojis.warn} **Antinuke system is already disabled in this server.**\n\n`
                                    + `__**Current Status**__\n`
                                    + `${emojis.arrow} **State:** ${antinukeData?.enabled ? `\`Enabled\` ${emojis.tick}` : `\`Disabled\` ${emojis.cross}`}\n`
                                    + `${emojis.arrow} **Use \`antinuke enable\` to activate protection**\n\n`
                                    + `${emojis.info} **Note:** All protections will remain inactive until enabled`)
                                .setThumbnail(guild.iconURL({ size: 1024 }))
                                .setColor(client.color)
                        ]
                    })
                }

                const disableEmbed = new EmbedBuilder()
                    .setAuthor({ name: 'Roynix Antinuke Setup', iconURL: client.user.avatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.antinuke} **Initializing full protection shutdown...**\n`
                        + `> ${emojis.loading} Checking required permissions`
                    )
                    .setColor(client.color)
                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                    .setThumbnail(guild.iconURL({ size: 1024 }))

                const msg = await message.reply({ embeds: [disableEmbed] })

                const me = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null)
                if (!me || !me.permissions.has(PermissionFlagsBits.Administrator)) {
                    disableEmbed.setDescription(`${emojis.cross} **Disable failed**\n`
                        + `> Missing required permission: \`Administrator\`\n\n`
                        + `${emojis.info} The bot requires administrator permissions to remove protection systems.`
                    )
                    return msg.edit({ embeds: [disableEmbed] }).catch(() => null)
                }

                await new Promise(resolve => setTimeout(resolve, 800))

                // Frame 2: Permission check passed & Removing protection role
                disableEmbed.setDescription(`${emojis.antinuke} **Initializing full protection shutdown...**\n`
                    + `> ${emojis.tick} Permission check passed\n`
                    + `> ${emojis.loading} Disabling all protection modules & removing role`
                )
                await msg.edit({ embeds: [disableEmbed] }).catch(() => null)

                let roleDeleted = false
                if (antinukeData.protectRole) {
                    try {
                        const role = await guild.roles.fetch(antinukeData.protectRole)
                        if (role) {
                            await role.delete('Antinuke system disabled').catch(() => null)
                            roleDeleted = true
                        }
                    } catch (error) {
                    }
                }

                await client.deleteAntinukeData(guild.id)

                await new Promise(resolve => setTimeout(resolve, 900))

                // Final Frame: Complete System Shutdown!
                disableEmbed.setDescription(
                    `${emojis.tick} **Complete System Shutdown!**\n\n`
                    + `__**${emojis.warn} All Protection Removed**__\n`
                    + `> ${emojis.arrow} **Status:** \`Disabled\` ${emojis.cross}\n`
                    + `> ${emojis.arrow} **Role:** ${roleDeleted ? '`Deleted`' : '`Not found`'}\n\n`
                    + `-# Use \`antinuke enable\` to set up a new protection system.`
                )
                disableEmbed.setColor(client.color)
                await msg.edit({ embeds: [disableEmbed] }).catch(() => null)
                break
            }
            case 'owner':
            case 'eo':
            case 'extraowner': {
                const member = message.mentions.members.first() || message.guild.members.fetch(args[2])
                const extraOwners = antinukeData?.extraOwners || []

                if (message.author.id !== guild.ownerId && !isBotOwner(message.author.id)) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Only server owner can use this command**`)
                                .setColor(client.color)
                        ]
                    })
                }

                if (!action) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                .setDescription(
                                    `**Extra Owner Management**\n\n` +
                                    `- \`antinuke extraowner add <member>\`\n└  Adds a extraowner\n\n` +
                                    `- \`antinuke extraowner remove <member>\`\n└  Removes a extraowner\n\n` +
                                    `- \`antinuke extraowner show\`\n└  Shows the extraowners list\n\n` +
                                    `- \`antinuke extraowner reset\`\n└  Resets the extraowner list\n\n`
                                )
                                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                                .setColor(client.color)
                        ]
                    })
                }

                switch (action) {
                    case 'add': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!member) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        if (extraOwners.includes(member.user.id)) {
                            return message.channel.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor(client.color)
                                        .setDescription(`${emojis.warn} **This user is already an extra owner.**`)
                                ]
                            });
                        }

                        extraOwners?.push(member.user.id);

                        await antinukeDB.set(`antinukeData_${guild.id}.extraOwners`, extraOwners).then(() => {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setColor(client.color)
                                        .setDescription(`${emojis.tick} ${member} **has been added to Extra Owners.**`)
                                ]
                            })
                        })

                        return
                    }
                    case 'show': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (extraOwners.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setColor(client.color)
                                        .setDescription(`${emojis.warn} **No Extra Owners have been set.**`)
                                ]
                            });
                        }

                        const itemsPerPage = 5;
                        let page = 0;
                        const totalPages = Math.ceil(extraOwners.length / itemsPerPage);

                        const generateEmbed = (pageNum) => {
                            const start = pageNum * itemsPerPage;
                            const end = start + itemsPerPage;
                            const pageItems = extraOwners.slice(start, end);

                            const embed = new EmbedBuilder()
                                .setTitle("Extra Owners List")
                                .setColor(client.color)
                                .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                                .setThumbnail(message.guild.iconURL({ size: 1024 }));
                            let description = ``
                            pageItems.forEach((id) => {
                                const owner = client.users.cache.get(id);
                                description += `${owner} (\`${id}\`)\n`
                            });
                            embed.setDescription(description)
                            return embed;
                        };

                        await paginate(message, extraOwners, itemsPerPage, generateEmbed);

                        return;
                    }

                    case 'remove': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!member) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        if (!extraOwners.includes(member.user.id)) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} ${member} **is not in the Extra Owners.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        const extraOwners2 = extraOwners.filter(id => id !== member.user.id);
                        await antinukeDB.set(`antinukeData_${guild.id}.extraOwners`, extraOwners2).then(() => {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.tick} **Successfully remove ${member} from Extra Owners**`)
                                        .setColor(client.color)
                                ]
                            })
                        })

                        return;
                    }

                    case 'reset': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        await antinukeDB.set(`antinukeData_${guild.id}.extraOwners`, [])
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()

                                    .setDescription(`${emojis.warn} **Successfully reseted all extra owners for this guild.**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `**Extra Owner Management**\n\n` +
                                        `- \`antinuke extraowner add <member>\`\n└  Adds a extraowner\n\n` +
                                        `- \`antinuke extraowner remove <member>\`\n└  Removes a extraowner\n\n` +
                                        `- \`antinuke extraowner show\`\n└  Shows the extraowners list\n\n` +
                                        `- \`antinuke extraowner reset\`\n└  Resets the extraowner list\n\n`
                                    )
                                    .setColor(client.color)
                            ]
                        })
                    }
                }
            }
            case 'wl':
            case 'whitelist': {
                const member = message.mentions.members.first() || message.guild.members.fetch(args[2])


                if (!action) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                .setDescription(
                                    `**Whitelist Management**\n\n` +
                                    `- \`antinuke whitelist add <member>\`\n└  Adds a whitelist user\n\n` +
                                    `- \`antinuke whitelist remove <member>\`\n└  Removes a whitelist user\n\n` +
                                    `- \`antinuke whitelist show\`\n└  Shows the whitelist users list\n\n` +
                                    `- \`antinuke whitelist reset\`\n└  Resets the whitelist\n\n`
                                )
                                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                                .setColor(client.color)
                        ]
                    })
                }

                const fields = [
                    { name: 'Anti Bot', key: 'antiBot' },
                    { name: 'Anti Ban', key: 'antiBan' },
                    { name: 'Anti Kick', key: 'antiKick' },
                    { name: 'Anti Channel Create', key: 'antiChannelCreate' },
                    { name: 'Anti Channel Delete', key: 'antiChannelDelete' },
                    { name: 'Anti Channel Update', key: 'antiChannelUpdate' },
                    { name: 'Anti Sticker Create', key: 'antiStickerCreate' },
                    { name: 'Anti Sticker Delete', key: 'antiStickerDelete' },
                    { name: 'Anti Sticker Update', key: 'antiStickerUpdate' },
                    { name: 'Anti Guild Update', key: 'antiGuildUpdate' },
                    { name: 'Anti Role Create', key: 'antiRoleCreate' },
                    { name: 'Anti Role Delete', key: 'antiRoleDelete' },
                    { name: 'Anti Role Update', key: 'antiRoleUpdate' },
                    { name: 'Anti Unban', key: 'antiUnban' },
                    { name: 'Anti Webhook Update', key: 'antiWebhookUpdate' },
                    { name: 'Anti Member Update', key: 'antiMemberUpdate' },
                    { name: 'Anti Emoji Update', key: 'antiEmojiUpdate' },
                    { name: 'Anti Emoji Create', key: 'antiEmojiCreate' },
                    { name: 'Anti Emoji Delete', key: 'antiEmojiDelete' },
                    { name: 'Anti Prune', key: 'antiPrune' },
                    { name: 'Anti Ping', key: 'antiPing' },
                ];

                switch (action) {
                    case 'add': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!member) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        let whitelist = antinukeData?.whitelisted || {}

                        if (whitelist[member.user.id]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor(client.color)
                                        .setDescription(`${emojis.warn} **This user is already whitelisted.**`)
                                ]
                            });
                        }



                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId(`whitelist_select_${member.user.id}`)
                            .setPlaceholder('Select events to whitelist')
                            .setMinValues(1)
                            .setMaxValues(fields.length)
                            .addOptions(fields.map(field => ({ label: field.name, value: field.key })));

                        const whitelistAllButton = new ButtonBuilder()
                            .setCustomId(`whitelist_all_${member.user.id}`)
                            .setLabel('Whitelist All Events')
                            .setEmoji(emojis.gear)
                            .setStyle(ButtonStyle.Secondary);

                        const actionRow = new ActionRowBuilder().addComponents(selectMenu);
                        const buttonRow = new ActionRowBuilder().addComponents(whitelistAllButton);


                        const embed = new EmbedBuilder()
                            .setColor(client.color)
                            .setAuthor({ name: 'Whitelist User for Antinuke Events', iconURL: member.user.avatarURL({ size: 1024 }) })
                            .setDescription(`Select the events to whitelist using the dropdown below or use the button to whitelist all.`)
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

                        const sentMessage = await message.reply({ embeds: [embed], components: [actionRow, buttonRow] });

                        const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

                        collector.on('collect', async (i) => {
                            if (i.user.id !== message.author.id) {
                                return i.reply({ content: 'You cannot interact with this.', flags: MessageFlags.Ephemeral });
                            }

                            if (i.customId === `whitelist_select_${member.user.id}`) {
                                await i.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setDescription(`${emojis.loading} **Adding selected events to ${member}**`)
                                            .setColor(client.color)
                                    ],
                                    flags: MessageFlags.Ephemeral
                                });

                                await client.antinukeDB.set(`antinukeData_${guild.id}.whitelisted.${member.user.id}`, {
                                    events: i.values,
                                    executorId: message.author.id,
                                    timestamp: Date.now()
                                });

                                const selectedLabels = fields
                                    .filter(field => i.values.includes(field.key))
                                    .map(field => `${emojis.enabled} **${field.name}**`)
                                    .join("\n");

                                await i.editReply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setDescription(`${emojis.tick} **${member} has been whitelisted for selected events**`)
                                            .setColor(client.color)
                                    ]
                                });

                                await sentMessage.edit({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setColor(client.color)
                                            .setAuthor({ name: member.user.username, iconURL: member.user.avatarURL({ size: 1024 }) })
                                            .setDescription(`${emojis.tick} **${member} has been whitelisted for selected events**\n\n${emojis.user} **Target:** ${member}\n${emojis.executor} **Executor: ${message.member}**\n\n__**Events**__\n${selectedLabels}`)
                                            .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                                    ],
                                    components: []
                                });

                                collector.stop();
                            }

                            else if (i.customId === `whitelist_all_${member.user.id}`) {
                                await i.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setDescription(`${emojis.loading} **Whitelisting ${member} for all events...**`)
                                            .setColor(client.color)
                                    ],
                                    flags: MessageFlags.Ephemeral
                                });

                                const allKeys = fields.map(field => field.key);
                                const allLabels = fields.map(field => `${emojis.enabled} **${field.name}**`).join("\n");

                                await client.antinukeDB.set(`antinukeData_${guild.id}.whitelisted.${member.user.id}`, {
                                    events: allKeys,
                                    executorId: message.author.id,
                                    timestamp: Date.now()
                                });

                                await i.editReply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setDescription(`${emojis.tick} **${member} has been whitelisted for all events**`)
                                            .setColor(client.color)
                                    ]
                                });

                                await sentMessage.edit({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setColor(client.color)
                                            .setAuthor({ name: member.user.username, iconURL: member.user.avatarURL({ size: 1024 }) })
                                            .setDescription(`${emojis.tick} **${member} has been whitelisted for all events**\n\n${emojis.user} **Target:** ${member}\n${emojis.executor} **Executor: ${message.member}**\n\n__**Events**__\n${allLabels}`)
                                            .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                                    ],
                                    components: []
                                });

                                collector.stop();
                            }
                        });


                        return;
                    }

                    case 'remove': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!args[2]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        if (!member) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()

                                        .setDescription(`${emojis.warn} **Please mention a valid Member or provide a valid Member ID.**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        let whitelist = antinukeData?.whitelisted || {}

                        if (!whitelist[member.user.id]) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **This user is not whitelisted**`)
                                        .setColor(client.color)
                                ]
                            })
                        }

                        await antinukeDB.delete(`antinukeData_${guild.id}.whitelisted.${member.user.id}`)

                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Removed ${member} from antinuke whitelist**`)
                                    .setColor(client.color)
                            ]
                        })
                        break;
                    }

                    case 'show': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        const whitelistData = await client.antinukeDB.get(`antinukeData_${guild.id}.whitelisted`) || {};
                        const whitelistedUsers = Object.entries(whitelistData);


                        if (whitelistedUsers.length === 0) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No users are currently whitelisted.**`)
                                        .setColor(client.color)
                                ]
                            });
                        }

                        const itemsPerPage = 5;
                        const totalPages = Math.ceil(whitelistedUsers.length / itemsPerPage);

                        const generateEmbed = (pageNum) => {
                            const start = pageNum * itemsPerPage;
                            const end = start + itemsPerPage;
                            const pageItems = whitelistedUsers.slice(start, end);

                            const embed = new EmbedBuilder()
                                .setTitle("Whitelisted Users")
                                .setColor(client.color)
                                .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                                .setThumbnail(message.guild.iconURL({ size: 1024 }));

                            let description = "";
                            pageItems.forEach(([userId, data]) => {
                                const executor = data?.executorId ? `<@${data.executorId}>` : "Unknown";
                                const timestamp = data?.timestamp ? `<t:${Math.floor(data.timestamp / 1000)}:R>` : "Unknown";
                                description += `<@${userId}> — **Executor:** ${executor} | ${timestamp}\n`;
                            });

                            embed.setDescription(description || "No users found.");
                            return embed;
                        };


                        await paginate(message, whitelistedUsers, itemsPerPage, generateEmbed);
                        return;
                    }

                    case 'reset': {
                        if (!antinukeData?.enabled) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                        .setColor(client.color)
                                ]
                            })
                        }
                        await antinukeDB.set(`antinukeData_${guild.id}.whitelisted`, {})
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Successfully reseted all whitelisted users for this guild.**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    default: {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(
                                        `**Whitelist Management**\n\n` +
                                        `- \`antinuke whitelist add <member>\`\n└  Adds a whitelist user\n\n` +
                                        `- \`antinuke whitelist remove <member>\`\n└  Removes a whitelist user\n\n` +
                                        `- \`antinuke whitelist show\`\n└  Shows the whitelist users list\n\n` +
                                        `- \`antinuke whitelist reset\`\n└  Resets the whitelist\n\n`
                                    )
                                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                                    .setColor(client.color)
                            ]
                        })
                    }
                }
                break;
            }

            case 'logging': {
                if (!antinukeData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                .setColor(client.color)
                        ]
                    })
                }
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a channel mention or ID**`)
                                .setColor(client.color)
                        ]
                    })
                }
                const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]) || await message.guild.channels.fetch(args[1]).catch(() => null)

                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a valid channel mention or ID**`)
                                .setColor(client.color)
                        ]
                    })
                }

                await antinukeDB.set(`antinukeData_${guild.id}.logsChannel`, channel.id)

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Antinuke Logging Channel is set to ${channel}**`)
                            .setColor(client.color)
                    ]
                })
            }

            case 'config': {
                if (!antinukeData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                .setColor(client.color)
                        ]
                    })
                }

                const whitelistData = antinukeData?.whitelisted || {}
                const whitelistedCount = Object.entries(whitelistData)?.length || 0
                const extraOwnerCount = antinukeData?.extraOwners?.length || 0

                const embed = new EmbedBuilder()
                    .setDescription(
                        `__**${emojis.antinuke} Protection Details**__\n` +
                        `> ${emojis.arrow} **Role:** <@&${antinukeData.protectRole}>\n` +
                        `> ${emojis.arrow} **Default Action:** \`${antinukeData.punishment?.toUpperCase()}\`\n` +
                        `> ${emojis.arrow} **Logging Channel:** ${antinukeData?.logsChannel ? `<#${antinukeData.logsChannel}>` : '`Not Set`'}\n` +
                        `> ${emojis.arrow} **Whitelist Users:** \`${whitelistedCount}\`\n` +
                        `> ${emojis.arrow} **ExtraOwners Count:** \`${extraOwnerCount}\`\n\n` +
                        `__**${emojis.gear} Active Protection Events**__\n` +
                        renderEventsList(antinukeData?.disabledEvents || []) +
                        `\n\n-# **Note:- Move my "Roynix Protect" role to the top of all roles for the best performance**`
                    ).setColor(client.color)
                    .setAuthor({ name: 'Roynix Antinuke System', iconURL: client.user.avatarURL({ size: 1024 }) })
                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setThumbnail(message.guild.iconURL({ size: 1024 }))

                await message.reply({ embeds: [embed] })
                break
            }

            case 'toggle':
            case 'module':
            case 'modules':
            case 'events': {
                if (!antinukeData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Antinuke is not enabled in this server.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const query = args.slice(1).join(' ').trim();
                if (query) {
                    const targetModule = findModule(query);
                    if (!targetModule) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.cross} **Invalid module name: \`${query}\`**\n\nUse \`!antinuke modules\` without arguments to see the interactive module menu.`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const disabled = antinukeData.disabledEvents || [];
                    const isCurrentlyDisabled = disabled.includes(targetModule.key);
                    const newDisabled = isCurrentlyDisabled
                        ? disabled.filter(k => k !== targetModule.key)
                        : [...disabled, targetModule.key];

                    await antinukeDB.set(`antinukeData_${guild.id}.disabledEvents`, newDisabled);

                    const nowEnabled = isCurrentlyDisabled;
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **${targetModule.name}** has been **${nowEnabled ? 'enabled' : 'disabled'}** ${nowEnabled ? emojis.enabled : emojis.disabled}`)
                                .setColor(client.color)
                        ]
                    });
                }

                const buildMenu = (currentDisabled) => {
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: 'Roynix Antinuke Protection Modules', iconURL: client.user.avatarURL({ size: 1024 }) })
                        .setDescription(
                            `Select a protection module from the dropdown below to toggle it **ON** or **OFF**.\n\n` +
                            `__**${emojis.gear} Current Module Status**__\n` +
                            renderEventsList(currentDisabled)
                        )
                        .setColor(client.color)
                        .setThumbnail(guild.iconURL({ size: 1024 }))
                        .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('antinuke_module_toggle_menu')
                        .setPlaceholder('Select a module to toggle...')
                        .addOptions(
                            antinukeModules.map(mod => {
                                const isEnabled = !currentDisabled.includes(mod.key);
                                return {
                                    label: mod.name,
                                    value: mod.key,
                                    description: (isEnabled ? '[ENABLED] ' : '[DISABLED] ') + mod.description.slice(0, 80),
                                    emoji: isEnabled ? '🟢' : '⚪'
                                };
                            })
                        );

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    return { embed, row };
                };

                let currentDisabled = antinukeData.disabledEvents || [];
                const initial = buildMenu(currentDisabled);
                const replyMsg = await message.reply({
                    embeds: [initial.embed],
                    components: [initial.row]
                });

                const collector = replyMsg.createMessageComponentCollector({
                    filter: i => i.user.id === message.author.id,
                    time: 120000
                });

                collector.on('collect', async i => {
                    const selectedKey = i.values[0];
                    const targetMod = antinukeModules.find(m => m.key === selectedKey);
                    if (!targetMod) return i.deferUpdate();

                    const freshData = await antinukeDB.get(`antinukeData_${guild.id}`) || {};
                    const disabledList = freshData.disabledEvents || [];
                    const isOff = disabledList.includes(selectedKey);
                    const updatedDisabled = isOff
                        ? disabledList.filter(k => k !== selectedKey)
                        : [...disabledList, selectedKey];

                    await antinukeDB.set(`antinukeData_${guild.id}.disabledEvents`, updatedDisabled);
                    currentDisabled = updatedDisabled;

                    const updated = buildMenu(currentDisabled);
                    await i.update({
                        embeds: [updated.embed],
                        components: [updated.row]
                    });
                });

                collector.on('end', async () => {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        StringSelectMenuBuilder.from(initial.row.components[0]).setDisabled(true)
                    );
                    await replyMsg.edit({ components: [disabledRow] }).catch(() => null);
                });

                break;
            }

            case 'punishment': {
                if (!antinukeData?.enabled) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                .setColor(client.color)
                        ]
                    })
                }

                if (!action) {
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: 'Roynix Antinuke Punishment', iconURL: client.user.avatarURL({ size: 1024 }) })
                        .setDescription(
                            `- \`antinuke punishment set\`\n└  Sets the punishment of antinuke system\n\n` +
                            `- \`antinuke punishment show\`\n└  Show the current punishment of antinuke system`
                        )
                        .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                        .setThumbnail(client.user.avatarURL({ size: 1024 }))
                        .setColor(client.color)
                    return message.reply({ embeds: [embed] })
                }

                switch (action) {
                    case 'set': {
                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId('select_action')
                            .setPlaceholder('Select action')
                            .setMinValues(1)
                            .setMaxValues(1)
                            .addOptions(
                                { label: 'Kick', emoji: emojis.rmv, value: 'kick' },
                                { label: 'Ban', emoji: emojis.ban, value: 'ban' }
                            );

                        const row = new ActionRowBuilder().addComponents(selectMenu);

                        const embed = new EmbedBuilder()
                            .setColor(client.color)
                            .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setTitle('Antinuke Action Configuration')
                            .setDescription(`${emojis.antinuke} **Choose the action that should be enforced when a security event is detected.**\n\n-# **Note:- Move my "Roynix Protect" role to the top of all roles for the best performance**`)
                            .setThumbnail(message.guild.iconURL({ size: 1024 }))



                        const sentMessage = await message.reply({ embeds: [embed], components: [row] });


                        const collector = sentMessage.createMessageComponentCollector({ time: 60000 });
                        let selectedAction;
                        collector.on('collect', async (interaction) => {
                            if (!interaction.isStringSelectMenu()) return;
                            if (interaction.user.id !== message.author.id) {
                                return i.reply({ content: 'You cannot interact with this.', flags: MessageFlags.Ephemeral });
                            }

                            const { customId, values, guild } = interaction;

                            if (customId === 'select_action') {
                                selectedAction = values[0];

                                try {
                                    await sentMessage.edit({
                                        embeds: [
                                            new EmbedBuilder()
                                                .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                                .setDescription(`${emojis.loading} **Configuring the antinuke punishment**`)
                                                .setColor(client.color)
                                        ],
                                        flags: MessageFlags.Ephemeral,
                                        components: []
                                    })

                                    await client.antinukeDB.set(`antinukeData_${guild.id}.punishment`, selectedAction);

                                    await interaction.update({
                                        embeds: [
                                            new EmbedBuilder()
                                                .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                                .setColor(client.color)
                                                .setDescription(`${emojis.tick} Antinuke action has been set to **${selectedAction}**`)
                                        ],
                                        components: [],
                                        flags: MessageFlags.Ephemeral
                                    });

                                    collector.stop();
                                } catch (error) {
                                    console.error('Failed to set antinuke action:', error);
                                    await interaction.followUp({
                                        content: `${emojis.cross} **An error occurred while setting the antinuke action.**`,
                                        flags: MessageFlags.Ephemeral
                                    });
                                }
                            }
                        });


                        collector.on('end', async () => {
                            if (!selectedAction) {
                                await sentMessage.edit({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setColor(client.color)
                                            .setDescription(`${emojis.warn} **Antinuke action setup timed out.**`)
                                    ], components: []
                                });
                            }
                        });
                        return
                    }

                    case 'show': {
                        const action = antinukeData?.punishment

                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                    .setDescription(`${emojis.antinuke} **Antinuke System punishment is currently set to ${action === 'kick' ? `\`Kick\` ${emojis.rmv}` : `\`Ban\` ${emojis.ban}`}**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    default: {
                        const embed = new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Antinuke Punishment', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`antinuke punishment set\`\n└  Sets the punishment of antinuke system\n\n` +
                                `- \`antinuke punishment show\`\n└  Show the current punishment of antinuke system`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                        return message.reply({ embeds: [embed] })
                    }
                }
            }

            default:
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`antinuke enable\`\n└  Enable the antinuke system\n\n` +
                                `- \`antinuke disable\`\n└  Disable the antinuke system\n\n` +
                                `- \`antinuke whitelist\`\n└  Manage whitelisted users\n\n` +
                                `- \`antinuke extraowner\`\n└  Manage extraOwners\n\n` +
                                `- \`antinuke punishment\`\n└  Sets the punishment of antinuke\n\n` +
                                `- \`antinuke logging\`\n└  Manage antinuke logs\n\n` +
                                `- \`antinuke config\`\n└  View current antinuke settings`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                })
        }
    }
}