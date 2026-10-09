import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import config from '../../../config/config.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get the invite link for Roynix.'),
    /**
     * @param {import('discord.js').CommandInteraction} interaction
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const inviteEmbed = new EmbedBuilder()
            .setColor(client.color)
            .setAuthor({ 
                name: `${client.user.username} Invite`,
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`Invite ${client.user.username} to your server using the link below:`)
            .setFooter({
                text: `Requested by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            });

        const inviteButton = new ButtonBuilder()
            .setLabel('Invite Bot')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=8`);

        const row = new ActionRowBuilder().addComponents(
            inviteButton
        );

        await interaction.reply({ embeds: [inviteEmbed], components: [row] });
    }
};
