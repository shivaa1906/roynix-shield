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
        .setName('autoresponder')
        .setDescription('Manage autoresponder triggers')
        .setDefaultMemberPermissions(0)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add an autoresponder trigger')
                .addStringOption(opt =>
                    opt.setName('trigger')
                        .setDescription('The word/phrase to trigger the response')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('response')
                        .setDescription('The response message to send')
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove an autoresponder trigger')
                .addStringOption(opt =>
                    opt.setName('trigger')
                        .setDescription('The trigger to remove')
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all autoresponder triggers')
        )
        .addSubcommand(sub =>
            sub.setName('reset')
                .setDescription('Reset all autoresponder triggers')
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
        const autoresponderDB = client.autoresponderDB;
        const allPremiumEntries = await client.premiumGuildDB.all();
        const premiumGuild = allPremiumEntries.some(entry =>
            entry.id.startsWith(`guild_${interaction.guild.id}_`)
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

                const allKeys = await autoresponderDB.all();
                const autoResponders = allKeys
                    .filter(entry => entry.id.startsWith(`autoresponder_${guild.id}_`))
                    .map(entry => ({
                        trigger: entry.id.replace(`autoresponder_${guild.id}_`, ""),
                        response: entry.value,
                    }));

                if (!autoResponders.length) {
                    return interaction.editReply({
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
                        .setThumbnail(guild.iconURL({ size: 1024 }));

                    let description = "";
                    pageItems.forEach(item => {
                        description += `**Trigger:** ${item.trigger}\n**Response:** ${item.response}\n\n`;
                    });

                    embed.setDescription(description || "No triggers found.");
                    return embed;
                };

                await paginate(interaction, autoResponders, itemsPerPage, generateEmbed, true);
                break;
            }

            case 'add': {
                const trigger = options.getString('trigger');
                const response = options.getString('response');

                if (!response) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Please provide a valid response message.**`)
                                .setColor(client.color)
                        ],
                        
                    });
                }

                const key = `autoresponder_${guild.id}_${trigger}`;
                const exists = await autoresponderDB.get(key);

                if (exists) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Autoresponder with that trigger already exists**`)
                                .setColor(client.color)
                        ],
                        
                    });
                }

                const allKeys = await autoresponderDB.all();
                const guildTriggers = allKeys.filter(entry => entry.id.startsWith(`autoresponder_${guild.id}_`));
                const limit = premiumGuild ? 15 : 3;

                if (guildTriggers.length >= limit) {
                    return interaction.reply({
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

                await autoresponderDB.set(key, response);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoresponder trigger added!**\n- Trigger: ${trigger}\n- Response: ${response}`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'remove': {
                const trigger = options.getString('trigger');
                const key = `autoresponder_${guild.id}_${trigger}`;
                const exists = await autoresponderDB.get(key);

                if (!exists) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoresponder trigger found with that name.**`)
                                .setColor(client.color)
                        ],
                        
                    });
                }

                await autoresponderDB.delete(key);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Autoresponder trigger removed!**\nTrigger: ${trigger}`)
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

                const allKeys = await autoresponderDB.all();
                const keysToDelete = allKeys
                    .filter(entry => entry.id.startsWith(`autoresponder_${guild.id}_`))
                    .map(entry => entry.id);

                if (!keysToDelete.length) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No autoresponder triggers found to reset.**`)
                                .setColor(client.color)
                        ]
                    });
                }

                for (const key of keysToDelete) {
                    await autoresponderDB.delete(key);
                }

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **All autoresponder triggers have been reset!**`)
                            .setColor(client.color)
                    ]
                });
            }
        }
    }
};