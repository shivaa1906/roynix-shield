import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import emojis from '../../../config/emojis.js';
import manager from '../../../tasks/checkGiveaway.js';
import { paginate } from '../../../utils/pagination.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manage giveaways')
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('Start a new giveaway')
            .addIntegerOption(opt => opt
                .setName('winners')
                .setDescription('Number of winners')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10))
            .addStringOption(opt => opt
                .setName('duration')
                .setDescription('Duration of giveaway (1m, 1h, 1d, 1w)')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('prize')
                .setDescription('Prize for the giveaway')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('end')
            .setDescription('End a giveaway')
            .addStringOption(opt => opt
                .setName('message_id')
                .setDescription('Message ID of the giveaway')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('reroll')
            .setDescription('Reroll a giveaway')
            .addStringOption(opt => opt
                .setName('message_id')
                .setDescription('Message ID of the giveaway')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('joins')
            .setDescription('List giveaway participants')
            .addStringOption(opt => opt
                .setName('message_id')
                .setDescription('Message ID of the giveaway')
                .setRequired(true))),
    /** @type {Array<keyof typeof import('discord.js').PermissionsBitField.Flags>} */
    userPerms: ['ManageGuild'],
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'start') {
            const winners = interaction.options.getInteger('winners');
            const duration = interaction.options.getString('duration');
            const prize = interaction.options.getString('prize');

            if (!/^\d+[mhdw]$/.test(duration)) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} Invalid duration format! Use \`1m\`, \`1h\`, \`1d\`, or \`1w\`.`)
                            .setColor(client.color)
                    ]
                });
            }

            const durationToMs = (duration) => {
                const timeMap = {
                    m: 60 * 1000,
                    h: 60 * 60 * 1000,
                    d: 24 * 60 * 60 * 1000,
                    w: 7 * 24 * 60 * 60 * 1000
                };
                const [, value, unit] = duration.match(/^(\d+)([mhdw])$/);
                return parseInt(value) * timeMap[unit];
            };

            const durationMs = durationToMs(duration);
            const endTime = Date.now() + durationMs;

            const embed = new EmbedBuilder()
                .setColor(client.color)
                .setTitle(`${emojis.gift} ${prize} ${emojis.gift}`)
                .setDescription([
                    `${emojis.blue_dot} **Winners:** ${winners}`,
                    `${emojis.blue_dot} **Ends In:** <t:${Math.floor(endTime / 1000)}:R>`,
                    `${emojis.blue_dot} **Hosted By:** ${interaction.user}`,
                    `${emojis.blue_dot} **React ${emojis.giveaway} To Enter**`
                ].join('\n'))
                .setFooter({ text: 'Giveaway', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            const giveawayMessage = await interaction.channel.send({
                content: `${emojis.gift} **New Giveaway** ${emojis.gift}`,
                embeds: [embed]
            });
            await giveawayMessage.react(emojis.giveaway);

            await client.giveawayDB.set(`giveaway_${giveawayMessage.id}`, {
                messageId: giveawayMessage.id,
                channelId: interaction.channelId,
                guildId: interaction.guildId,
                prize,
                winners,
                host: interaction.user.id,
                endTime,
                participants: [],
                ended: false
            });

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.tick} Giveaway started successfully!`)
                        .setColor(client.color)
                ]
            });
        }

        if (subcommand === 'end') {
            const messageId = interaction.options.getString('message_id');
            const giveawayData = await client.giveawayDB.get(`giveaway_${messageId}`);

            if (!giveawayData) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} Giveaway not found`)
                            .setColor(client.color)
                    ]
                });
            }

            if (giveawayData.ended) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} Giveaway already ended`)
                            .setColor(client.color)
                    ]
                });
            }

            manager.endGiveaway(client, `giveaway_${messageId}`, giveawayData);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.tick} Giveaway ended successfully!`)
                        .setColor(client.color)
                ]
            });
        }

        if (subcommand === 'reroll') {
            const messageId = interaction.options.getString('message_id');
            const giveawayData = await client.giveawayDB.get(`giveaway_${messageId}`);

            if (!giveawayData || !giveawayData.ended) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} Giveaway not found or not ended`)
                            .setColor(client.color)
                    ]
                });
            }

            manager.rerollGiveaway(client, `giveaway_${messageId}`, giveawayData);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.tick} Giveaway rerolled successfully!`)
                        .setColor(client.color)
                ]
            });
        }

        if (subcommand === 'joins') {
            const messageId = interaction.options.getString('message_id');
            const giveawayData = await client.giveawayDB.get(`giveaway_${messageId}`);

            if (!giveawayData) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} Giveaway not found`)
                            .setColor(client.color)
                    ]
                });
            }

            const participants = giveawayData.participants || [];
            if (participants.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} No participants found`)
                            .setColor(client.color)
                    ]
                });
            }

            const itemsPerPage = 10;
            const generateEmbed = (page) => {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                return new EmbedBuilder()
                    .setTitle(`${emojis.giveaway} Participants (${participants.length})`)
                    .setDescription(participants.slice(start, end).map(u => `<@${u}>`).join('\n'))
                    .setColor(client.color)
                    .setFooter({ text: `Page ${page + 1} of ${Math.ceil(participants.length / itemsPerPage)}` });
            };

            await paginate(interaction, participants, itemsPerPage, generateEmbed);
        }
    }
};