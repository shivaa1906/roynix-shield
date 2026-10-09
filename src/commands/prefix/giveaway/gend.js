import { EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import manager from '../../../tasks/checkGiveaway.js'
export const data = {
    name: 'gend',
    description: 'Ends giveaway',
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
                            `\`gend <messageID>\`\nor reply to the giveaway message and use \`gend\`\n\n` +
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
                        .setDescription(`${emojis.warn} **No giveaway found with that message Id**`)
                        .setColor(client.color)
                ]
            })
        }

        if(giveawayData?.ended) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                       .setDescription(`${emojis.warn} **Giveaway already ended**`)
                       .setColor(client.color)
                ]
            })
        }

        manager.endGiveaway(client, `giveaway_${messageId}`, giveawayData);

        if(giveawayData?.channelId !== message.channelId) {
            message.reply({
                embeds: [
                    new EmbedBuilder()
                      .setDescription(`${emojis.warn} **Giveaway ended Sucessfully**`)
                      .setColor(client.color)
                ]
            })
        }
    }
}