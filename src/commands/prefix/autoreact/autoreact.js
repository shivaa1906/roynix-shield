import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import { paginate } from '../../../utils/pagination.js';
import config from '../../../config/config.js';

export const data = {
    name: 'autoreact',
    aliases: ['ar'],
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    subCommandCount: 4,
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const autoreactDB = client.autoreactDB;
        const subcommand = args[0]?.toLocaleLowerCase();
        const customEmojiRegex = /^<a?:\w+:(\d+)>$/;
        const unicodeEmojiRegex = /^\p{Emoji}$/u;
        const allPremiumEntries = await client.premiumGuildDB.all();
        const premiumGuild = allPremiumEntries.some(entry =>
            entry.id.startsWith(`guild_${message.guild.id}_`)
        )

        switch (subcommand) {
            case 'list': {
                const sentMessage = await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.loading} **Please wait**`)
                            .setColor(client.color)
                    ]
                });

                const allKeys = await client.autoreactDB.all();
                const autoReacts = allKeys
                    .filter(entry => entry.id.startsWith(`autoreact_${message.guildId}_`))
                    .map(entry => ({
                        trigger: entry.id.replace(`autoreact_${message.guildId}_`, ""),
                        emoji: entry.value,
                    }));

                if (autoReacts.length === 0) {
                    return sentMessage.edit({
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
                        .setThumbnail(message.guild.iconURL({ size: 1024 }));

                    let description = "";
                    pageItems.forEach(item => {
                        description += `**Trigger:** ${item.trigger} — **Emoji:** ${item.emoji}\n`;
                    });

                    embed.setDescription(description || "No triggers found.");
                    return embed;
                };

                await paginate(message, autoReacts, itemsPerPage, generateEmbed, false, sentMessage);

                break;
            }

            case 'add': {
                const trigger = args[1];
                const emoji = args[2];
            
                if (!trigger || !emoji) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a trigger and an emoji.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (!customEmojiRegex.test(emoji) && !unicodeEmojiRegex.test(emoji)) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a valid emoji.**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                if (customEmojiRegex.test(emoji)) {
                    const emojiId = emoji.match(customEmojiRegex)[1];
                    const guildEmojis = message.guild.emojis.cache;
                    const isGuildEmoji = guildEmojis.has(emojiId);
            
                    if (!isGuildEmoji) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`${emojis.warn} **The provided custom emoji does not belong to this guild.**`)
                                    .setColor(client.color)
                            ]
                        });
                    }
                }
            
                const key = `autoreact_${message.guildId}_${trigger}`;
                const exists = await autoreactDB.get(key);
                if (exists !== null && exists !== undefined) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **AutoReact with that trigger already exists**`)
                                .setColor(client.color)
                        ]
                    });
                }
            
                const allKeys = await client.autoreactDB.all();
                const guildTriggers = allKeys.filter(entry => entry.id.startsWith(`autoreact_${message.guildId}_`));
            
                const limit = premiumGuild ? 15 : 3;
            
                if (guildTriggers.length >= limit) {
                    return message.reply({
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
                        ]
                    });
                }
            
                await client.autoreactDB.set(key, emoji);
            
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoreact trigger added!**\n- Trigger: ${trigger}\n- Emoji: ${emoji}`)
                            .setColor(client.color)
                    ]
                });
            
            }
            

            case 'remove': {
                const trigger = args[1];

                if (!trigger) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a trigger to remove.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const key = `autoreact_${message.guildId}_${trigger}`;
                const exists = await client.autoreactDB.get(key);

                if (!exists) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoreact trigger found with that name.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await client.autoreactDB.delete(key);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoreact trigger removed!**\nTrigger: ${trigger}`)
                            .setColor(client.color)
                    ]
                });

                break;
            }

            case 'reset': {
                const sentMessage = await message.reply({
                    embeds: [
                        new EmbedBuilder()
                        .setDescription(`${emojis.loading} **Please wait**`)
                        .setColor(client.color)
                    ]
                })
                const allKeys = await client.autoreactDB.all();
                const keysToDelete = allKeys
                    .filter(entry => entry.id.startsWith(`autoreact_${message.guildId}_`))
                    .map(entry => entry.id);

                if (keysToDelete.length === 0) {
                    return sentMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoreact triggers found to reset.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                for (const key of keysToDelete) {
                    await client.autoreactDB.delete(key);
                }

                return sentMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **All autoreact triggers have been reset!**`)
                            .setColor(client.color)
                    ]
                });

                break;
            }

            default:
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix AutoReact', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`autoreact add\`\n└  Adds a new autoreact trigger\n\n` +
                                `- \`autoreact remove\`\n└  Removes an existing autoreact trigger\n\n` +
                                `- \`autoreact list\`\n└  Lists all autoreact triggers\n\n` +
                                `- \`autoreact reset\`\n└  Resets all autoreact triggers`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                });
        }
    }
};
