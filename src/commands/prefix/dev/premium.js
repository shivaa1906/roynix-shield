import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { isBotOwner } from '../../../utils/isBotOwner.js';
import emojis from '../../../config/emojis.js';
import { error } from '../../../utils/logger.js';
import { paginate } from '../../../utils/pagination.js';

const plans = {
    "Bronze": { duration: 14, guilds: 1 },
    "Silver": { duration: 30, guilds: 3 },
    "Gold": { duration: 90, guilds: 5 },
    "Platinum": { duration: 180, guilds: 10 },
    "Diamond": { duration: 365, guilds: 15 },
    "Lifetime": { duration: Infinity, guilds: 25 }
};

export const data = {
    name: "premium",
    description: "Premium System",
    aliases: ['prem', 'vip'],
    subCommandCount: 6,
    /**
     * @param {import('discord.js').Message} message
     * @param {String[]} args
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(message, args, client) {
        const subcommand = args[0]?.toLowerCase();
        const premiumDB = client.premiumDB;
        const premiumGuildDB = client.premiumGuildDB;
        const isPremiumUser = await premiumDB.get(`premium_${message.author.id}`);
        const isOwner = isBotOwner(message.author.id);

        if (!isPremiumUser && !isOwner && ['add', 'remove', 'list'].includes(subcommand)) {
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
                .setAuthor({ name: `${client.user.username} Premium System`, iconURL: client.user.displayAvatarURL() })
                .setColor(client.color)
                .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

            if (isOwner) {
                embed.setDescription(
                    `### 🔧 **Premium Developer Commands**\n` +
                    `> Only available to bot owners.\n\n` +
                    `- **\`premium add <user> <plan>\`**\n${emojis.reply} Add a user to the Premium system with a specific plan.\n` +
                    `- **\`premium remove <user>\`**\n${emojis.reply} Remove a user from the Premium system.\n` +
                    `- **\`premium list\`**\n${emojis.reply} View all users with Premium access.\n\n` +
                    `### 👤 **Premium User Commands**\n` +
                    `> Available to users with active Premium access.\n\n` +
                    `- **\`premium status\`**\n${emojis.reply} View your current Premium plan, expiry, and status.\n` +
                    `- **\`premium activate\`**\n${emojis.reply} Activate Premium for this server.\n` +
                    `- **\`premium revoke\`**\n${emojis.reply} Revoke Premium from this server.\n` +
                    `- **\`premium guilds\`**\n${emojis.reply} View all servers where you've activated Premium.`
                );
            } else if (isPremiumUser) {
                embed.setDescription(
                    `### 👤 **Premium User Commands**\n` +
                    `> Available to users with active Premium access.\n\n` +
                    `- **\`premium status\`**\n${emojis.reply} View your current Premium plan, expiry, and status.\n` +
                    `- **\`premium activate\`**\n${emojis.reply} Activate Premium for this server.\n` +
                    `- **\`premium revoke\`**\n${emojis.reply} Revoke Premium from this server.\n` +
                    `- **\`premium guilds\`**\n${emojis.reply} View all servers where you've activated Premium.`
                );
            } else {
                embed.setDescription(
                    `### 💎 **Premium System**\n` +
                    `> This system provides exclusive benefits to premium users.\n\n` +
                    `You currently don't have premium access. Contact the bot owner for more information.`
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

                if (targetUser.bot) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You can't add a bot to Premium.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const isUserPremium = await premiumDB.get(`premium_${targetUser.id}`);
                if (isUserPremium) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **This user already has Premium.**`)
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
                        `- **Bronze Plan**: \`${plans['Bronze'].duration}\` days | \`${plans['Bronze'].guilds}\` servers\n` +
                        `- **Silver Plan**: \`${plans['Silver'].duration}\` days | \`${plans['Silver'].guilds}\` servers\n` +
                        `- **Gold Plan**: \`${plans['Gold'].duration}\` days | \`${plans['Gold'].guilds}\` servers\n` +
                        `- **Platinum Plan**: \`${plans['Platinum'].duration}\` days | \`${plans['Platinum'].guilds}\` servers\n` +
                        `- **Diamond Plan**: \`${plans['Diamond'].duration}\` days | \`${plans['Diamond'].guilds}\` servers\n` +
                        `- **Lifetime Plan**: Lifetime | \`${plans['Lifetime'].guilds}\` servers`
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
                    const days = plans[selectedPlan].duration;
                    const maxGuilds = plans[selectedPlan].guilds;

                    let endTimestamp = null;
                    if (days !== Infinity) {
                        endTimestamp = Date.now() + days * 24 * 60 * 60 * 1000;
                    }

                    await premiumDB.set(`premium_${targetUser.id}`, {
                        endTimestamp,
                        plan: selectedPlan,
                        maxGuilds,
                        activatedGuilds: [],
                        executorId: message.author.id,
                    }).then(async () => {
                        collector.stop();
                        await interaction.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Added Premium to ${targetUser.tag} with the \`${selectedPlan}\` plan.**`)
                                    .setColor(client.color)
                            ],
                            components: []
                        });
                    })
                });

                collector.on('end', async (_, reason) => {
                    if (reason === 'time') {
                        await messageReply.edit({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **Premium plan selection timed out.**`)
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

                const isUserPremium = await premiumDB.get(`premium_${targetUser.id}`);
                if (!isUserPremium) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **This user is not in Premium.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const allGuildKeys = await premiumGuildDB.all();
                const userGuildKeys = allGuildKeys.filter(key => key.id.includes(`_${targetUser.id}`));

                for (const key of userGuildKeys) {
                    await premiumGuildDB.delete(key.id);
                }

                await premiumDB.delete(`premium_${targetUser.id}`).then(() => {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.tick} **Removed ${targetUser.tag} from Premium and deactivated all their servers.**`)
                                .setColor(client.color)
                        ]
                    });
                })

                break;
            }

            case 'list': {
                const allKeys = await premiumDB.all();
                const premiumUsers = allKeys
                    .filter(entry => entry.id.startsWith('premium_'))
                    .map(entry => ({
                        userId: entry.id.replace('premium_', ''),
                        ...entry.value
                    }));

                if (premiumUsers.length === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **There are no Premium users.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const itemsPerPage = 5;
                const generateEmbed = (pageNum) => {
                    const start = pageNum * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageItems = premiumUsers.slice(start, end);

                    const embed = new EmbedBuilder()
                        .setTitle('Premium Users')
                        .setColor(client.color)
                        .setFooter({ text: `Page ${pageNum + 1} of ${Math.ceil(premiumUsers.length / itemsPerPage)}` })
                        .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))

                    let description = '';
                    pageItems.forEach((item) => {
                        description += `- <@${item.userId}> : **${item.plan}** (${item.activatedGuilds?.length || 0}/${item.maxGuilds} servers) : (\`${item.userId}\`)\n`;
                    });

                    return embed.setDescription(description);
                };

                await paginate(message, premiumUsers, itemsPerPage, generateEmbed);
                break;
            }

            case 'status': {
                if (!isPremiumUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You don't have Premium access.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const premiumData = await premiumDB.get(`premium_${message.author.id}`);

                const planEmoji = {
                    'Bronze': emojis.bronze,
                    'Silver': emojis.silver,
                    'Gold': emojis.gold,
                    'Platinum': emojis.platinum,
                    'Diamond': emojis.diamond,
                    'Lifetime': emojis.lifetime
                }[premiumData.plan];

                const embed = new EmbedBuilder()
                    .setAuthor({ name: "Premium Status", iconURL: message.author.avatarURL({ size: 1024 }) })
                    .setColor(client.color)
                    .addFields(
                        { name: `${emojis.leaf} Plan`, value: `\`${premiumData.plan}\` ${planEmoji}` },
                        { name: `${emojis.server} Servers`, value: `\`${premiumData.activatedGuilds?.length || 0}/${premiumData.maxGuilds}\` activated` }
                    );

                if (premiumData.endTimestamp) {
                    embed.addFields(
                        { name: `${emojis.expire} Expires`, value: `<t:${Math.floor(premiumData.endTimestamp / 1000)}:R>` }
                    );
                } else if (premiumData.plan === 'Lifetime') {
                    embed.addFields(
                        { name: `${emojis.expire} Expires`, value: '\`Never\`' }
                    );
                }

                return message.reply({ embeds: [embed] });
            }

            case 'activate': {
                if (!isPremiumUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You don't have Premium access.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const guildId = message.guild?.id;
                if (!guildId) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please run this command in a server to activate Premium.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const premiumData = await premiumDB.get(`premium_${message.author.id}`);
                if (premiumData.activatedGuilds?.length >= premiumData.maxGuilds) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You've reached your maximum server limit (${premiumData.maxGuilds}).**`)
                                .setColor(client.color)
                        ]
                    });
                }

                if (premiumData.activatedGuilds?.includes(guildId)) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You've already activated Premium for this server.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const allGuildActivations = await premiumGuildDB.all();
                const existingActivation = allGuildActivations.find(entry =>
                    entry.id.startsWith(`guild_${guildId}_`)
                );

                if (existingActivation) {
                    const activatingUserId = existingActivation.id.split('_')[2];
                    const activatingUser = await client.users.fetch(activatingUserId).catch(() => null);

                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Premium is already activated for this server by ${activatingUser ? activatingUser.tag : 'Unknown User'}.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const updatedGuilds = [...(premiumData.activatedGuilds || []), guildId];
                await premiumDB.set(`premium_${message.author.id}.activatedGuilds`, updatedGuilds);

                await premiumGuildDB.set(`guild_${guildId}_${message.author.id}`, {
                    activatedAt: Date.now(),
                    userId: message.author.id,
                    plan: premiumData.plan
                });

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Premium has been activated for ${message.guild.name}.**`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'revoke': {
                if (!isPremiumUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You don't have Premium access.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const guildId = message.guild?.id;
                if (!guildId) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please run this command in a server to revoke Premium.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const premiumData = await premiumDB.get(`premium_${message.author.id}`);
                if (!premiumData.activatedGuilds?.includes(guildId)) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **This server is not activated by you.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const updatedGuilds = premiumData.activatedGuilds.filter(id => id !== guildId);
                await premiumDB.set(`premium_${message.author.id}.activatedGuilds`, updatedGuilds);

                await premiumGuildDB.delete(`guild_${guildId}_${message.author.id}`);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Premium has been revoked from ${message.guild.name}.**`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'guilds': {
                if (!isPremiumUser) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You don't have Premium access.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const premiumData = await premiumDB.get(`premium_${message.author.id}`);
                const activatedGuilds = premiumData?.activatedGuilds || [];

                if (activatedGuilds.length === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You haven't activated Premium for any servers.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const itemsPerPage = 5;

                const generateEmbed = async (pageNum) => {
                    const start = pageNum * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageItems = activatedGuilds.slice(start, end);

                    const guildInfo = await Promise.all(
                        pageItems.map(async (guildId) => {
                            try {
                                const guild = await client.guilds.fetch(guildId);
                                return { id: guildId, name: guild.name };
                            } catch {
                                return { id: guildId, name: 'Unknown Server' };
                            }
                        })
                    );

                    const embed = new EmbedBuilder()
                        .setTitle('Premium Servers')
                        .setColor(client.color)
                        .setThumbnail(message.author.displayAvatarURL({ size: 1024 }))
                        .setFooter({
                            text: `Page ${pageNum + 1} of ${Math.ceil(activatedGuilds.length / itemsPerPage)}`
                        });

                    const description = guildInfo
                        .map(g => `・**${g.name}** (\`${g.id}\`)`)
                        .join('\n');

                    embed.setDescription(description);

                    return embed;
                };

                await paginate(message, activatedGuilds, itemsPerPage, generateEmbed);
                break;
            }


            default: {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Invalid subcommand. Use \`premium\` to see available commands.**`)
                            .setColor(client.color)
                    ]
                });
            }
        }
    }
};