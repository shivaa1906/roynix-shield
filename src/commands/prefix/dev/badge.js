import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import emojis from '../../../config/emojis.js';

const badgeMap = {
    owner: { name: 'Owner', emoji: emojis.owner },
    developer: { name: 'Developer', emoji: emojis.developer2 },
    coreteam: { name: 'Core Team', emoji: emojis.coreteam2 },
    admin: { name: 'Admin', emoji: emojis.admin },
    staff: { name: 'Staff', emoji: emojis.staff },
    partner: { name: 'Partner', emoji: emojis.partner },
    owner_friend: { name: 'Owner Friend', emoji: emojis.owner_friend },
    bug_hunter: { name: 'Bug Hunter', emoji: emojis.bug_hunter },
};

export const data = {
    name: 'badge',
    description: 'Badge Management System',
    botOwnerOnly: true,
    /**
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const subcommand = args[0]?.toLowerCase();
        const badgeDB = client.badgeDB;

        if (!subcommand) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: `${client.user.username} Badge System`, iconURL: client.user.displayAvatarURL() })
                .setColor(client.color)
                .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `### 🔧 **Badge Management Commands**\n` +
                    `> Only available to bot owners.\n\n` +
                    `- **\`badge add <user> <badge>\`**\n${emojis.reply} Add a badge to a user\n` +
                    `- **\`badge remove <user> <badge>\`**\n${emojis.reply} Remove a badge from a user\n` +
                    `- **\`badge list [user]\`**\n${emojis.reply} View all badges or a user's badges\n\n` +
                    `### 🏷️ **Available Badges**\n` +
                    Object.entries(badgeMap).map(([key, { name, emoji }]) =>
                        `- ${emoji} **${name}** (\`${key}\`)`).join('\n')
                );

            return message.reply({ embeds: [embed] });
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

                if (!args[2]) {
                    const badgeButtons = new ActionRowBuilder().addComponents(
                        Object.entries(badgeMap).slice(0, 5).map(([key, { name, emoji }]) =>
                            new ButtonBuilder()
                                .setCustomId(key)
                                .setLabel(name)
                                .setEmoji(emoji)
                                .setStyle(ButtonStyle.Secondary)
                        )
                    );


                    const badgeButtons2 = new ActionRowBuilder().addComponents(
                        Object.entries(badgeMap).slice(5).map(([key, { name, emoji }]) =>
                            new ButtonBuilder()
                                .setCustomId(key)
                                .setLabel(name)
                                .setEmoji(emoji)
                                .setStyle(ButtonStyle.Secondary)
                        )
                    );

                    const embed = new EmbedBuilder()
                        .setTitle("Select a Badge")
                        .setDescription(`**Please choose a badge to add to ${targetUser.tag}:**`)
                        .setColor(client.color)
                        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }));

                    const messageReply = await message.reply({
                        embeds: [embed],
                        components: [badgeButtons, badgeButtons2]
                    });

                    const collector = messageReply.createMessageComponentCollector({
                        time: 120000,
                    });

                    collector.on('collect', async (interaction) => {
                        if (interaction.user.id !== message.author.id) {
                            return interaction.reply({
                                content: "You cannot select a badge for this action.",
                                flags: MessageFlags.Ephemeral,
                            });
                        }

                        const selectedBadge = interaction.customId;
                        const badgeData = badgeMap[selectedBadge];

                        const userBadges = await badgeDB.get(`badges_${targetUser.id}`) || [];
                        if (userBadges.includes(selectedBadge)) {
                            return interaction.update({
                                embeds: [
                                    new EmbedBuilder()
                                        .setDescription(`${emojis.warn} **${targetUser.tag} already has the ${badgeData.name} badge.**`)
                                        .setColor(client.color)
                                ],
                                components: []
                            });
                        }

                        await badgeDB.push(`badges_${targetUser.id}`, selectedBadge);

                        await interaction.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Added ${badgeData.emoji} ${badgeData.name} badge to ${targetUser.tag}.**`)
                                    .setColor(client.color)
                            ],
                            components: []
                        });
                        collector.stop();
                    });

                    collector.on('end', async () => {
                        await messageReply.edit({ components: [] }).catch(() => { });
                    });

                    break;
                }

                const badgeArg = args[2].toLowerCase();
                const badgeEntry = Object.entries(badgeMap).find(
                    ([key, { name }]) => key.toLowerCase() === badgeArg || name.toLowerCase() === badgeArg
                );

                if (!badgeEntry) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Invalid badge. Use \`badge\` to see available badges.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const [badgeKey, badgeData] = badgeEntry;
                const userBadges = await badgeDB.get(`badges_${targetUser.id}`) || [];

                if (userBadges.includes(badgeKey)) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **${targetUser.tag} already has the ${badgeData.name} badge.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await badgeDB.push(`badges_${targetUser.id}`, badgeKey);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Added ${badgeData.emoji} ${badgeData.name} badge to ${targetUser.tag}.**`)
                            .setColor(client.color)
                    ]
                });
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

                const userBadges = await badgeDB.get(`badges_${targetUser.id}`) || [];
                if (userBadges.length === 0) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **${targetUser.tag} doesn't have any badges.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                if (!args[2]) {
                    const badgeButtons = new ActionRowBuilder().addComponents(
                        userBadges.slice(0, 5).map(badgeKey => {
                            const badgeData = badgeMap[badgeKey];
                            return new ButtonBuilder()
                                .setCustomId(badgeKey)
                                .setLabel(badgeData.name)
                                .setEmoji(badgeData.emoji)
                                .setStyle(ButtonStyle.Secondary);
                        }
                        )
                    );

                    const embed = new EmbedBuilder()
                        .setTitle("Remove a Badge")
                        .setDescription(`**Select a badge to remove from ${targetUser.tag}:**`)
                        .setColor(client.color)
                        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }));

                    const messageReply = await message.reply({
                        embeds: [embed],
                        components: [badgeButtons]
                    });

                    const collector = messageReply.createMessageComponentCollector({
                        time: 120000,
                    });

                    collector.on('collect', async (interaction) => {
                        if (interaction.user.id !== message.author.id) {
                            return interaction.reply({
                                content: "You cannot select a badge for this action.",
                                flags: MessageFlags.Ephemeral,
                            });
                        }

                        const selectedBadge = interaction.customId;
                        const badgeData = badgeMap[selectedBadge];

                        await badgeDB.pull(`badges_${targetUser.id}`, selectedBadge);

                        await interaction.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.tick} **Removed ${badgeData.emoji} ${badgeData.name} badge from ${targetUser.tag}.**`)
                                    .setColor(client.color)
                            ],
                            components: []
                        });
                        collector.stop();
                    });

                    collector.on('end', async () => {
                        await messageReply.edit({ components: [] }).catch(() => { });
                    });

                    break;
                }

                const badgeArg = args[2].toLowerCase();
                const badgeEntry = Object.entries(badgeMap).find(
                    ([key, { name }]) => key.toLowerCase() === badgeArg || name.toLowerCase() === badgeArg
                );

                if (!badgeEntry) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Invalid badge. Use \`badge list ${targetUser.id}\` to see their badges.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const [badgeKey, badgeData] = badgeEntry;

                if (!userBadges.includes(badgeKey)) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **${targetUser.tag} doesn't have the ${badgeData.name} badge.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await badgeDB.pull(`badges_${targetUser.id}`, badgeKey);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Removed ${badgeData.emoji} ${badgeData.name} badge from ${targetUser.tag}.**`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'list': {
                const targetUser = message.mentions.users.first() || (args[1] && await client.users.fetch(args[1]).catch(() => null)) || message.author;
                const userBadges = await badgeDB.get(`badges_${targetUser.id}`) || [];

                const embed = new EmbedBuilder()
                    .setAuthor({ name: `${targetUser.tag}'s Badges`, iconURL: targetUser.displayAvatarURL() })
                    .setColor(client.color)
                    .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
                    .setDescription(userBadges.length > 0
                        ? userBadges.map(b => `${badgeMap[b]?.emoji || '❓'} ${badgeMap[b]?.name || b} (\`${b}\`)`).join('\n')
                        : `${emojis.warn} **No badges found for this user.**`
                    );

                return message.reply({ embeds: [embed] });
            }

            default: {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **Invalid subcommand. Use \`badge\` to see available commands.**`)
                            .setColor(client.color)
                    ]
                });
            }
        }
    }
};