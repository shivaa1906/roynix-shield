import { ButtonStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags, SlashCommandBuilder, ChannelType } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('j2c')
        .setDescription('Join to Create voice channel system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup the Join to Create system')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset the Join to Create system')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('View current Join to Create configuration')
        ),
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const guild = interaction.guild;
        const j2cDB = client.j2cDB;
        const j2cData = await j2cDB.get(`j2cData_${guild.id}`) || {};
        const isSetuped = j2cData?.enabled || false;
        const subCommand = interaction.options.getSubcommand();

        switch (subCommand) {
            case 'setup': {
                if (isSetuped) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Join To Create system is already enabled**`)
                                .setColor(client.color)
                        ],
                        ephemeral: true
                    });
                }

                await interaction.deferReply();

                try {
                    const category = await guild.channels.create({
                        name: 'Voice Channels',
                        type: ChannelType.GuildCategory,
                    });

                    const channel = await guild.channels.create({
                        name: 'Join To Create',
                        type: ChannelType.GuildVoice,
                        parent: category.id,
                        userLimit: 1,
                    });

                    const controlChannel = await guild.channels.create({
                        name: 'j2c-control',
                        type: ChannelType.GuildText,
                        parent: category.id,
                    });

                    await controlChannel.permissionOverwrites.edit(guild.roles.everyone, {
                        SendMessages: false,
                    });

                    const controlRow1 = new ActionRowBuilder().addComponents(
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
                            .setStyle(ButtonStyle.Secondary)
                    );

                    const controlRow2 = new ActionRowBuilder().addComponents(
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
                            .setStyle(ButtonStyle.Secondary)
                    );

                    const controlRow3 = new ActionRowBuilder().addComponents(
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
                            .setStyle(ButtonStyle.Secondary)
                    );

                    const msg = await controlChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Join To Create Panel')
                                .setDescription(`${emojis.j2c} **Use the below buttons to control the join to create system**`)
                                .addFields({
                                    name: '__**Buttons**__',
                                    value: `${emojis.vc_lock} - Locks the voice channel\n${emojis.vc_unlock} - Unlocks the voice channel\n${emojis.vc_hide} - Hides the voice channel\n${emojis.vc_unhide} - Unhides the voice channel\n${emojis.vc_limit} - Sets user limit for the voice channel\n${emojis.vc_rename} - Renames the voice channel\n${emojis.vc_bitrate} - Changes bitrate of the voice channel\n${emojis.vc_region} - Changes region of the voice channel\n${emojis.vc_claim} - Claims ownership of the voice channel\n${emojis.vc_transfer} - Transfers ownership of the voice channel\n${emojis.vc_kick} - Kicks a user from the voice channel\n${emojis.vc_ban} - Bans a user from the voice channel\n${emojis.vc_unban} - Unbans a user from the voice channel`
                                })
                                .setColor(client.color)
                        ],
                        components: [controlRow1, controlRow2, controlRow3]
                    });

                    await j2cDB.set(`j2cData_${guild.id}`, {
                        enabled: true,
                        category: category.id,
                        channel: channel.id,
                        controlChannel: controlChannel.id,
                        panelId: msg.id
                    });

                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **Join To Create system has been setup successfully**\n\n${emojis.gear} **__Configuration__**\n${emojis.reply} **Category:** ${category.name}\n${emojis.reply} **Channel:** ${channel}\n${emojis.reply} **Control Panel:** ${controlChannel}`)
                                .setColor(client.color)
                        ]
                    });
                } catch (error) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while setting up the Join To Create system**`)
                                .setColor(client.color)
                        ]
                    });
                }
            }

            case 'reset': {
                if (!isSetuped) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Join To Create system is not setup yet**`)
                                .setColor(client.color)
                        ],
                        ephemeral: true
                    });
                }

                await interaction.deferReply();

                try {
                    const category = guild.channels.cache.get(j2cData.category);
                    const channel = guild.channels.cache.get(j2cData.channel);
                    const controlChannel = guild.channels.cache.get(j2cData.controlChannel);

                    if (category) await category.delete().catch(() => {});
                    if (channel) await channel.delete().catch(() => {});
                    if (controlChannel) await controlChannel.delete().catch(() => {});

                    await j2cDB.delete(`j2cData_${guild.id}`);

                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **Join To Create system has been reset successfully**`)
                                .setColor(client.color)
                        ]
                    });
                } catch (error) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **An error occurred while resetting the Join To Create system**`)
                                .setColor(client.color)
                        ]
                    });
                }
            }

            case 'config': {
                if (!isSetuped) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Join To Create system is not setup yet**`)
                                .setColor(client.color)
                        ],
                        ephemeral: true
                    });
                }

                const category = guild.channels.cache.get(j2cData.category);
                const channel = guild.channels.cache.get(j2cData.channel);
                const controlChannel = guild.channels.cache.get(j2cData.controlChannel);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Join To Create Configuration', iconURL: guild.iconURL({ size: 1024 }) })
                            .setDescription(`${emojis.gear} **__System Status__**\n${emojis.reply} **Enabled:** ${j2cData.enabled ? 'Yes' : 'No'}\n${emojis.reply} **Category:** ${category ? category.name : 'Not Found'}\n${emojis.reply} **Channel:** ${channel ? channel : 'Not Found'}\n${emojis.reply} **Control Panel:** ${controlChannel ? controlChannel : 'Not Found'}`)
                            .setColor(client.color)
                            .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
                    ]
                });
            }
        }
    }
};