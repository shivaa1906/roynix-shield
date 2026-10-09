import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import config from '../../../config/config.js';

export const data = {
    name: 'support',
    description: 'Get support for Roynix.',
    /**
     * @param {import('discord.js').CommandInteraction} interaction
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(message, args, client) {
        const supportEmbed = new EmbedBuilder()
            .setColor(client.color)
            .setAuthor({ 
                name: `${client.user.username} Support`,
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`If you need help, please visit our Support Server`)
            .setFooter({
                text: `Requested by ${message.author.tag}`,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            });

            const supportButton = new ButtonBuilder()
            .setLabel('Support Server')
            .setStyle(ButtonStyle.Link)
            .setURL(config.links.supportServer)

            const row = new ActionRowBuilder().addComponents(
                supportButton
            )

        await message.reply({ embeds: [supportEmbed], components: [row] });

    }
}