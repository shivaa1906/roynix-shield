import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'hideall',
    description: 'hides all text channels in the server',
    userPerms: ['ManageChannels', 'ManageRoles'],
    botPerms: ['ManageChannels', 'ManageRoles'],
    async execute(message, args, client) {
        const guild = message.guild;
        const reason = args.join(" ") || "No reason provided";
        const target = guild.roles.everyone;

        const textChannels = message.guild.channels.cache.filter(c =>
            c.isTextBased() && c.permissionsFor(message.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)
        );

        if (textChannels.size === 0) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} ** || There are no text channels to hide.**`)
                        .setTimestamp()
                 	    .setFooter({ text: 'Thanks for using Roynix', iconURL: client.user.displayAvatarURL({ size: 1024 }) })
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

        const loadingMsg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${emojis.loading} **hiding ${textChannels.size} channels...**`)
                    .setColor(client.color)
            ],
        });

        let hiddenCount = 0;

        for (const channel of textChannels.values()) {
            try {
                const currentPerms = channel.permissionsFor(target);
                if (currentPerms?.has(PermissionsBitField.Flags.ViewChannel) === false) continue;

                const botPerms = channel.permissionsFor(guild.members.me);
                if (!botPerms?.has(PermissionsBitField.Flags.ManageChannels)) continue;

                await channel.permissionOverwrites.edit(target, {
                    ViewChannel: false
                });
                hiddenCount++;
            } catch {
                continue;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        await loadingMsg.edit({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setThumbnail(guild.iconURL({ size: 1024 }))
                    .setAuthor({
                        name: "Channels Hidden",
                        iconURL: message.author.displayAvatarURL({ size: 1024 })
                    })
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${message.author}\n` +
                        `${emojis.channel} **Channels Hidden:** ${hiddenCount}\n` +
                        `${emojis.reason} **Reason:** ${reason}`
                    )
                    .setFooter({
                        text: `Executed by ${message.author.username}`,
                        iconURL: message.author.displayAvatarURL({ size: 1024 })
                    })
            ],
            components: [row]
        });

        const collector = loadingMsg.createMessageComponentCollector({ time: 180000 });
        collector.on('collect', async (i) => {
            if (!i.isButton() || i.customId !== 'delete') return;
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'Only command author can use this button.', flags: MessageFlags.Ephemeral });
            }
            await loadingMsg.delete().catch(() => { });
            collector.stop();
        });

        collector.on('end', () => {
            loadingMsg.edit({ components: [disabledRow] }).catch(() => { });
        });
    }
}