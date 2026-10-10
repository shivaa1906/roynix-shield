import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Embed, EmbedBuilder, MessageFlags, PermissionFlagsBits, StringSelectMenuBuilder, ChannelType, User } from 'discord.js'
import emojis from '../../../config/emojis.js'
import { isBotOwner } from '../../../utils/isBotOwner.js'
import { paginate } from '../../../utils/pagination.js'
import { antinukeModules, findModule, renderEventsList } from '../../../utils/antinukeModules.js'
import { quarantineGuildBots } from '../../../antinuke/zeroTrustQuarantine.js'
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const data = {
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Manage antinuke settings')
        .addSubcommand(subcommand =>
            subcommand.setName('enable')
                .setDescription('Setups & Enable antinuke protection')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('disable')
                .setDescription('Disables & Resets antinuke protection')
        ).addSubcommandGroup(group =>
            group.setName('owner')
                .setDescription('Manage antinuke owner settings')
                .addSubcommand(subcommand =>
                    subcommand.setName('add')
                        .setDescription('Add a user to the antinuke owner list')
                        .addUserOption(option => option.setName('user').setDescription('The user to add').setRequired(true))
                ).addSubcommand(subcommand =>
                    subcommand.setName('remove')
                        .setDescription('Remove a user from the antinuke owner list')
                        .addUserOption(option => option.setName('user').setDescription('The user to remove').setRequired(true))
                ).addSubcommand(subcommand =>
                    subcommand.setName('show')
                        .setDescription('List all antinuke owners')
                ).addSubcommand(subcommand =>
                    subcommand.setName('reset')
                        .setDescription('Reset the antinuke owner list')
                )
        ).addSubcommandGroup(group =>
            group.setName('whitelist')
                .setDescription('Manage antinuke whitelist settings')
                .addSubcommand(subcommand =>
                    subcommand.setName('add')
                        .setDescription('Add a user to the antinuke whitelist')
                        .addUserOption(option => option.setName('user').setDescription('The user to add').setRequired(true))
                ).addSubcommand(subcommand =>
                    subcommand.setName('remove')
                        .setDescription('Remove a user from the antinuke whitelist')
                        .addUserOption(option => option.setName('user').setDescription('The user to remove').setRequired(true))
                ).addSubcommand(subcommand =>
                    subcommand.setName('show')
                        .setDescription('List all antinuke whitelisted users')
                ).addSubcommand(subcommand =>
                    subcommand.setName('reset')
                        .setDescription('Reset the antinuke whitelist')
                )
        ).addSubcommandGroup(group =>
            group.setName('punishment')
                .setDescription('Manage antinuke punishment settings')
                .addSubcommand(subcommand =>
                    subcommand.setName('set')
                        .setDescription('Set the punishment for antinuke actions')
                ).addSubcommand(subcommand =>
                    subcommand.setName('show')
                        .setDescription('Show the current punishment for antinuke actions')
                )
        ).addSubcommand(subcommand =>
            subcommand.setName('logging')
                .setDescription('Sets antinuke logging channel')
                .addChannelOption(option => option.setName('channel').setDescription('The channel to log antinuke actions').addChannelTypes(ChannelType.GuildText).setRequired(true))
        ).addSubcommand(subcommand =>
            subcommand.setName('config')
                .setDescription('View the current antinuke configuration')
        ).addSubcommand(subcommand =>
            subcommand.setName('toggle')
                .setDescription('Toggle a protection module ON or OFF')
                .addStringOption(option =>
                    option.setName('module')
                        .setDescription('The module to toggle (leave blank for interactive menu)')
                        .setRequired(false)
                        .addChoices(
                            ...antinukeModules.map(m => ({ name: m.name, value: m.key }))
                        )
                )
        ).addSubcommand(subcommand =>
            subcommand.setName('modules')
                .setDescription('Interactive protection modules manager')
        ),
    /**
     * 
     * @param {import('discord.js').CommandInteraction} interaction 
     * @param {import('../../../base/Roynix.js').Roynix} client 
     */
    async execute(interaction, client) {
        const guild = interaction.guild;
        const subcommand = interaction.options.getSubcommand();
        const subcommandGroup = interaction.options.getSubcommandGroup(false);
        /**@type {User} */
        const user = interaction.options.getUser('user');
        const channel = interaction.options.getChannel('channel');
        const antinukeDB = client.antinukeDB
        const antinukeData = await antinukeDB.get(`antinukeData_${guild.id}`) || {}

        if (!isBotOwner(interaction.user.id) && interaction.user.id !== guild.ownerId && !antinukeData?.extraOwners?.includes(interaction.user.id)) {
            return await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Only server owner & extra owners can use this command.**`)
                        .setColor(client.color)
                ]
            })
        }

        if (subcommand === 'enable') {
            await interaction.deferReply();
            if (antinukeData?.enabled) {
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(`${emojis.warn} **Antinuke system is already enabled in this server.**\n\n`
                                + `__**Current Status**__\n`
                                + `${emojis.arrow} **State:** \`Enabled\` ${emojis.tick}\n`
                                + `${emojis.arrow} **Use \`antinuke disable\` to turn off protection**\n\n`
                                + `${emojis.info} **Note:** For full functionality, ensure "Roynix Protect" role is at the top`)
                            .setThumbnail(guild.iconURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                });
            }

            const setupEmbed = new EmbedBuilder()
                .setAuthor({ name: 'Roynix Antinuke Setup', iconURL: client.user.avatarURL({ size: 1024 }) })
                .setDescription(`${emojis.antinuke} **Initializing protection setup...**\n`
                    + `> ${emojis.loading} Checking required permissions & preparing protection role`)
                .setColor(client.color)
                .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.avatarURL({ size: 1024 }) })
                .setThumbnail(guild.iconURL({ size: 1024 }));

            await interaction.editReply({ embeds: [setupEmbed] });

            const me = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
            if (!me || !me.permissions.has(PermissionFlagsBits.Administrator)) {
                setupEmbed.setDescription(`${emojis.cross} **Setup failed**\n`
                    + `> Missing required permission: \`Administrator\`\n\n`
                    + `${emojis.info} The bot requires administrator permissions to properly protect your server.`);
                return interaction.editReply({ embeds: [setupEmbed] });
            }

            let protectRole = (antinukeData?.protectRole && guild.roles.cache.get(antinukeData.protectRole))
                || guild.roles.cache.find(r => r.name === 'Roynix Protect' || r.name === 'Roynix Shield Protect');

            if (!protectRole) {
                try {
                    protectRole = await guild.roles.create({
                        name: 'Roynix Protect',
                        color: '#ef9a12',
                        reason: 'Server protection system',
                        permissions: []
                    });
                } catch (roleError) {
                    setupEmbed.setDescription(`${emojis.cross} **Setup failed**\n`
                        + `> Failed to create protection role: \`${roleError.message || 'Missing Permissions'}\`\n\n`
                        + `${emojis.info} Please ensure the bot has permission to manage roles and the server has not reached the role limit.`);
                    return interaction.editReply({ embeds: [setupEmbed] }).catch(() => null);
                }
            }

            const newConfig = {
                enabled: true,
                extraOwners: antinukeData?.extraOwners || [],
                whitelisted: antinukeData?.whitelisted || {},
                whitelistedRoles: antinukeData?.whitelistedRoles || {},
                protectRole: protectRole.id,
                logsChannel: antinukeData?.logsChannel || null,
                punishment: antinukeData?.punishment || 'ban',
                disabledEvents: antinukeData?.disabledEvents || []
            };
            await client.setAntinukeData(guild.id, newConfig);

            try {
                const highestBotRolePos = me.roles?.highest?.position ?? 0;
                if (highestBotRolePos > 1 && protectRole.position < highestBotRolePos - 1) {
                    await protectRole.setPosition(highestBotRolePos - 1).catch(() => null);
                }
            } catch (roleError) { }

            await delay(1200);

            // Intermediate Frame: Progress Animation
            setupEmbed.setDescription(`${emojis.antinuke} **Initializing protection setup...**\n`
                + `> ${emojis.tick} Permission check passed\n`
                + `> ${emojis.tick} Created protection role (<@&${protectRole.id}>)\n`
                + `> ${emojis.tick} System configuration saved\n`
                + `> ${emojis.loading} Finalizing security audit`);
            await interaction.editReply({ embeds: [setupEmbed] }).catch(() => null);

            // Security Audit: Check un-whitelisted bots for warning notice without proactively stripping roles
            let warningText = '';
            try {
                const unwhitelistedBots = guild.members.cache.filter(m =>
                    m.user.bot &&
                    m.id !== client.user.id &&
                    !isBotOwner(m.id) &&
                    !newConfig.whitelisted?.[m.id] &&
                    !newConfig.extraOwners?.includes(m.id) &&
                    (m.permissions.has(PermissionFlagsBits.Administrator) ||
                     m.permissions.has(PermissionFlagsBits.ManageChannels) ||
                     m.permissions.has(PermissionFlagsBits.ManageRoles) ||
                     m.permissions.has(PermissionFlagsBits.BanMembers) ||
                     m.permissions.has(PermissionFlagsBits.KickMembers))
                );

                if (unwhitelistedBots.size > 0) {
                    const botTags = unwhitelistedBots.map(b => `<@${b.id}>`).slice(0, 5).join(', ');
                    warningText += `\n\n${emojis.warn} **Security Notice**: Detected ${unwhitelistedBots.size} un-whitelisted bot(s) holding permissions: ${botTags}${unwhitelistedBots.size > 5 ? ' and more' : ''}.\n> Run \`/antinuke whitelist add @bot\` if trusted, or their dangerous actions will trigger instant dual-action bans.`;
                }
            } catch {}

            await delay(1500);

            // Final Frame: Complete with guaranteed retry so it never stays stuck
            setupEmbed.setDescription(
                `${emojis.tick} **Protection Setup Complete!**\n\n` +
                `__**${emojis.antinuke} Protection Details**__\n` +
                `> ${emojis.arrow} **Role:** <@&${protectRole.id}>\n` +
                `> ${emojis.arrow} **Default Action:** \`${newConfig.punishment.toUpperCase()}\`\n\n` +
                `__**${emojis.gear} Active Protection Events**__\n` +
                renderEventsList(newConfig.disabledEvents) +
                warningText +
                `\n\n-# **Note:- Move my "Roynix Protect" role to the top of all roles for the best performance**`
            );
            setupEmbed.setThumbnail(guild.iconURL({ size: 1024 }));
            setupEmbed.setColor(client.color);

            let finalEdited = false;
            for (let attempt = 0; attempt < 3 && !finalEdited; attempt++) {
                try {
                    await interaction.editReply({ embeds: [setupEmbed] });
                    finalEdited = true;
                } catch {
                    await delay(1200);
                }
            }
        }

        else if (subcommand === 'disable') {
            await interaction.deferReply();

            const antinukeData = await client.getAntinukeData(guild.id);

            if (!antinukeData?.enabled) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(`${emojis.warn} **Antinuke system is already disabled in this server.**\n\n`
                                + `__**Current Status**__\n`
                                + `${emojis.arrow} **State:** ${antinukeData?.enabled ? `\`Enabled\` ${emojis.tick}` : `\`Disabled\` ${emojis.cross}`}\n`
                                + `${emojis.arrow} **Use \`/antinuke enable\` to activate protection**\n\n`
                                + `${emojis.info} **Note:** All protections will remain inactive until enabled`)
                            .setThumbnail(guild.iconURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                });
            }

            const disableEmbed = new EmbedBuilder()
                .setAuthor({ name: 'Roynix Antinuke Setup', iconURL: client.user.avatarURL({ size: 1024 }) })
                .setDescription(`${emojis.antinuke} **Initializing full protection shutdown...**\n`
                    + `> ${emojis.loading} Checking required permissions`)
                .setColor(client.color)
                .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.avatarURL({ size: 1024 }) })
                .setThumbnail(guild.iconURL({ size: 1024 }));

            await interaction.editReply({ embeds: [disableEmbed] });

            const me = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
            if (!me || !me.permissions.has(PermissionFlagsBits.Administrator)) {
                disableEmbed.setDescription(`${emojis.cross} **Disable failed**\n`
                    + `> Missing required permission: \`Administrator\`\n\n`
                    + `${emojis.info} The bot requires administrator permissions to remove protection systems.`);
                return interaction.editReply({ embeds: [disableEmbed] });
            }

            await delay(800);

            // Frame 2: Permission check passed & Removing protection role
            disableEmbed.setDescription(`${emojis.antinuke} **Initializing full protection shutdown...**\n`
                + `> ${emojis.tick} Permission check passed\n`
                + `> ${emojis.loading} Disabling all protection modules & removing role`);
            await interaction.editReply({ embeds: [disableEmbed] }).catch(() => null);

            let roleDeleted = false;
            if (antinukeData.protectRole) {
                try {
                    const role = await guild.roles.fetch(antinukeData.protectRole);
                    if (role) {
                        await role.delete('Antinuke system disabled').catch(() => null);
                        roleDeleted = true;
                    }
                } catch (e) { }
            }

            await client.deleteAntinukeData(guild.id);

            await delay(900);

            // Final Frame: Complete System Shutdown!
            disableEmbed.setDescription(
                `${emojis.tick} **Complete System Shutdown!**\n\n`
                + `__**${emojis.warn} All Protection Removed**__\n`
                + `> ${emojis.arrow} **Status:** \`Disabled\` ${emojis.cross}\n`
                + `> ${emojis.arrow} **Role:** ${roleDeleted ? '`Deleted`' : '`Not found`'}\n\n`
                + `-# Use \`/antinuke enable\` to set up a new protection system.`
            );
            disableEmbed.setColor(client.color);
            await interaction.editReply({ embeds: [disableEmbed] }).catch(() => null);
        }

        else if (subcommandGroup === 'owner') {
            if (interaction.user.id !== guild.ownerId && !isBotOwner(interaction.user.id)) {
                return await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Only server owner can use this command**`)
                            .setColor(client.color)
                    ]
                });
            }

            const extraOwners = antinukeData?.extraOwners || [];

            switch (subcommand) {
                case 'add': {
                    await interaction.deferReply();

                    if (!antinukeData?.enabled) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    if (!user) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Please provide a valid Member.**`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    if (extraOwners.includes(user.id)) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(client.color)
                                    .setDescription(`${emojis.warn} **This user is already an extra owner.**`)
                            ]
                        });
                    }

                    extraOwners.push(user.id);

                    await antinukeDB.set(`antinukeData_${guild.id}.extraOwners`, extraOwners);
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setDescription(`${emojis.tick} ${user} **has been added to Extra Owners.**`)
                        ]
                    });
                }

                case 'remove': {
                    await interaction.deferReply();

                    if (!antinukeData?.enabled) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    if (!user) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Please provide a valid Member.**`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    if (!extraOwners.includes(user.id)) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(client.color)
                                    .setDescription(`${emojis.warn} ${user} **is not in the Extra Owners.**`)
                            ]
                        });
                    }

                    const extraOwners2 = extraOwners.filter(id => id !== user.id);

                    await antinukeDB.set(`antinukeData_${guild.id}.extraOwners`, extraOwners2);
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(client.color)
                                .setDescription(`${emojis.tick} **Successfully remove ${user} from Extra Owners**`)
                        ]
                    });
                }

                case 'show': {
                    await interaction.deferReply();

                    if (!antinukeData?.enabled) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    if (extraOwners.length === 0) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(client.color)
                                    .setDescription(`${emojis.warn} **No Extra Owners have been set.**`)
                            ]
                        });
                    }

                    const itemsPerPage = 5;
                    const totalPages = Math.ceil(extraOwners.length / itemsPerPage);

                    const generateEmbed = (pageNum) => {
                        const start = pageNum * itemsPerPage;
                        const end = start + itemsPerPage;
                        const pageItems = extraOwners.slice(start, end);

                        const embed = new EmbedBuilder()
                            .setTitle("Extra Owners List")
                            .setColor(client.color)
                            .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                            .setThumbnail(guild.iconURL({ size: 1024 }));

                        let description = "";
                        pageItems.forEach((id) => {
                            const owner = client.users.cache.get(id);
                            description += `${owner} (\`${id}\`)\n`;
                        });

                        embed.setDescription(description || "No owners found.");
                        return embed;
                    };

                    await paginate(interaction, extraOwners, itemsPerPage, generateEmbed, true);
                    return;
                }

                case 'reset': {
                    await interaction.deferReply();
                    if (!antinukeData?.enabled) {
                        return await interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        })
                    }
                    await antinukeDB.set(`antinukeData_${guild.id}.extraOwners`, [])
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Successfully reseted all extra owners for this guild.**`)
                                .setColor(client.color)
                        ]
                    })
                }

                default:
                    return await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Invalid subcommand**`)
                                .setColor(client.color)
                        ]
                    })
            }

        } else if (subcommandGroup === 'whitelist') {
            const fields = [
                { name: 'Anti Bot', key: 'antiBot' },
                { name: 'Anti Ban', key: 'antiBan' },
                { name: 'Anti Kick', key: 'antiKick' },
                { name: 'Anti Channel Create', key: 'antiChannelCreate' },
                { name: 'Anti Channel Delete', key: 'antiChannelDelete' },
                { name: 'Anti Channel Update', key: 'antiChannelUpdate' },
                { name: 'Anti Sticker Create', key: 'antiStickerCreate' },
                { name: 'Anti Sticker Delete', key: 'antiStickerDelete' },
                { name: 'Anti Sticker Update', key: 'antiStickerUpdate' },
                { name: 'Anti Guild Update', key: 'antiGuildUpdate' },
                { name: 'Anti Role Create', key: 'antiRoleCreate' },
                { name: 'Anti Role Delete', key: 'antiRoleDelete' },
                { name: 'Anti Role Update', key: 'antiRoleUpdate' },
                { name: 'Anti Unban', key: 'antiUnban' },
                { name: 'Anti Webhook Update', key: 'antiWebhookUpdate' },
                { name: 'Anti Member Update', key: 'antiMemberUpdate' },
                { name: 'Anti Emoji Update', key: 'antiEmojiUpdate' },
                { name: 'Anti Emoji Create', key: 'antiEmojiCreate' },
                { name: 'Anti Emoji Delete', key: 'antiEmojiDelete' },
                { name: 'Anti Prune', key: 'antiPrune' },
                { name: 'Anti Ping', key: 'antiPing' },
            ];

            switch (subcommand) {
                case 'add': {
                    await interaction.deferReply();
                    if (!antinukeData?.enabled) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        })
                    }
                    if (!user) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()

                                    .setDescription(`${emojis.warn} **Please provide a valid Member.**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    let whitelist = antinukeData?.whitelisted || {}

                    if (whitelist[user.id]) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(client.color)
                                    .setDescription(`${emojis.warn} **This user is already whitelisted.**`)
                            ]
                        });
                    }



                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`whitelist_select_${user.id}`)
                        .setPlaceholder('Select events to whitelist')
                        .setMinValues(1)
                        .setMaxValues(fields.length)
                        .addOptions(fields.map(field => ({ label: field.name, value: field.key })));

                    const whitelistAllButton = new ButtonBuilder()
                        .setCustomId(`whitelist_all_${user.id}`)
                        .setLabel('Whitelist All Events')
                        .setEmoji(emojis.gear)
                        .setStyle(ButtonStyle.Secondary);

                    const actionRow = new ActionRowBuilder().addComponents(selectMenu);
                    const buttonRow = new ActionRowBuilder().addComponents(whitelistAllButton);


                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setAuthor({ name: 'Whitelist User for Antinuke Events', iconURL: user.avatarURL({ size: 1024 }) })
                        .setDescription(`Select the events to whitelist using the dropdown below or use the button to whitelist all.`)
                        .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

                    const sentMessage = await interaction.editReply({ embeds: [embed], components: [actionRow, buttonRow] });

                    const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

                    collector.on('collect', async (i) => {
                        if (i.user.id !== interaction.user.id) {
                            return i.reply({ content: 'You cannot interact with this.', flags: MessageFlags.Ephemeral });
                        }

                        if (i.customId === `whitelist_select_${user.id}`) {
                            await i.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.loading} **Adding selected events to ${user}**`)
                                        .setColor(client.color)
                                ],
                                flags: MessageFlags.Ephemeral
                            });

                            await client.antinukeDB.set(`antinukeData_${guild.id}.whitelisted.${user.id}`, {
                                events: i.values,
                                executorId: interaction.user.id,
                                timestamp: Date.now()
                            });

                            const selectedLabels = fields
                                .filter(field => i.values.includes(field.key))
                                .map(field => `${emojis.enabled} **${field.name}**`)
                                .join("\n");

                            await i.editReply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.tick} **${user} has been whitelisted for selected events**`)
                                        .setColor(client.color)
                                ]
                            });

                            await sentMessage.edit({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor(client.color)
                                        .setAuthor({ name: user.username, iconURL: user.avatarURL({ size: 1024 }) })
                                        .setDescription(`${emojis.tick} **${user} has been whitelisted for selected events**\n\n${emojis.user} **Target:** ${user}\n${emojis.executor} **Executor: ${interaction.member}**\n\n__**Events**__\n${selectedLabels}`)
                                        .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                                ],
                                components: []
                            });

                            collector.stop();
                        }

                        else if (i.customId === `whitelist_all_${user.id}`) {
                            await i.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.loading} **Whitelisting ${user} for all events...**`)
                                        .setColor(client.color)
                                ],
                                flags: MessageFlags.Ephemeral
                            });

                            const allKeys = fields.map(field => field.key);
                            const allLabels = fields.map(field => `${emojis.enabled} **${field.name}**`).join("\n");

                            await client.antinukeDB.set(`antinukeData_${guild.id}.whitelisted.${user.id}`, {
                                events: allKeys,
                                executorId: interaction.user.id,
                                timestamp: Date.now()
                            });

                            await i.editReply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.tick} **${user} has been whitelisted for all events**`)
                                        .setColor(client.color)
                                ]
                            });

                            await sentMessage.edit({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor(client.color)
                                        .setAuthor({ name: user.username, iconURL: user.avatarURL({ size: 1024 }) })
                                        .setDescription(`${emojis.tick} **${user} has been whitelisted for all events**\n\n${emojis.user} **Target:** ${user}\n${emojis.executor} **Executor: ${interaction.member}**\n\n__**Events**__\n${allLabels}`)
                                        .setFooter({ text: `Executed by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                                ],
                                components: []
                            });

                            collector.stop();
                        }
                    });


                    return;
                }

                case 'remove': {
                    await interaction.deferReply()
                    if (!antinukeData?.enabled) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        })
                    }
                    if (!user) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()

                                    .setDescription(`${emojis.warn} **Please provide a valid Member.**`)
                                    .setColor(client.color)
                            ]
                        })
                    }

                    let whitelist = antinukeData?.whitelisted || {}

                    if (!whitelist[user.id]) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(client.color)
                                    .setDescription(`${emojis.warn} **This user is not whitelisted.**`)
                            ]
                        });
                    }

                    await antinukeDB.delete(`antinukeData_${guild.id}.whitelisted.${user.id}`)

                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **Removed ${user} from antinuke whitelist**`)
                                .setColor(client.color)
                        ]
                    })
                    break;
                }

                case 'show': {
                    await interaction.deferReply()
                    if (!antinukeData?.enabled) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        })
                    }
                    const whitelistData = await client.antinukeDB.get(`antinukeData_${guild.id}.whitelisted`) || {};
                    const whitelistedUsers = Object.entries(whitelistData);


                    if (whitelistedUsers.length === 0) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **No users are currently whitelisted.**`)
                                    .setColor(client.color)
                            ]
                        });
                    }

                    const itemsPerPage = 5;
                    const totalPages = Math.ceil(whitelistedUsers.length / itemsPerPage);

                    const generateEmbed = (pageNum) => {
                        const start = pageNum * itemsPerPage;
                        const end = start + itemsPerPage;
                        const pageItems = whitelistedUsers.slice(start, end);

                        const embed = new EmbedBuilder()
                            .setTitle("Whitelisted Users")
                            .setColor(client.color)
                            .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                            .setThumbnail(guild.iconURL({ size: 1024 }));

                        let description = "";
                        pageItems.forEach(([userId, data]) => {
                            const executor = data?.executorId ? `<@${data.executorId}>` : "Unknown";
                            const timestamp = data?.timestamp ? `<t:${Math.floor(data.timestamp / 1000)}:R>` : "Unknown";
                            description += `<@${userId}> — **Executor:** ${executor} | ${timestamp}\n`;
                        });

                        embed.setDescription(description || "No users found.");
                        return embed;
                    };


                    await paginate(interaction, whitelistedUsers, itemsPerPage, generateEmbed, true);
                    return;
                }

                case 'reset': {
                    await interaction.deferReply()
                    if (!antinukeData?.enabled) {
                        return interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                                    .setColor(client.color)
                            ]
                        })
                    }
                    await antinukeDB.set(`antinukeData_${guild.id}.whitelisted`, {})
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Successfully reseted all whitelisted users for this guild.**`)
                                .setColor(client.color)
                        ]
                    })
                }

                default:
                    return await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Invalid subcommand**`)
                                .setColor(client.color)
                        ]
                    })
            }

        } else if (subcommand === 'logging') {
            await interaction.deferReply()
            if (!antinukeData?.enabled) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                            .setColor(client.color)
                    ]
                })
            }

            if (!channel || channel?.type !== ChannelType.GuildText) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Please provide a valid text channel mention or ID**`)
                            .setColor(client.color)
                    ]
                })
            }


            await antinukeDB.set(`antinukeData_${guild.id}.logsChannel`, channel.id)

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.tick} **Antinuke Logging Channel is set to ${channel}**`)
                        .setColor(client.color)
                ]
            })
        } else if (subcommand === 'config') {
            await interaction.deferReply()
            if (!antinukeData?.enabled) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                            .setColor(client.color)
                    ]
                })
            }

            const whitelistData = antinukeData?.whitelisted || {}
            const whitelistedCount = Object.entries(whitelistData)?.length || 0
            const extraOwnerCount = antinukeData?.extraOwners?.length || 0

            const embed = new EmbedBuilder()
                .setDescription(
                    `__**${emojis.antinuke} Protection Details**__\n` +
                    `> ${emojis.arrow} **Role:** <@&${antinukeData.protectRole}>\n` +
                    `> ${emojis.arrow} **Default Action:** \`${antinukeData.punishment?.toUpperCase()}\`\n` +
                    `> ${emojis.arrow} **Logging Channel:** ${antinukeData?.logsChannel ? `<#${antinukeData.logsChannel}>` : '`Not Set`'}\n` +
                    `> ${emojis.arrow} **Whitelist Users:** \`${whitelistedCount}\`\n` +
                    `> ${emojis.arrow} **ExtraOwners Count:** \`${extraOwnerCount}\`\n\n` +
                    `__**${emojis.gear} Active Protection Events**__\n` +
                    renderEventsList(antinukeData?.disabledEvents || []) +
                    `\n\n-# **Note:- Move my "Roynix Protect" role to the top of all roles for the best performance**`
                ).setColor(client.color)
                .setAuthor({ name: 'Roynix Antinuke System', iconURL: client.user.avatarURL({ size: 1024 }) })
                .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
                .setThumbnail(guild.iconURL({ size: 1024 }))

            await interaction.editReply({ embeds: [embed] })
            return
        } else if (subcommand === 'toggle' || subcommand === 'modules') {
            await interaction.deferReply()
            if (!antinukeData?.enabled) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Antinuke is not enabled in this server.**`)
                            .setColor(client.color)
                    ]
                });
            }

            const moduleOption = interaction.options.getString('module');
            if (moduleOption) {
                const targetModule = findModule(moduleOption);
                if (!targetModule) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.cross} **Invalid module name.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const disabled = antinukeData.disabledEvents || [];
                const isCurrentlyDisabled = disabled.includes(targetModule.key);
                const newDisabled = isCurrentlyDisabled
                    ? disabled.filter(k => k !== targetModule.key)
                    : [...disabled, targetModule.key];

                await antinukeDB.set(`antinukeData_${guild.id}.disabledEvents`, newDisabled);
                const nowEnabled = isCurrentlyDisabled;

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **${targetModule.name}** has been **${nowEnabled ? 'enabled' : 'disabled'}** ${nowEnabled ? emojis.enabled : emojis.disabled}`)
                            .setColor(client.color)
                    ]
                });
            }

            const buildMenu = (currentDisabled) => {
                const embed = new EmbedBuilder()
                    .setAuthor({ name: 'Roynix Antinuke Protection Modules', iconURL: client.user.avatarURL({ size: 1024 }) })
                    .setDescription(
                        `Select a protection module from the dropdown below to toggle it **ON** or **OFF**.\n\n` +
                        `__**${emojis.gear} Current Module Status**__\n` +
                        renderEventsList(currentDisabled)
                    )
                    .setColor(client.color)
                    .setThumbnail(guild.iconURL({ size: 1024 }))
                    .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('antinuke_slash_module_toggle_menu')
                    .setPlaceholder('Select a module to toggle...')
                    .addOptions(
                        antinukeModules.map(mod => {
                            const isEnabled = !currentDisabled.includes(mod.key);
                            return {
                                label: mod.name,
                                value: mod.key,
                                description: (isEnabled ? '[ENABLED] ' : '[DISABLED] ') + mod.description.slice(0, 80),
                                emoji: isEnabled ? '🟢' : '⚪'
                            };
                        })
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);
                return { embed, row };
            };

            let currentDisabled = antinukeData.disabledEvents || [];
            const initial = buildMenu(currentDisabled);
            const replyMsg = await interaction.editReply({
                embeds: [initial.embed],
                components: [initial.row]
            });

            const collector = replyMsg.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 120000
            });

            collector.on('collect', async i => {
                const selectedKey = i.values[0];
                const targetMod = antinukeModules.find(m => m.key === selectedKey);
                if (!targetMod) return i.deferUpdate();

                const freshData = await antinukeDB.get(`antinukeData_${guild.id}`) || {};
                const disabledList = freshData.disabledEvents || [];
                const isOff = disabledList.includes(selectedKey);
                const updatedDisabled = isOff
                    ? disabledList.filter(k => k !== selectedKey)
                    : [...disabledList, selectedKey];

                await antinukeDB.set(`antinukeData_${guild.id}.disabledEvents`, updatedDisabled);
                currentDisabled = updatedDisabled;

                const updated = buildMenu(currentDisabled);
                await i.update({
                    embeds: [updated.embed],
                    components: [updated.row]
                });
            });

            collector.on('end', async () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    StringSelectMenuBuilder.from(initial.row.components[0]).setDisabled(true)
                );
                await interaction.editReply({ components: [disabledRow] }).catch(() => null);
            });
            return;
        } else if (subcommandGroup === 'punishment') {
            if (!antinukeData?.enabled) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Antinuke is not enabled in this server**`)
                            .setColor(client.color)
                    ]
                })
            }

            switch (subcommand) {
                case 'set': {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_action')
                        .setPlaceholder('Select action')
                        .setMinValues(1)
                        .setMaxValues(1)
                        .addOptions(
                            { label: 'Kick', emoji: emojis.rmv, value: 'kick' },
                            { label: 'Ban', emoji: emojis.ban, value: 'ban' }
                        );

                    const row = new ActionRowBuilder().addComponents(selectMenu);

                    const embed = new EmbedBuilder()
                        .setColor(client.color)
                        .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                        .setTitle('Antinuke Action Configuration')
                        .setDescription(`${emojis.antinuke} **Choose the action that should be enforced when a security event is detected.**\n\n-# **Note:- Move my "Roynix Protect" role to the top of all roles for the best performance**`)
                        .setThumbnail(guild.iconURL({ size: 1024 }))



                    const sentMessage = await interaction.reply({ embeds: [embed], components: [row] });


                    const collector = sentMessage.createMessageComponentCollector({ time: 60000 });
                    let selectedAction;
                    collector.on('collect', async (i) => {
                        if (!i.isStringSelectMenu()) return;
                        if (i.user.id !== interaction.user.id) {
                            return i.reply({ content: 'You cannot interact with this.', flags: MessageFlags.Ephemeral });
                        }
                        const { customId, values, guild } = i;

                        if (customId === 'select_action') {
                            selectedAction = values[0];

                            try {
                                await sentMessage.edit({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                            .setDescription(`${emojis.loading} **Configuring the antinuke punishment**`)
                                            .setColor(client.color)
                                    ],
                                    flags: MessageFlags.Ephemeral,
                                    components: []
                                })

                                await client.antinukeDB.set(`antinukeData_${guild.id}.punishment`, selectedAction);

                                await i.update({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                            .setColor(client.color)
                                            .setDescription(`${emojis.tick} Antinuke action has been set to **${selectedAction}**`)
                                    ],
                                    components: [],
                                    flags: MessageFlags.Ephemeral
                                });

                                collector.stop();
                            } catch (error) {
                                console.error('Failed to set antinuke action:', error);
                                await i.followUp({
                                    content: `${emojis.cross} **An error occurred while setting the antinuke action.**`,
                                    flags: MessageFlags.Ephemeral
                                });
                            }
                        }
                    });


                    collector.on('end', async () => {
                        if (!selectedAction) {
                            await sentMessage.edit({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor(client.color)
                                        .setDescription(`${emojis.warn} **Antinuke action setup timed out.**`)
                                ], components: []
                            });
                        }
                    });
                    return
                }

                case 'show': {
                    const action = antinukeData?.punishment

                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: 'Roynix Antinuke', iconURL: client.user.avatarURL({ size: 1024 }) })
                                .setDescription(`${emojis.antinuke} **Antinuke System punishment is currently set to ${action === 'kick' ? `\`Kick\` ${emojis.rmv}` : `\`Ban\` ${emojis.ban}`}**`)
                                .setColor(client.color)
                        ]
                    })
                }

                default: {
                    return await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Invalid subcommand**`)
                                .setColor(client.color)
                        ]
                    })
                }
            }
        }

    }
}