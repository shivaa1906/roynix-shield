import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { paginate } from '../../../utils/pagination.js'

export const data = {
    data: new SlashCommandBuilder()
        .setName('ignore')
        .setDescription('Configure ignore system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommandGroup(group =>
            group
                .setName('channel')
                .setDescription('Configure ignore channels')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Add a channel to ignore list')
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('Channel to ignore')
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a channel from ignore list')
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('Channel to remove from ignore list')
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('List all ignored channels')
                )
                .addSubcommand(sub =>
                    sub
                        .setName('reset')
                        .setDescription('Reset all ignored channels')
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('bypass')
                .setDescription('Configure bypass users')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Add a user to bypass list')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('User to add to bypass list')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a user from bypass list')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('User to remove from bypass list')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('List all bypassed users')
                )
                .addSubcommand(sub =>
                    sub
                        .setName('reset')
                        .setDescription('Reset all bypassed users')
                )
        ),
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const ignoreDB = client.ignoreDB
        const ignoreData = await ignoreDB.get(`ignore_${interaction.guild.id}`) || {}
        const subcommandGroup = interaction.options.getSubcommandGroup()
        const subcommand = interaction.options.getSubcommand()

        switch (subcommandGroup) {
            case 'channel': {
                switch (subcommand) {
                    case 'add': {
                        const channel = interaction.options.getChannel('channel')
                        const channels = ignoreData?.channels || []

                        if (channels.includes(channel.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is already ignored**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        channels.push(channel.id)
                        await ignoreDB.set(`ignore_${interaction.guild.id}.channels`,channels)

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Channel added to ignore list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'remove': {
                        const channel = interaction.options.getChannel('channel')
                        const channels = ignoreData?.channels || []

                        if (!channels.includes(channel.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is not ignored**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        channels.splice(channels.indexOf(channel.id), 1)
                        await ignoreDB.set(`ignore_${interaction.guild.id}.channels`,channels)

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Channel removed from ignore list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const channels = ignoreData?.channels || []

                        if (!channels.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No channels are ignored**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        const itemsPerPage = 5
                        const totalPages = Math.ceil(channels.length / itemsPerPage)

                        const generateEmbed = (page) => {
                            const start = page * itemsPerPage
                            const end = start + itemsPerPage
                            const current = channels.slice(start, end)

                            return new EmbedBuilder()
                                .setTitle('Ignored Channels')
                                .setDescription(current.map(c => `<#${c}>`).join('\n') || 'No channels')
                                .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
                                .setColor(client.color)
                        }

                        await paginate(interaction, channels, itemsPerPage, generateEmbed)
                        break
                    }

                    case 'reset': {
                        if (!ignoreData?.channels?.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No channels are ignored**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        await ignoreDB.set(`ignore_${interaction.guild.id}.channels`, [])
                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Ignored channels reset successfully**`)
                                    .setColor(client.color)
                            ]
                        })
                    }
                }
                break
            }

            case 'bypass': {
                switch (subcommand) {
                    case 'add': {
                        const user = interaction.options.getUser('user')
                        const bypass = ignoreData?.bypass || []

                        if (bypass.includes(user.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **User is already bypassed**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        bypass.push(user.id)
                        await ignoreDB.set(`ignore_${interaction.guild.id}.bypass`, bypass )

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **User added to bypass list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'remove': {
                        const user = interaction.options.getUser('user')
                        const bypass = ignoreData?.bypass || []

                        if (!bypass.includes(user.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **User is not bypassed**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        bypass.splice(bypass.indexOf(user.id), 1)
                        await ignoreDB.set(`ignore_${interaction.guild.id}.bypass`, bypass )

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **User removed from bypass list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const bypass = ignoreData?.bypass || []

                        if (!bypass.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No users are bypassed**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        const itemsPerPage = 5
                        const totalPages = Math.ceil(bypass.length / itemsPerPage)

                        const generateEmbed = (page) => {
                            const start = page * itemsPerPage
                            const end = start + itemsPerPage
                            const current = bypass.slice(start, end)

                            return new EmbedBuilder()
                                .setTitle('Bypassed Users')
                                .setDescription(current.map(u => `<@${u}>`).join('\n') || 'No users')
                                .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
                                .setColor(client.color)
                        }

                        await paginate(interaction, bypass, itemsPerPage, generateEmbed)
                        break
                    }

                    case 'reset': {
                        if (!ignoreData?.bypass?.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No users are bypassed**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        await ignoreDB.set(`ignore_${interaction.guild.id}.bypass`, [])
                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Bypassed users reset successfully**`)
                                    .setColor(client.color)
                            ]
                        })
                    }
                }
                break
            }
        }
    }
}