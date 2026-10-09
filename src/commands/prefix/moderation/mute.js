import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js'
import emojis from '../../../config/emojis.js'

export const data = {
    name: 'mute',
    description: 'Mute a user in the server.',
    userPerms: ['MuteMembers'],
    botPerms: ['MuteMembers'],
    args: [
        {
            name: 'user',
            description: 'The user to mute.',
            required: true,
        },
        {
            name: 'duration',
            description: 'The duration to mute the user for. eg. 1h, 30m, 1d',
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for muting the user.',
            required: false
        }
    ],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const user = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.guild.members.fetch(args[0]).catch(() => null)
        const duration = args[1]
        const reason = args.slice(2).join(" ") || "None"
        const guild = message.guild

        if (!user?.user?.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || Please provide a valid user to mute.**`)
                ]
            })
        }

        if (user.id === message.author.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || You cannot mute yourself.**`)
                ]
            })
        }

        if (user.isCommunicationDisabled()) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || This user is already muted.**`)
                ]
            });
        }

        if (user.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || You cannot mute an administrator.**`)
                ]
            })
        }

        if (user.roles.highest.position >= message.member.roles.highest.position && !client.isBotOwner(message.author.id) && message.member.id !== message.guild.ownerId) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || You cannot mute a member if their highest role is equal to or higher than yours.**`)
                ]
            })
        }

        if (user.id === message.guild.ownerId) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || You cannot mute the server owner.**`)
                ]
            })
        }

        if (!user.manageable || user.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || I cannot mute this member.**`)
                ]
            })
        }

        const durationMap = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        }

        const durationRegex = /(\d+)([smhd])/g
        const durationMatch = duration.match(durationRegex)

        if (!durationMatch) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || Please provide a valid duration. eg. 10m, 1h, 1d**`)
                ]
            })
        }

        const durationMs = durationMatch.reduce((acc, match) => {
            const [_, value, unit] = match.match(/(\d+)([smhd])/)
            return acc + (parseInt(value) * durationMap[unit])
        }, 0)


        if (durationMs > 2419200000) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || Please provide a duration less than 28 days.**`)
                ]
            })
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
            )

        const disbaledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
                    .setDisabled(true)
            )


        user.user.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setTitle(`You have been muted in ${message.guild.name}`)
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${message.author.tag}\n` +
                        `${emojis.reason} **Reason:** ${reason}\n` +
                        `${emojis.time} **Duration:** ${duration}`
                    )
                    .setThumbnail(guild.iconURL({ size: 1024 }))
                    .setFooter({ text: `You can contact a moderator if you believe this is a mistake.` })
            ]
        }).catch(() => { })

        await user.timeout(durationMs, `${reason} | Mod: ${message.author.username} (${message.author.id})`)

        const msg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Muted`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${message.author}\n` +
                        `${emojis.user} **Target:** ${user}\n` +
                        `${emojis.expire} **Duration:** ${duration}\n` +
                        `${emojis.reason} **Reason:** ${reason}`)
                    .setThumbnail(user.displayAvatarURL({ size: 1024 }))
                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
            ],
            components: [row]
        });



        const collector = msg.createMessageComponentCollector({ time: 180000 })


        collector.on('collect', async (i) => {
            if (!i.isButton()) return;
            if (i.user.id !== message.author.id) return await i.reply({ content: 'Only command author can use this button.', flags: MessageFlags.Ephemeral })
            if (i.customId === 'delete') {
                await msg.delete().catch(() => { })
                collector.stop()
            }
        })

        collector.on('end', async () => {
            await msg.edit({ components: [disbaledRow] })
        })

    }
}