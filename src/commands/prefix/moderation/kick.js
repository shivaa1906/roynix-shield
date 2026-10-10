import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import {isBotOwner } from '../../../utils/isBotOwner.js';

export const data = {
    name: 'kick',
    description: 'Kicks a member.',
    userPerms: ['KickMembers'],
    botPerms: ['KickMembers'],
    category: 'moderation',
    args: [
        {
            name: 'target',
            description: 'A member mention or ID',
            required: true
        }, 
        {
            name: 'reason',
            description: 'Reason for kicking the member',
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
        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || await message.guild.members.fetch(args[0]).catch(() => null)
        const reason = args.slice(1).join(" ") || "None";
        const guild = message.guild

        if (!member) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **|| Member Not Found**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: client.user.displayAvatarURL({ size: 1024 }) })
                        .setColor(client.color)
                ]
            })
        }

        if (member.id === message.author.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || You can't kick yourself.**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: client.user.displayAvatarURL({ size: 1024 }) })
                        .setColor(client.color)
                ]
            })
        }

        if (member.id === message.guild.ownerId) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || You can't kick server owner.**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: client.user.displayAvatarURL({ size: 1024 }) })
                        .setColor(client.color)
                ]
            })
        }

        if (message.member.id !== guild.ownerId && member.roles.highest.position >= message.member.roles.highest.position && !isBotOwner(message.author.id)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: client.user.displayAvatarURL({ size: 1024 }) })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || You cannot kick a member if their highest role is equal to or higher than yours.**`)
                ]
            })
        }

        if (!member.kickable || member.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: client.user.displayAvatarURL({ size: 1024 }) })
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} ** || I don’t have permission to kick them, likely because their highest role is equal to or higher than mine.**`)
                ]
            })
        }

        await member.user.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setTitle(`You have been kicked from ${guild.name}`)
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${message.author.tag}\n` +
                        `${emojis.reason} **Reason:** ${reason}`
                    )
                    .setThumbnail(guild.iconURL({ size: 1024 }))
                    .setFooter({ text: `You can contact a moderator if you believe this is a mistake.` })
            ]
        }).catch(() => {});

        await member.kick(`${reason} | Mod: ${message.author.username} (${message.author.id})`)
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
                    .setAuthor({ name: `Successfully Kicked`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${message.author}\n` +
                        `${emojis.rmv} **Target:** ${member}\n` +
                        `${emojis.reason} **Reason:** ${reason}`)
                    .setThumbnail(member.displayAvatarURL({ size: 1024 }))
                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
            ],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 })


        collector.on('collect', async (i) => {
            if (!i.isButton()) return;
            if(i.user.id !== message.author.id) return await i.reply({ content: 'Only command author can use this button.'})
            if (i.customId === 'delete') {
                await msg.delete().catch(() => {})
                collector.stop()
            }
        })

        collector.on('end', async () => {
            await msg.edit({ components: [disbaledRow]})
        })


    }
}