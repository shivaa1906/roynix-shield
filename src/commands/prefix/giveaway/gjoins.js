import { EmbedBuilder } from 'discord.js';
import { paginate } from '../../../utils/pagination.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'gjoins',
    description: 'Starts giveaway',
    /** @type {Array<keyof typeof import('discord.js').PermissionsBitField.Flags>} */
    userPerms: ['ManageGuild'],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const messageId = args[0] || (message.reference ? message.reference.messageId : null);

        if (!messageId) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setAuthor({ name: message.author.username, iconURL: message.author.avatarURL({ size: 1024 }) })
                        .setDescription(`${emojis.warn}: **Missing Required Argument**\n\n` +
                            `**Usage:**\n` +
                            `\`gjoins <messageID>\`\nor reply to the giveaway message and use \`gend\`\n\n` +
                            `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``)
                        .setColor(client.color)
                ]
            });
        }

        const giveawayData = await client.giveawayDB.get(`giveaway_${messageId}`)

        if (!giveawayData) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **There is no recent giveaway with that ID**`)
                        .setColor(client.color)
                ]
            })
        }

        const participants = giveawayData.participants || []

        if (participants.length === 0) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                       .setDescription(`${emojis.warn} **There are no participants for this giveaway**`)
                       .setColor(client.color)
                ]
            })
        }

        const itemsPerPage = 5;
        const totalPages = Math.ceil(participants.length / itemsPerPage);

        const generateEmbed = (pageNum) => {
            const start = pageNum * itemsPerPage;
            const end = start + itemsPerPage;
            const pageItems = participants.slice(start, end);

            const embed = new EmbedBuilder()
                .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 1024 })})
                .setTitle(`${emojis.giveaway} Giveaway Participants`)
                .setColor(client.color)
                .setFooter({ text: `Page ${pageNum + 1} of ${totalPages}` })
                .setThumbnail(message.guild.iconURL({ size: 1024 }));

            let description = "";
            pageItems.forEach(m => {
                description += `<@${m}>\n`;
            })

            embed.setDescription(description || "No users found.");
            return embed;
        };


        await paginate(message, participants, itemsPerPage, generateEmbed);
        return;
    }
}