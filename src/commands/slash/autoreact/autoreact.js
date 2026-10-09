import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
} from 'discord.js';
import emojis from '../../../config/emojis.js';
import config from '../../../config/config.js';
import { paginate } from '../../../utils/pagination.js';

/** @type {import('../../../types/command').SlashCommand} */
export const data = {
    data: new SlashCommandBuilder()
        .setName('autoreact')
        .setDescription('Manage autoreact triggers')
        .setDefaultMemberPermissions(0)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add an autoreact trigger')
                .addStringOption(opt =>
                    opt.setName('trigger')
                        .setDescription('The word/phrase to trigger the emoji')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('emoji')
                        .setDescription('The emoji to react with')
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove an autoreact trigger')
                .addStringOption(opt =>
                    opt.setName('trigger')
                        .setDescription('The trigger to remove')
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all autoreact triggers')
        )
        .addSubcommand(sub =>
            sub.setName('reset')
                .setDescription('Reset all autoreact triggers')
        ),

    userPerms: ['Administrator'],
    botPerms: ['Administrator'],

    /**
     * @param {ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const { options, guild, user } = interaction;
        const sub = options.getSubcommand();
        const autoreactDB = client.autoreactDB;
        const customEmojiRegex = /^<a?:\w+:(\d+)>$/;
        const unicodeEmojiRegex = /^\p{Emoji}$/u;
        const allPremiumEntries = await client.premiumGuildDB.all();
        const premiumGuild = allPremiumEntries.some(entry =>
            entry.id.startsWith(`guild_${message.guild.id}_`)
        )

        switch (sub) {
            case 'list': {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.loading} **Please wait**`)
                            .setColor(client.color)
                    ],
                    ephemeral: false
                });

                const allKeys = await autoreactDB.all();
                const autoReacts = allKeys
                    .filter(entry => entry.id.startsWith(`autoreact_${guild.id}_`))
                    .map(entry => ({
                        trigger: entry.id.replace(`autoreact_${guild.id}_`, ""),
                        emoji: entry.value,
                    }));

                if (!autoReacts.length) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoreacts found in this guild**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const itemsPerPage = 5;
                const totalPages = Math.ceil(autoReacts.length / itemsPerPage);

                const generateEmbed = (pageNum) => {
                    const start = pageNum * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageItems = autoReacts.slice(start, end);

                    const embed = new EmbedBuilder()
                        .setTitle("Autoreact Triggers")
                        .setColor(client.color)
                        .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                        .setThumbnail(guild.iconURL({ size: 1024 }));

                    let description = "";
                    pageItems.forEach(item => {
                        description += `**Trigger:** ${item.trigger} — **Emoji:** ${item.emoji}\n`;
                    });

                    embed.setDescription(description || "No triggers found.");
                    return embed;
                };

                await paginate(interaction, autoReacts, itemsPerPage, generateEmbed, true);
                break;
            }

            case 'add': {
                const trigger = options.getString('trigger');
                const emoji = options.getString('emoji');

                if (!customEmojiRegex.test(emoji) && !unicodeEmojiRegex.test(emoji)) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a valid emoji.**`)
                                .setColor(client.color)
                        ],
                        
                    });
                }

                if (customEmojiRegex.test(emoji)) {
                    const emojiId = emoji.match(customEmojiRegex)[1];
                    const isGuildEmoji = guild.emojis.cache.has(emojiId);

                    if (!isGuildEmoji) {
                        return interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **The provided custom emoji does not belong to this guild.**`)
                                    .setColor(client.color)
                            ],
                            
                        });
                    }
                }

                const key = `autoreact_${guild.id}_${trigger}`;
                const exists = await autoreactDB.get(key);

                if (exists !== null && exists !== undefined) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **AutoReact with that trigger already exists**`)
                                .setColor(client.color)
                        ],
                        
                    });
                }

                const allKeys = await autoreactDB.all();
                const guildTriggers = allKeys.filter(entry => entry.id.startsWith(`autoreact_${guild.id}_`));
                const limit = premiumGuild ? 15 : 3;

                if (guildTriggers.length >= limit) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **This guild has reached the maximum number of autoreact triggers.**\n\n` +
                                    `- Premium Guilds: 15 triggers allowed.\n- Non-Premium Guilds: 3 triggers allowed.`)
                                .setColor(client.color)
                        ],
                        components: [
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setLabel('Buy Premium Here !')
                                        .setEmoji(emojis.premium_user)
                                        .setStyle(ButtonStyle.Link)
                                        .setURL(config.links.supportServer)
                                )
                        ],
                        
                    });
                }

                await autoreactDB.set(key, emoji);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoreact trigger added!**\n- Trigger: ${trigger}\n- Emoji: ${emoji}`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'remove': {
                const trigger = options.getString('trigger');
                const key = `autoreact_${guild.id}_${trigger}`;
                const exists = await autoreactDB.get(key);

                if (!exists) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoreact trigger found with that name.**`)
                                .setColor(client.color)
                        ],
                        
                    });
                }

                await autoreactDB.delete(key);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoreact trigger removed!**\nTrigger: ${trigger}`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'reset': {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.loading} **Please wait**`)
                            .setColor(client.color)
                    ]
                });

                const allKeys = await autoreactDB.all();
                const keysToDelete = allKeys
                    .filter(entry => entry.id.startsWith(`autoreact_${guild.id}_`))
                    .map(entry => entry.id);

                if (!keysToDelete.length) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoreact triggers found to reset.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                for (const key of keysToDelete) {
                    await autoreactDB.delete(key);
                }

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **All autoreact triggers have been reset!**`)
                            .setColor(client.color)
                    ]
                });
            }
        }
    }
};
