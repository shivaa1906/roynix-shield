import { EmbedBuilder, ActivityType, SlashCommandBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows user Discord status and device information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check status for')
                .setRequired(false)
        ),
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        await interaction.deferReply();

        const user = interaction.options.getUser('user') || interaction.user;

        const member = await interaction.guild.members.fetch({
            user: user.id,
            withPresences: true
        }).catch(() => null);

        if (!member) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Couldn't fetch the user**`)
                        .setColor(client.color)
                ]
            });
        }

        const status = member.presence?.status || 'offline';

        const statusEmojis = {
            online: emojis.online,
            offline: emojis.offline,
            dnd: emojis.dnd,
            idle: emojis.idle
        };

        const clientStatus = member.presence?.clientStatus || {};
        const devices = Object.keys(clientStatus).map(device =>
            `\`${device.charAt(0).toUpperCase() + device.slice(1)}\``
        ).join(', ') || 'None';

        const activities = member.presence?.activities || [];
        let activityText = 'None';

        if (activities.length > 0) {
            activityText = activities.map(activity => {
                switch (activity.type) {
                    case ActivityType.Playing:
                        return `${emojis.reply} Playing \`${activity.name}\``;
                    case ActivityType.Watching:
                        return `${emojis.reply} Watching \`${activity.name}\``;
                    case ActivityType.Listening:
                        return `${emojis.reply} Listening to \`${activity.name}\``;
                    case ActivityType.Streaming:
                        return `${emojis.reply} Streaming \`${activity.name}\``;
                    case ActivityType.Custom:
                        return `${emojis.reply} Custom: \`${activity.state || 'No status'}\``;
                    default:
                        return `\`${activity.name}\``;
                }
            }).join('\n');
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: member.user.username,
                iconURL: member.user.displayAvatarURL({ size: 1024 })
            })
            .setDescription(
                `${emojis.status} **Status:** ${statusEmojis[status]} ${status.toUpperCase()}\n` +
                `${emojis.devices} **Devices:** ${devices}\n` +
                `${emojis.activities} **Activities:**\n${activityText}`
            )
            .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
            .setFooter({
                text: `Requested by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL({ size: 1024 })
            });

        return interaction.editReply({ embeds: [embed] });
    }
};