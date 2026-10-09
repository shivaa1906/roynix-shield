import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { error } from '../../../utils/logger.js'

export const data = {
    name: 'voice',
    aliases: ['vc'],
    userPerms: ['Administrator'],
    botPerms: ["MuteMembers", "DefeanMembers", "MoveMembers"],
    subCommandCount: 9,
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const subcommand = args[0]

        switch (subcommand) {
            case 'kick': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a channel to use this command**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n` +
                                    `\`\`\`vc kick <target>\`\`\`\n` +
                                    `**Arguments**\n` +
                                    `\`target\` - A member mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const member = message.mentions.members.first()
                    || message.guild.members.cache.get(args[1])
                    || await message.guild.members.fetch(args[1]).catch(() => null);
            
                if (!member) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Member Not Found**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
            
                const targetVoiceChannel = member.voice?.channel;
            
                if (!targetVoiceChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (targetVoiceChannel.id !== channel.id) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in the same voice channel as you.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                try {
                    await member.voice.disconnect();
                    const msg = await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                                .setAuthor({ name: "Kicked Member From VC", iconURL: member.user.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                    `${emojis.user} **Target:** ${member}\n` +
                                    `${emojis.action} **Action:** Voice Kicked`
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
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await msg.delete().catch(() => { });
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        msg.edit({ components: [disabledRow] }).catch(() => { });
                    });
            
                } catch (er) {
                    error(er);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while kicking the member from VC.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                break;
            }

            case 'kickall': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const members = channel.members
                if (!members.size) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **There are no other members in the voice channel to kick.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                members.forEach(async member => {
                    try {
                        await member.voice.disconnect();
                    } catch (e) {
                    }
                });
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
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
                            .setAuthor({ name: "Kicked All Members From VC", iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                            .setDescription(
                                `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                `${emojis.channel} **Target Channel:** ${channel.name}\n` +
                                `${emojis.user} **Action** All Members Kicked`
                            )
                            .setThumbnail(message.guild.iconURL({ size: 1024 }))
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
                        return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                    }
                    await msg.delete().catch(() => { });
                    collector.stop();
                });
            
                collector.on('end', () => {
                    msg.edit({ components: [disabledRow] }).catch(() => { });
                });
            
                break;
            }
            
            
            case 'mute': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n\`\`\`vc mute <target>\`\`\`\n` +
                                    `**Arguments**\n\`target\` - A member mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const member = message.mentions.members.first()
                    || message.guild.members.cache.get(args[1])
                    || await message.guild.members.fetch(args[1]).catch(() => null);
            
                if (!member) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Member not found.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
            
                const targetVoiceChannel = member.voice?.channel;
                if (!targetVoiceChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (targetVoiceChannel.id !== channel.id) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in the same voice channel as you.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                try {
                    await member.voice.setMute(true)
            
                    const msg = await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                                .setAuthor({ name: "Muted Member In VC", iconURL: member.user.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                    `${emojis.user} **Target:** ${member}\n` +
                                    `${emojis.action} **Action:** Voice Muted`
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
                        if (i.customId !== 'delete') return;
                        if (i.user.id !== message.author.id) {
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await msg.delete().catch(() => { });
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        msg.edit({ components: [disabledRow] }).catch(() => { });
                    });
            
                } catch (er) {
                    error(er);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while muting the member.**`)
                                .setColor(client.color)
                        ]
                    });
                }
                break;
            }

            case 'muteall': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const membersInChannel = channel.members.filter(m => m.id !== message.author.id)
            
                if (membersInChannel.size === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No members found in the channel to mute.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                const loadingEmbed = new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Muting all members in the voice channel...**`)
                    .setColor(client.color);
            
                const loadingMessage = await message.reply({ embeds: [loadingEmbed] });
            
                try {
                    for (const member of membersInChannel.values()) {
                        await member.voice.setMute(true).catch(() => {}); 
                    }
            
                    const successEmbed = new EmbedBuilder()
                        .setColor(client.color)
                        .setThumbnail(channel.guild.iconURL({ size: 1024 }))
                        .setAuthor({ name: "Muted All Members In VC", iconURL: channel.guild.iconURL({ size: 1024 }) })
                        .setDescription(
                            `${emojis.moderator} **Moderator:** ${message.author}\n` +
                            `${emojis.channel} **Target Channel:** ${channel.name}\n` +
                            `${emojis.action} **Action:** All Members Muted`
                        )
                        .setFooter({
                            text: `Executed by ${message.author.username}`,
                            iconURL: message.author.displayAvatarURL({ size: 1024 })
                        });
            
                    await loadingMessage.edit({ embeds: [successEmbed], components: [row] });
            
                } catch {
                    return loadingMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while muting the members.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                break;
            }

            case 'unmuteall': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const membersInChannel = channel.members.filter(m => m.id !== message.author.id)
            
                if (membersInChannel.size === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No members found in the channel to mute.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                const loadingEmbed = new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Unmuting all members in the voice channel...**`)
                    .setColor(client.color);
            
                const loadingMessage = await message.reply({ embeds: [loadingEmbed] });
            
                try {
                    for (const member of membersInChannel.values()) {
                        await member.voice.setMute(false).catch(() => {}); 
                    }
            
                    const successEmbed = new EmbedBuilder()
                        .setColor(client.color)
                        .setThumbnail(channel.guild.iconURL({ size: 1024 }))
                        .setAuthor({ name: "Unmuted All Members In VC", iconURL: channel.guild.iconURL({ size: 1024 }) })
                        .setDescription(
                            `${emojis.moderator} **Moderator:** ${message.author}\n` +
                            `${emojis.channel} **Target Channel:** ${channel.name}\n` +
                            `${emojis.action} **Action:** All Members Unmuted`
                        )
                        .setFooter({
                            text: `Executed by ${message.author.username}`,
                            iconURL: message.author.displayAvatarURL({ size: 1024 })
                        });
            
                    await loadingMessage.edit({ embeds: [successEmbed], components: [row] });
            
                } catch {
                    return loadingMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while unmuting the members.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                break;
            }

            case 'deafenall': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const membersInChannel = channel.members
            
                if (membersInChannel.size === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No members found in the channel to deafen.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                const loadingEmbed = new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Deafening all members in the voice channel...**`)
                    .setColor(client.color);
            
                const loadingMessage = await message.reply({ embeds: [loadingEmbed] });
            
                try {
                    for (const member of membersInChannel.values()) {
                        await member.voice.setDeaf(true).catch(() => {});
                    }
            
                    const successEmbed = new EmbedBuilder()
                        .setColor(client.color)
                        .setThumbnail(channel.guild.iconURL({ size: 1024 }))
                        .setAuthor({ name: "Deafened All Members In VC", iconURL: channel.guild.iconURL({ size: 1024 }) })
                        .setDescription(
                            `${emojis.moderator} **Moderator:** ${message.author}\n` +
                            `${emojis.channel} **Target Channel:** ${channel.name}\n` +
                            `${emojis.action} **Action:** All Members Deafened`
                        )
                        .setFooter({
                            text: `Executed by ${message.author.username}`,
                            iconURL: message.author.displayAvatarURL({ size: 1024 })
                        });
            
                    await loadingMessage.edit({ embeds: [successEmbed], components: [row] });
                } catch {
                    return loadingMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while deafening the members.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                break;
            }

            case 'undeafenall': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const membersInChannel = channel.members
            
                if (membersInChannel.size === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No members found in the channel to undeafen.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                const loadingEmbed = new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Undeafening all members in the voice channel...**`)
                    .setColor(client.color);
            
                const loadingMessage = await message.reply({ embeds: [loadingEmbed] });
            
                try {
                    for (const member of membersInChannel.values()) {
                        await member.voice.setDeaf(false).catch(() => {});
                    }
            
                    const successEmbed = new EmbedBuilder()
                        .setColor(client.color)
                        .setThumbnail(channel.guild.iconURL({ size: 1024 }))
                        .setAuthor({ name: "Undeafened All Members In VC", iconURL: channel.guild.iconURL({ size: 1024 }) })
                        .setDescription(
                            `${emojis.moderator} **Moderator:** ${message.author}\n` +
                            `${emojis.channel} **Target Channel:** ${channel.name}\n` +
                            `${emojis.action} **Action:** All Members Undeafened`
                        )
                        .setFooter({
                            text: `Executed by ${message.author.username}`,
                            iconURL: message.author.displayAvatarURL({ size: 1024 })
                        });
            
                    await loadingMessage.edit({ embeds: [successEmbed], components: [row] });
                } catch {
                    return loadingMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while undeafening the members.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                break;
            }
            
            

            case 'unmute': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n\`\`\`vc unmute <target>\`\`\`\n` +
                                    `**Arguments**\n\`target\` - A member mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const member = message.mentions.members.first()
                    || message.guild.members.cache.get(args[1])
                    || await message.guild.members.fetch(args[1]).catch(() => null);
            
                if (!member) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Member not found.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
            
                const targetVoiceChannel = member.voice?.channel;
                if (!targetVoiceChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (targetVoiceChannel.id !== channel.id) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in the same voice channel as you.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                try {
                    await member.voice.setMute(false)
            
                    const msg = await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                                .setAuthor({ name: "Unmuted Member In VC", iconURL: member.user.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                    `${emojis.user} **Target:** ${member}\n` +
                                    `${emojis.action} **Action:** Voice Unmuted`
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
                        if (i.customId !== 'delete') return;
                        if (i.user.id !== message.author.id) {
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await msg.delete().catch(() => { });
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        msg.edit({ components: [disabledRow] }).catch(() => { });
                    });
            
                } catch (er) {
                    error(er);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while unmuting the member.**`)
                                .setColor(client.color)
                        ]
                    });
                }
                break;
            }

            case 'move': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1] || !args[2]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n\`\`\`vc move <user> <channel>\`\`\`\n` +
                                    `**Arguments:**\n\`user\` - A member mention or ID <required>\n\`channel\` - Target voice channel mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const member = message.mentions.members.first()
                    || message.guild.members.cache.get(args[1])
                    || await message.guild.members.fetch(args[1]).catch(() => null);
            
                if (!member) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Member not found.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const targetChannel = message.guild.channels.cache.get(args[2])
                    || message.mentions.channels.first()
                    || await message.guild.channels.fetch(args[2]).catch(() => null);
            
                if (!targetChannel || targetChannel.type !== 2) { 
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Target channel not found or is not a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                try {
                    await member.voice.setChannel(targetChannel);
            
                    const msg = await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                                .setAuthor({ name: "Moved Member to Another VC", iconURL: member.user.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                    `${emojis.user} **Target:** ${member}\n` +
                                    `${emojis.channel} **New Channel:** ${targetChannel.name}\n` +
                                    `${emojis.action} **Action:** Voice Moved`
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
                        if (i.customId !== 'delete') return;
                        if (i.user.id !== message.author.id) {
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await msg.delete().catch(() => { });
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        msg.edit({ components: [disabledRow] }).catch(() => { });
                    });
            
                } catch (er) {
                    console.error(er);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while moving the member.**`)
                                .setColor(client.color)
                        ]
                    });
                }
                break;
            }

            case 'moveall': {
                const currentChannel = message.member.voice?.channel;
                if (!currentChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n\`\`\`vc moveall <channel>\`\`\`\n` +
                                    `**Arguments:**\n\`channel\` - Target voice channel mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const targetChannel = message.guild.channels.cache.get(args[1])
                    || message.mentions.channels.first()
                    || await message.guild.channels.fetch(args[1]).catch(() => null);
            
                if (!targetChannel || targetChannel.type !== 2) { 
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Target channel not found or is not a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const membersInChannel = currentChannel.members
            
                if (membersInChannel.size === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No members found in the channel to move.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                const loadingEmbed = new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Moving all members to the target voice channel...**`)
                    .setColor(client.color);
            
                const loadingMessage = await message.reply({ embeds: [loadingEmbed] });
            
                try {
                    for (const member of membersInChannel.values()) {
                        await member.voice.setChannel(targetChannel).catch(() => {});
                    }
            
                    const successEmbed = new EmbedBuilder()
                        .setColor(client.color)
                        .setThumbnail(targetChannel.guild.iconURL({ size: 1024 }))
                        .setAuthor({ name: "Moved All Members To Another VC", iconURL: targetChannel.guild.iconURL({ size: 1024 }) })
                        .setDescription(
                            `${emojis.moderator} **Moderator:** ${message.author}\n` +
                            `${emojis.channel} **Source Channel:** ${currentChannel.name}\n` +
                            `${emojis.channel} **Target Channel:** ${targetChannel.name}\n` +
                            `${emojis.action} **Action:** All Members Moved`
                        )
                        .setFooter({
                            text: `Executed by ${message.author.username}`,
                            iconURL: message.author.displayAvatarURL({ size: 1024 })
                        });
            
                    await loadingMessage.edit({ embeds: [successEmbed], components: [row] });
            
                    const collector = loadingMessage.createMessageComponentCollector({ time: 180000 });
                    collector.on('collect', async (i) => {
                        if (i.customId !== 'delete') return;
                        if (i.user.id !== message.author.id) {
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await loadingMessage.delete().catch(() => {});
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        loadingMessage.edit({ components: [disabledRow] }).catch(() => {});
                    });
            
                } catch (er) {
                    console.error(er);
                    return loadingMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while moving the members.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                break;
            }

            case 'pull': {
                const executorChannel = message.member.voice?.channel;
                if (!executorChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n\`\`\`vc pull <user>\`\`\`\n` +
                                    `**Arguments:**\n\`user\` - A member mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const member = message.mentions.members.first()
                    || message.guild.members.cache.get(args[1])
                    || await message.guild.members.fetch(args[1]).catch(() => null);
            
                if (!member) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Member not found.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const targetVoiceChannel = member.voice?.channel;
                if (!targetVoiceChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                try {
                    await member.voice.setChannel(executorChannel);
            
                    const msg = await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                                .setAuthor({ name: "Pulled Member To Your VC", iconURL: member.user.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                    `${emojis.user} **Target:** ${member}\n` +
                                    `${emojis.channel} **New Channel:** ${executorChannel.name}\n` +
                                    `${emojis.action} **Action:** Pulled to Your Channel`
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
                        if (i.customId !== 'delete') return;
                        if (i.user.id !== message.author.id) {
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await msg.delete().catch(() => {});
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        msg.edit({ components: [disabledRow] }).catch(() => {});
                    });
            
                } catch (er) {
                    console.error(er);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while pulling the member.**`)
                                .setColor(client.color)
                        ]
                    });
                }
                break;
            }
            
            
            

            case 'deafen': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n\`\`\`vc deafen <target>\`\`\`\n` +
                                    `**Arguments**\n\`target\` - A member mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const member = message.mentions.members.first()
                    || message.guild.members.cache.get(args[1])
                    || await message.guild.members.fetch(args[1]).catch(() => null);
            
                if (!member) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Member not found.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
            
                const targetVoiceChannel = member.voice?.channel;
                if (!targetVoiceChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (targetVoiceChannel.id !== channel.id) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in the same voice channel as you.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                try {
                    await member.voice.setDeaf(true)
            
                    const msg = await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                                .setAuthor({ name: "Deafened Member In VC", iconURL: member.user.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                    `${emojis.user} **Target:** ${member}\n` +
                                    `${emojis.action} **Action:** Voice Deafend`
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
                        if (i.customId !== 'delete') return;
                        if (i.user.id !== message.author.id) {
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await msg.delete().catch(() => { });
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        msg.edit({ components: [disabledRow] }).catch(() => { });
                    });
            
                } catch (er) {
                    error(er);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while defening the member.**`)
                                .setColor(client.color)
                        ]
                    });
                }
                break;
            }

            case 'undeafen': {
                const channel = message.member.voice?.channel;
                if (!channel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You need to be in a voice channel to use this command.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.warn}: **Missing Required Argument**\n\n` +
                                    `**Usage:**\n\`\`\`vc undeafen <target>\`\`\`\n` +
                                    `**Arguments**\n\`target\` - A member mention or ID <required>\n\n` +
                                    `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``
                                )
                                .setColor(client.color)
                        ]
                    });
                }
            
                const member = message.mentions.members.first()
                    || message.guild.members.cache.get(args[1])
                    || await message.guild.members.fetch(args[1]).catch(() => null);
            
                if (!member) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Member not found.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
            
                const targetVoiceChannel = member.voice?.channel;
                if (!targetVoiceChannel) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in a voice channel.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (targetVoiceChannel.id !== channel.id) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **The member is not in the same voice channel as you.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                );
            
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.delete)
                        .setDisabled(true)
                );
            
                try {
                    await member.voice.setDeaf(false)
            
                    const msg = await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                                .setAuthor({ name: "Undeafened Member In VC", iconURL: member.user.displayAvatarURL({ size: 1024 }) })
                                .setDescription(
                                    `${emojis.moderator} **Moderator:** ${message.author}\n` +
                                    `${emojis.user} **Target:** ${member}\n` +
                                    `${emojis.action} **Action:** Voice Undeafened`
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
                        if (i.customId !== 'delete') return;
                        if (i.user.id !== message.author.id) {
                            return i.reply({ content: 'Only the command author can use this button.', flags: MessageFlags.Ephemeral });
                        }
                        await msg.delete().catch(() => { });
                        collector.stop();
                    });
            
                    collector.on('end', () => {
                        msg.edit({ components: [disabledRow] }).catch(() => { });
                    });
            
                } catch (er) {
                    error(er);
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while undefening the member.**`)
                                .setColor(client.color)
                        ]
                    });
                }
                break;
            }
            
            default:
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix VC Commands', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`vc kick <user>\`\n└ Kick a user from the voice channel\n\n` +
                                `- \`vc kickall\`\n└ Kick all users from the voice channel\n\n` +
                                `- \`vc mute <user>\`\n└ Mute a user in the voice channel\n\n` +
                                `- \`vc muteall\`\n└ Mute all users in the voice channel\n\n` +
                                `- \`vc deafen <user>\`\n└ Deafen a user in the voice channel\n\n` +
                                `- \`vc deafenall\`\n└ Deafen all users in the voice channel\n\n` +
                                `- \`vc move <user> <channel>\`\n└ Move a user to a specific voice channel\n\n` +
                                `- \`vc moveall <channel>\`\n└ Move all users to a specific voice channel\n\n` +
                                `- \`vc pull <user>\`\n└ Pull a user to your voice channel`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                });
                
        }
    }
}
