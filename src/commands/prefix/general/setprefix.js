import { EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import config from '../../../config/config.js';

export const data = {
    name: 'setprefix',
    description: 'Set the prefix of the bot in a guild.',
    userPerms: ['Administrator'],
    category: 'general',
    args: [
        {
            name: 'prefix',
            description: 'The new prefix to set (leave empty to reset)',
            required: false
        }
    ],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix.js').Roynix} client 
     */
    async execute(message, args, client) {
        const prefixDB = client.prefixDB;
        const prefix = args[0]

        if(prefix?.length > 5) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                    .setDescription(`${emojis.warn} **Prefix cannot be longer than 5 characters.**`)
                    .setColor(client.color)
                ]
            })
        }

        if(prefix) {
            await prefixDB.set(`${message.guild.id}`, prefix)

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                    .setDescription(`${emojis.tick} **Prefix has been updated to \`${prefix}\`.**`)
                    .setColor(client.color)
                ]
            })
        } else {
            await prefixDB.set(`${message.guild.id}`, config.prefix)

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                    .setDescription(`${emojis.tick} **Prefix has been reset to \`${config.prefix}\`.**`)
                    .setColor(config.color)
                ]
            })
        }
    }
}