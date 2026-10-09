import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import config from '../../../config/config.js';

export const data = {
    name: 'invite',
    description: 'Get the invite link for Roynix.',
    options: [],
    /**
     * @param {import('discord.js').CommandInteraction} interaction
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(message, args, client) {
        const inviteEmbed = new EmbedBuilder()
            .setColor(client.color)
            .setAuthor({ 
                name: `${client.user.username} Invite`,
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`Invite ${client.user.username} to your server using the link below:`)
            .setFooter({
                text: `Requested by ${message.author.tag}`,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            });

        const inviteButton = new ButtonBuilder()
            .setLabel('Invite Bot')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=8`);

        const row = new ActionRowBuilder().addComponents(
            inviteButton
        );

        await message.reply({ embeds: [inviteEmbed], components: [row] });
    }
};
