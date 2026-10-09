import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
export const data = {
    name: 'j2c',
    description: 'Configure the Join To Create System',
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    aliases: ['jtc'],
    subCommandCount: 3,
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const guild = message.guild;
        const j2cDB = client.j2cDB;
        const j2cData = await j2cDB.get(`j2cData_${guild.id}`) || {}
        const isSetuped = j2cData?.enabled || false;
        const subCommand = args[0];

        switch (subCommand) {
            case 'setup': {
                if (isSetuped) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Join To Create System is already setuped in this server**`)
                                .setColor(client.color)
                        ]
                    })
                }

                const loadingMsg = await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.loading} **Setting up Join To Create System**`)
                            .setColor(client.color)
                    ]
                })
                try {
                    const category = await guild.channels.create({
                        name: 'Voice Channels',
                        type: ChannelType.GuildCategory,
                    })

                    const channel = await guild.channels.create({
                        name: 'Join To Create',
                        type: ChannelType.GuildVoice,
                        parent: category.id,
                        userLimit: 1,
                    })

                    const controlChannel = await guild.channels.create({
                        name: 'j2c-control',
                        type: ChannelType.GuildText,
                        parent: category.id,
                    })

                    controlChannel.permissionOverwrites.edit(guild.roles.everyone, {
                        SendMessages: false,
                    })

                    const msg = await controlChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Join To Create Panel')
                                .setDescription(`${emojis.j2c} **Use the below buttons to control the join to create system**`)
                                .addFields({
                                    name: '__**Buttons**__',
                                    value: `${emojis.vc_lock} - Locks the voice channel\n${emojis.vc_unlock} - Unlocks the voice channel\n${emojis.vc_hide} - Hides the voice channel\n${emojis.vc_unhide} - Unhides the voice channel\n${emojis.vc_limit} - Sets user limit for the voice channel\n${emojis.vc_rename} - Renames the voice channel\n${emojis.vc_bitrate} - Changes bitrate of the voice channel\n${emojis.vc_region} - Changes region of the voice channel\n${emojis.vc_claim} - Claims ownership of the voice channel\n${emojis.vc_transfer} - Transfers ownership of the voice channel\n${emojis.vc_kick} - Kicks a user from the voice channel\n${emojis.vc_ban} - Bans a user from the voice channel\n${emojis.vc_unban} - Unbans a user from the voice channel`
                                }
                                )
                        ],
                        components: [
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('vc_lock')
                                        .setEmoji(emojis.vc_lock)
                                        .setStyle(ButtonStyle.Secondary),
                                    new ButtonBuilder()
                                       .setCustomId('vc_unlock')
                                       .setEmoji(emojis.vc_unlock)
                                       .setStyle(ButtonStyle.Secondary),
                                    new ButtonBuilder()
                                       .setCustomId('vc_hide')
                                       .setEmoji(emojis.vc_hide)
                                       .setStyle(ButtonStyle.Secondary),
                                    new ButtonBuilder()
                                      .setCustomId('vc_unhide')
                                      .setEmoji(emojis.vc_unhide)
                                      .setStyle(ButtonStyle.Secondary),
                                    new ButtonBuilder()
                                      .setCustomId('vc_limit')
                                      .setEmoji(emojis.vc_limit)
                                      .setStyle(ButtonStyle.Secondary),
                                ),
                            new ActionRowBuilder()
                               .addComponents(
                                new ButtonBuilder()
                                .setCustomId('vc_rename')
                                .setEmoji(emojis.vc_rename)
                                .setStyle(ButtonStyle.Secondary),
                               new ButtonBuilder()
                                .setCustomId('vc_bitrate')
                                .setEmoji(emojis.vc_bitrate)
                                .setStyle(ButtonStyle.Secondary),
                               new ButtonBuilder()
                                .setCustomId('vc_region')
                                .setEmoji(emojis.vc_region)
                                .setStyle(ButtonStyle.Secondary),
                               new ButtonBuilder()
                               .setCustomId('vc_claim')
                               .setEmoji(emojis.vc_claim)
                               .setStyle(ButtonStyle.Secondary),
                               new ButtonBuilder()
                               .setCustomId('vc_transfer')
                               .setEmoji(emojis.vc_transfer)
                               .setStyle(ButtonStyle.Secondary),
                               ),
                            new ActionRowBuilder()
                               .addComponents(
                                new ButtonBuilder()
                                .setCustomId('vc_kick')
                                .setEmoji(emojis.vc_kick)
                                .setStyle(ButtonStyle.Secondary),
                               new ButtonBuilder()
                               .setCustomId('vc_ban')
                               .setEmoji(emojis.vc_ban)
                               .setStyle(ButtonStyle.Secondary),
                               new ButtonBuilder()
                               .setCustomId('vc_unban')
                               .setEmoji(emojis.vc_unban)
                               .setStyle(ButtonStyle.Secondary),
                               )
                        ]
                    })

                    j2cDB.set(`j2cData_${guild.id}`, {
                        enabled: true,
                        category: category.id,
                        channel: channel.id,
                        controlChannel: controlChannel.id,
                        panelId: msg.id,
                    })

                    loadingMsg.edit({
                        embeds: [
                            new EmbedBuilder()
                               .setDescription(`${emojis.tick} **Join To Create System has been setuped successfully**\n- ${emojis.gear} **__Config__**\n   - **Category:** ${category.name}\n   - **Channel:** <#${channel.id}>\n   - **Control Channel:** <#${controlChannel.id}>`)
                               .setColor(client.color)
                        ]
                    })
                } catch (error) {
                    loadingMsg.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **An error occured while setuping the join to create system**`)
                                .setColor(client.color)
                        ]
                    })
                }
                break;
            }

            case 'reset': {
                if (!isSetuped) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                               .setDescription(`${emojis.warn} **Join To Create System is not setuped in this server**`)
                               .setColor(client.color)
                        ]
                    })
                }

                const loadingMsg = await message.reply({
                    embeds: [
                        new EmbedBuilder()
                           .setDescription(`${emojis.loading} **Resetting Join To Create System**`)
                           .setColor(client.color)
                    ]
                })

                const category = guild.channels.cache.get(j2cData.category) || await guild.channels.fetch(j2cData.category).catch(() => null );
                const channel = guild.channels.cache.get(j2cData.channel) || await guild.channels.fetch(j2cData.channel).catch(() => null );
                const controlChannel = guild.channels.cache.get(j2cData.controlChannel) || await guild.channels.fetch(j2cData.controlChannel).catch(() => null );

                category?.delete().catch(() => null );
                channel?.delete().catch(() => null );
                controlChannel?.delete().catch(() => null );

                j2cDB.delete(`j2cData_${guild.id}`)

                loadingMsg.edit({
                    embeds: [
                        new EmbedBuilder()
                           .setDescription(`${emojis.tick} **Join To Create System has been reseted successfully**`)
                           .setColor(client.color)
                    ]
                })
                break;
            }

            case 'config': {
                if (!isSetuped) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                              .setDescription(`${emojis.warn} **Join To Create System is not setuped in this server**`)
                              .setColor(client.color)
                        ]
                    })
                }

                const category = guild.channels.cache.get(j2cData.category) || await guild.channels.fetch(j2cData.category).catch(() => null );
                const channel = guild.channels.cache.get(j2cData.channel) || await guild.channels.fetch(j2cData.channel).catch(() => null );
                const controlChannel = guild.channels.cache.get(j2cData.controlChannel) || await guild.channels.fetch(j2cData.controlChannel).catch(() => null );

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                          .setDescription(`- ${emojis.gear} **__Config__**\n   - **Category:** ${category.name}\n   - **Channel:** <#${channel.id}>\n   - **Control Channel:** <#${controlChannel.id}>`)
                          .setColor(client.color)
                    ]
                })
            }

            default:
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Join To Create System', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`j2c setup\`\n└  Setup the join to create system\n\n` +
                                `- \`j2c reset\`\n└  Resets the join to create system\n\n` +
                                `- \`j2c config\`\n└  Shows the configuration of the join to create system`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                })
        }
    }
}