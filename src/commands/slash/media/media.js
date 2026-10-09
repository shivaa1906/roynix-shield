import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { paginate } from '../../../utils/pagination.js'

export const data = {
    data: new SlashCommandBuilder()
        .setName('media')
        .setDescription('Configure media-only restriction system')
        .addSubcommandGroup(group =>
            group
                .setName('channel')
                .setDescription('Configure media-only channels')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Add a media-only channel')
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('Channel to restrict to media-only')
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Remove media-only restriction from channel')
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('Channel to remove from media-only')
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('List all media-only channels')
                )
                .addSubcommand(sub =>
                    sub
                        .setName('reset')
                        .setDescription('Reset all media-only channels')
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('bypass')
                .setDescription('Configure media restriction bypass')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Add user to media bypass')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('User who can bypass media restrictions')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Remove user from media bypass')
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
                        .setDescription('List all media bypass users')
                )
                .addSubcommand(sub =>
                    sub
                        .setName('reset')
                        .setDescription('Reset all media bypass users')
                )
        ),
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const mediaDB = client.mediaDB
        const mediaData = await mediaDB.get(`media_${interaction.guild.id}`) || {}
        const subcommandGroup = interaction.options.getSubcommandGroup()
        const subcommand = interaction.options.getSubcommand()

        switch (subcommandGroup) {
            case 'channel': {
                switch (subcommand) {
                    case 'add': {
                        const channel = interaction.options.getChannel('channel')
                        const channels = mediaData?.channels || []

                        if (channels.includes(channel.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is already media-restricted**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        channels.push(channel.id)
                        await mediaDB.set(`media_${interaction.guild.id}.channels`, channels)

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **${channel} added to media-only channels**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'remove': {
                        const channel = interaction.options.getChannel('channel')
                        const channels = mediaData?.channels || []

                        if (!channels.includes(channel.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **Channel is not media-restricted**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        channels.splice(channels.indexOf(channel.id), 1)
                        await mediaDB.set(`media_${interaction.guild.id}.channels`, channels)

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **${channel} removed from media-only channels**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const channels = mediaData?.channels || []

                        if (!channels.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No media-only channels configured**`)
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
                                .setTitle('Media-Only Channels')
                                .setDescription(current.map(c => `<#${c}>`).join('\n') || 'No channels')
                                .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
                                .setColor(client.color)
                        }

                        await paginate(interaction, channels, itemsPerPage, generateEmbed)
                        break
                    }

                    case 'reset': {
                        if (!mediaData?.channels?.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No media-only channels to reset**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        await mediaDB.set(`media_${interaction.guild.id}.channels`, [])
                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Media-only channels reset successfully**`)
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
                        const bypass = mediaData?.bypass || []

                        if (bypass.includes(user.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **${user} already bypasses media restrictions**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        bypass.push(user.id)
                        await mediaDB.set(`media_${interaction.guild.id}.bypass`, bypass)

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **${user} added to media bypass list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'remove': {
                        const user = interaction.options.getUser('user')
                        const bypass = mediaData?.bypass || []

                        if (!bypass.includes(user.id)) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **${user} is not in media bypass list**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        bypass.splice(bypass.indexOf(user.id), 1)
                        await mediaDB.set(`media_${interaction.guild.id}.bypass`, bypass)

                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **${user} removed from media bypass list**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    case 'list': {
                        const bypass = mediaData?.bypass || []

                        if (!bypass.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No users in media bypass list**`)
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
                                .setTitle('Media Bypass Users')
                                .setDescription(current.map(u => `<@${u}>`).join('\n') || 'No users')
                                .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
                                .setColor(client.color)
                        }

                        await paginate(interaction, bypass, itemsPerPage, generateEmbed)
                        break
                    }

                    case 'reset': {
                        if (!mediaData?.bypass?.length) {
                            return interaction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **No users in media bypass list**`)
                                        .setColor(client.color)
                                ],
                            })
                        }

                        await mediaDB.set(`media_${interaction.guild.id}.bypass`, [])
                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Media bypass list reset successfully**`)
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