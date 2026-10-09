import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'unhide',
    description: 'reveals a channel for everyone',
    userPerms: ['ManageChannels', 'ManageRoles'],
    botPerms: ['ManageChannels', 'ManageRoles'],
    args: [
        {
            name: 'channel',
            description: 'The channel to reveal',
            required: false
        },
        {
            name: 'reason',
            description: 'Reason for revealing the channel',
            required: false
        }
    ],
    async execute(message, args, client) {
        const channel = message.mentions.channels.first() || 
                       (args[0] ? message.guild.channels.cache.get(args[0]) : null) || 
                       (args[0] ? await message.guild.channels.fetch(args[0]).catch(() => null) : null) || 
                       message.channel;

        if (!channel || !channel.permissionsFor) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Channel not found or invalid.**`)
                        .setColor(client.color)
                ]
            });
        }

        const reason = args.slice(0).join(" ") || "No reason provided";
        const target = message.guild.roles.everyone;
        const currentPerms = channel.permissionsFor(target);
        
        if (!currentPerms) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Cannot check permissions for @everyone.**`)
                        .setColor(client.color)
                ]
            });
        }

        if (currentPerms.has(PermissionsBitField.Flags.ViewChannel) === true) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **This channel is already revealed for @everyone**`)
                ]
            });
        }

        const botPerms = channel.permissionsFor(message.guild.members.me);
        if (!botPerms?.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **I don't have permission to manage this channel.**`)
                        .setColor(client.color)
                ]
            });
        }

        const unHideResult = await channel.permissionOverwrites.edit(target, {
            ViewChannel: true
        }).then(() => true).catch(() => true);

        if (!unHideResult) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.cross} **Failed to reveal the channel.**`)
                        .setColor(client.color)
                ]
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
            );

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
                    .setDisabled(true)
            );

        const msg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setThumbnail(message.guild.iconURL({ size: 1024 }))
                    .setAuthor({ name: "Channel Revealed", iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${message.author}\n` +
                        `${emojis.channel} **Channel:** ${channel}\n` +
                        `${emojis.reason} **Reason:** ${reason}`
                    )
                    .setFooter({ 
                        text: `Executed by ${message.author.username}`, 
                        iconURL: message.author.displayAvatarURL({ size: 1024 }) 
                    })
            ],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 });
        collector.on('collect', async (i) => {
            if (!i.isButton() || i.customId !== 'delete') return;
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'Only command author can use this button.', ephemeral: true });
            }
            await msg.delete().catch(() => {});
            collector.stop();
        });

        collector.on('end', () => {
            msg.edit({ components: [disabledRow] }).catch(() => {});
        });
    }
}