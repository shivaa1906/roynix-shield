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
        const botAvatar = config.avatar || client.user.displayAvatarURL({ dynamic: true });
        const botBanner = config.banner || client.user.bannerURL({ size: 1024 }) || null;
        const supportEmbed = new EmbedBuilder()
            .setColor(client.color)
            .setAuthor({ 
                name: `${client.user.username} Support`,
                iconURL: botAvatar
            })
            .setDescription(`If you need help, please visit our Support Server`)
            .setThumbnail(botAvatar)
            .setImage(botBanner)
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