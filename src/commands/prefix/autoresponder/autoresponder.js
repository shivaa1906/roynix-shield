import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import { paginate } from '../../../utils/pagination.js';
import config from '../../../config/config.js';

export const data = {
    name: 'autoresponder',
    aliases: ['arsp'],
    userPerms: ['Administrator'],
    botPerms: ['Administrator'],
    description: 'Configure Autoresponder',
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const autoresponderDB = client.autoresponderDB;
        const subcommand = args[0]?.toLocaleLowerCase();
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

                const allKeys = await client.autoresponderDB.all();
                const autoResponders = allKeys
                    .filter(entry => entry.id.startsWith(`autoresponder_${message.guildId}_`))
                    .map(entry => ({
                        trigger: entry.id.replace(`autoresponder_${message.guildId}_`, ""),
                        response: entry.value,
                    }));

                if (autoResponders.length === 0) {
                    return sentMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoresponders found in this guild**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const itemsPerPage = 5;
                const totalPages = Math.ceil(autoResponders.length / itemsPerPage);

                const generateEmbed = (pageNum) => {
                    const start = pageNum * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageItems = autoResponders.slice(start, end);

                    const embed = new EmbedBuilder()
                        .setTitle("Autoresponder Triggers")
                        .setColor(client.color)
                        .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                        .setThumbnail(message.guild.iconURL({ size: 1024 }));

                    let description = "";
                    pageItems.forEach(item => {
                        description += `**Trigger:** ${item.trigger}\n**Response:** ${item.response}\n\n`;
                    });

                    embed.setDescription(description || "No triggers found.");
                    return embed;
                };

                await paginate(message, autoResponders, itemsPerPage, generateEmbed, false, sentMessage);
                break;
            }

            case 'add': {
                const trigger = args[1];
                const response = args.slice(2).join(" ");

                if (!trigger || !response) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a trigger and a response.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const key = `autoresponder_${message.guildId}_${trigger}`;
                const exists = await autoresponderDB.get(key);
                if (exists) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Autoresponder with that trigger already exists**`)
                                .setColor(client.color)
                        ]
                    });
                }

                const allKeys = await client.autoresponderDB.all();
                const guildTriggers = allKeys.filter(entry => entry.id.startsWith(`autoresponder_${message.guildId}_`));

                const limit = premiumGuild ? 15 : 3;

                if (guildTriggers.length >= limit) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **This guild has reached the maximum number of autoresponder triggers.**\n\n` +
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

                await client.autoresponderDB.set(key, response);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoresponder trigger added!**\n- Trigger: ${trigger}\n- Response: ${response}`)
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

                const key = `autoresponder_${message.guildId}_${trigger}`;
                const exists = await client.autoresponderDB.get(key);

                if (!exists) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoresponder trigger found with that name.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                await client.autoresponderDB.delete(key);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoresponder trigger removed!**\nTrigger: ${trigger}`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'reset': {
                const sentMessage = await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.loading} **Please wait**`)
                            .setColor(client.color)
                    ]
                });

                const allKeys = await client.autoresponderDB.all();
                const keysToDelete = allKeys
                    .filter(entry => entry.id.startsWith(`autoresponder_${message.guildId}_`))
                    .map(entry => entry.id);

                if (keysToDelete.length === 0) {
                    return sentMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoresponder triggers found to reset.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                for (const key of keysToDelete) {
                    await client.autoresponderDB.delete(key);
                }

                return sentMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **All autoresponder triggers have been reset!**`)
                            .setColor(client.color)
                    ]
                });
            }

            default:
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: 'Roynix Autoresponder', iconURL: client.user.avatarURL({ size: 1024 }) })
                            .setDescription(
                                `- \`autoresponder add\`\n└  Adds a new autoresponder trigger\n\n` +
                                `- \`autoresponder remove\`\n└  Removes an existing autoresponder trigger\n\n` +
                                `- \`autoresponder list\`\n└  Lists all autoresponder triggers\n\n` +
                                `- \`autoresponder reset\`\n└  Resets all autoresponder triggers`
                            )
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.avatarURL({ size: 1024 }) })
                            .setThumbnail(client.user.avatarURL({ size: 1024 }))
                            .setColor(client.color)
                    ]
                });
        }
    }
};