import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import emojis from '../../../config/emojis.js'

export const data = {
    name: 'nick',
    description: 'Set a nickname in the server for a user',
    userPerms: ['ManageNicknames'],
    botPerms: ['ManageNicknames'],
    args: [
        {
            name: 'user',
            description: 'The user to set the nickname for',
            required: true,
        },
        {
            name: 'nickname',
            description: 'The nickname to set',
            required: false,
        }
    ],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || await message.guild.members.fetch(args[0]).catch(() => null)
        const nickname = args.slice(1).join(' ') || null

        if (!member) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || Please provide a valid user to set the nickname for**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                ]
            })
        }

        if (member.id === message.author.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || You cannot set your own nickname**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                ]
            })
        }

        if (member.id === message.guild.members.me.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || I cannot set my nickname**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                ]
            })
        }

        if (member.id === message.guild.ownerId) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || You cannot set the nickname of the server owner**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                ]
            })
        }

        if (member.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You cannot set the nickname of a user with a higher or equal role**`)
                        .setColor(client.color)
                ]
            })
        }

        if (member.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || I cannot set the nickname of a user with a higher or equal role**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                ]
            })
        }

        if (!member.manageable) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || I cannot set the nickname of this user**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                ]
            })
        }
        if (nickname && nickname.length > 32) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || The nickname must be less than 32 characters**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: 'https://images-ext-1.discordapp.net/external/SSYjRXNg_57h3KEDfhatBnYjmZAoNjhpoi50DDpS2VU/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1324050005467730091/21e8412082ea668bd2d5b49e2619fb64.png?format=webp&quality=lossless&width=939&height=939' })
                        .setColor(client.color)
                ]
            })
        }

        await member.setNickname(nickname).catch(() => null)

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

        const msg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Nicked`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${message.author}\n` +
                        `${emojis.user} **Target:** ${member}\n` +
                        `${emojis.reason} **Nickname:** ${nickname || "Reset to default"}`)
                    .setThumbnail(member.displayAvatarURL({ size: 1024 }))
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
