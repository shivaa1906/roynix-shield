import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
import config from '../../../config/config.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('setprefix') 
        .setDescription('Set the prefix of the bot in this server') 
        .addStringOption(option => 
            option.setName('prefix')
                .setDescription('The new prefix to set (leave empty to reset)')
                .setMaxLength(5) 
                .setRequired(false)
        ),
    userPerms: ['Administrator'], 
    botPerms: [], 
    /**
     * @param {import('discord.js').CommandInteraction} interaction 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(interaction, client) {
        const prefixDB = client.prefixDB; 
        const prefix = interaction.options.getString('prefix'); 

        if (prefix?.length > 5) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Prefix cannot be longer than 5 characters.**`)
                        .setColor(client.color) 
                ],
                 
            });
        }

        if (prefix) {
            await prefixDB.set(interaction.guild.id, prefix);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.tick} **Prefix has been updated to \`${prefix}\`.**`)
                        .setColor(client.color)
                ]
            });
        } else {
            await prefixDB.set(interaction.guild.id, config.prefix);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.tick} **Prefix has been reset to \`${config.prefix}\`.**`)
                        .setColor(config.color)
                ]
            });
        }
    }
};
