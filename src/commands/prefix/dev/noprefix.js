import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { isBotOwner } from '../../../utils/isBotOwner.js';
import emojis from '../../../config/emojis.js';
import { error } from '../../../utils/logger.js';
import { paginate } from '../../../utils/pagination.js';

const plans = {
    "Bronze": 14,
    "Silver": 30,
    "Gold": 90,
    "Platinum": 180,
    "Diamond": 365,
    "Lifetime": Infinity
};

export const data = {
    name: "noprefix",
    description: "NoPrefix System",
    aliases: ['np', 'nop'],
    subCommandCount: 6,
    /**
     * @param {import('discord.js').Message} message
     * @param {String[]} args
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(message, args, client) {
        const subcommand = args[0]?.toLowerCase();
        const noprefixDB = client.noprefixDB;
        const isNoprefixUser = await noprefixDB.get(`noprefix_${message.author.id}`);
        const isOwner = isBotOwner(message.author.id);

        if (!isNoprefixUser && !isOwner) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You don't have permission to use this command.**`)
                        .setColor(client.color)
                ]
            });
        }

        if (!subcommand) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: `${client.user.username} NoPrefix System`, iconURL: client.user.displayAvatarURL() })
                .setColor(client.color)
                .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

            if (isOwner) {
                embed.setDescription(
                    `### 🔧 **NoPrefix Developer Commands**\n` +
                    `> Only available to bot owners.\n\n` +
                    `- **\`noprefix add <user> <plan>\`**\n${emojis.reply} Add a user to the NoPrefix system with a specific plan.\n` +
                    `- **\`noprefix remove <user>\`**\n${emojis.reply} Remove a user from the NoPrefix system.\n` +
                    `- **\`noprefix list\`**\n${emojis.reply} View all users with NoPrefix access.\n\n` +
                    `### 👤 **NoPrefix User Commands**\n` +
                    `> Available to users with active NoPrefix access.\n\n` +
                    `- **\`noprefix enable\`**\n${emojis.reply} Enable your NoPrefix access.\n` +
                    `- **\`noprefix disable\`**\n${emojis.reply} Disable your NoPrefix access.\n` +
                    `- **\`noprefix status\`**\n${emojis.reply} View your current NoPrefix plan, expiry, and status.`
                );
            } else {
                embed.setDescription(
                    `### 👤 **NoPrefix User Commands**\n` +
                    `> Available to users with active NoPrefix access.\n\n` +
                    `- **\`noprefix enable\`**\n${emojis.reply} Enable your NoPrefix access.\n` +
                    `- **\`noprefix disable\`**\n${emojis.reply} Disable your NoPrefix access.\n` +
                    `- **\`noprefix status\`**\n${emojis.reply} View your current NoPrefix plan, expiry, and status.`
                );
            }

            return message.reply({ embeds: [embed] });
        }

        if (['add', 'remove', 'list'].includes(subcommand) && !isOwner) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You don't have permission to use this command.**`)
                        .setColor(client.color)
                ]
            });
        }

        switch (subcommand) {
            case 'add': {
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please mention a user or provide a valid user ID.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
                if (!targetUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Invalid user provided. Please mention a user or provide a valid user ID.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                if(targetUser.bot) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You can't add a bot to NoPrefix.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const isUserNP = await noprefixDB.get(`noprefix_${targetUser.id}`);
                if (isUserNP) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **This user already has NoPrefix.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const planButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('Bronze').setLabel('Bronze').setEmoji(emojis.bronze).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('Silver').setLabel('Silver').setEmoji(emojis.silver).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('Gold').setLabel('Gold').setEmoji(emojis.gold).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('Platinum').setLabel('Platinum').setEmoji(emojis.platinum).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('Diamond').setLabel('Diamond').setEmoji(emojis.diamond).setStyle(ButtonStyle.Secondary),
                );
                const planButtons2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('Lifetime').setLabel('Lifetime').setEmoji(emojis.lifetime).setStyle(ButtonStyle.Secondary)
                );

                const embed = new EmbedBuilder()
                    .setTitle("Select a Plan")
                    .setDescription(
                        `**Please choose a plan for ${targetUser.tag}:**\n` +
                        `- **Bronze Plan**: \`${plans['Bronze']}\` days\n` +
                        `- **Silver Plan**: \`${plans['Silver']}\` days\n` +
                        `- **Gold Plan**: \`${plans['Gold']}\` days\n` +
                        `- **Platinum Plan**: \`${plans['Platinum']}\` days\n` +
                        `- **Diamond Plan**: \`${plans['Diamond']}\` days\n` +
                        `- **Lifetime Plan**: Lifetime`
                    )
                    .setColor(client.color)
                    .setThumbnail(client.user.avatarURL({ size: 1024 }))

                const messageReply = await message.reply({
                    embeds: [embed],
                    components: [planButtons, planButtons2]
                });

                const collector = messageReply.createMessageComponentCollector({
                    time: 1200000,
                });

                collector.on('collect', async (interaction) => {
                    if (interaction.user.id !== message.author.id) {
                        return interaction.reply({
                            content: "You cannot select a plan for this action.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    const selectedPlan = interaction.customId;
                    const days = plans[selectedPlan];

                    let endTimestamp = null;
                    if (days !== Infinity) {
                        endTimestamp = Date.now() + days * 24 * 60 * 60 * 1000;
                    }

                    await noprefixDB.set(`noprefix_${targetUser.id}`, {
                        endTimestamp,
                        plan: selectedPlan,
                        enabled: true,
                        executorId: message.author.id,
                    }).then(async () => {
                        collector.stop();
                        await interaction.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Added NoPrefix to ${targetUser.tag} with the \`${selectedPlan}\` plan.**`)
                                    .setColor(client.color)
                            ],
                            components: []
                        });
                    })
                });

                collector.on('end', async (_, reason) => {
                    if(reason === 'time') {
                        await messageReply.edit({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **NoPrefix plan selection timed out.**`)
                                    .setColor(client.color)
                            ],
                            components: []
                        });
                    }
                });

                break;
            }

            case 'remove': {
                if (!args[1]) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please mention a user or provide a valid user ID.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
                if (!targetUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Invalid user provided. Please mention a user or provide a valid user ID.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const isUserNP = await noprefixDB.get(`noprefix_${targetUser.id}`);
                if (!isUserNP) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **This user is not in NoPrefix.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await noprefixDB.delete(`noprefix_${targetUser.id}`).then(() => {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **Removed ${targetUser.tag} from NoPrefix.**`)
                                .setColor(client.color)
                        ]
                    });
                })

                break;
            }

            case 'list': {
                const allKeys = await noprefixDB.all();
                const noPrefixUsers = allKeys
                    .filter(entry => entry.id.startsWith('noprefix_'))
                    .map(entry => ({
                        userId: entry.id.replace('noprefix_', ''),
                        ...entry.value
                    }));

                if (noPrefixUsers.length === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **There are no NoPrefix users.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const itemsPerPage = 5;
                const generateEmbed = (pageNum) => {
                    const start = pageNum * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageItems = noPrefixUsers.slice(start, end);

                    const embed = new EmbedBuilder()
                        .setTitle('No-Prefix Users')
                        .setColor(client.color)
                        .setFooter({ text: `Page ${pageNum + 1} of ${Math.ceil(noPrefixUsers.length / itemsPerPage)}` })
                        .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))

                    let description = '';
                    pageItems.forEach((item) => {
                        description += `- <@${item.userId}> : **${item.plan}** : (\`${item.userId}\`)\n`;
                    });

                    return embed.setDescription(description);
                };

                await paginate(message, noPrefixUsers, itemsPerPage, generateEmbed);
                break;
            }

            case 'enable': {
                if (!isNoprefixUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You don't have NoPrefix access.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await noprefixDB.set(`noprefix_${message.author.id}.enabled`, true);
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **NoPrefix has been enabled.**`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'disable': {
                if (!isNoprefixUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You don't have NoPrefix access.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await noprefixDB.set(`noprefix_${message.author.id}.enabled`, false);
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **NoPrefix has been disabled.**`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'status': {
                if (!isNoprefixUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You don't have NoPrefix access.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const npData = await noprefixDB.get(`noprefix_${message.author.id}`);

                const planEmoji = {
                    'Bronze': emojis.bronze,
                    'Silver': emojis.silver,
                    'Gold': emojis.gold,
                    'Platinum': emojis.platinum,
                    'Diamond': emojis.diamond,
                    'Lifetime': emojis.lifetime
                }[npData.plan];

                const embed = new EmbedBuilder()
                    .setAuthor({ name: "NoPrefix Status", iconURL: message.author.avatarURL({ size: 1024 })})
                    .setColor(client.color)
                    .addFields(
                        { name: `${emojis.leaf} Plan`, value: `\`${npData.plan}\` ${planEmoji}` },
                        { name: `${npData.enabled ? emojis.on : emojis.off} Status`, value: npData.enabled ? `\`Enabled\` ${emojis.tick}` : `Disabled ${emojis.cross}` }
                    );

                if (npData.endTimestamp) {
                    embed.addFields(
                        { name: `${emojis.expire} Expires`, value: `<t:${Math.floor(npData.endTimestamp / 1000)}:R>` }
                    );
                } else if (npData.plan === 'Lifetime') {
                    embed.addFields(
                        { name: `${emojis.expire} Expires`, value: '\`Never\`' }
                    );
                }

                return message.reply({ embeds: [embed] });
            }

            default: {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Invalid subcommand. Use \`noprefix\` to see available commands.**`)
                            .setColor(client.color)
                    ]
                });
            }
        }
    }
};