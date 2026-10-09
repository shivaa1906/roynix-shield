import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('unbanall')
        .setDescription('Unbans all banned users in the guild'),
    userPerms: ['BanMembers'],
    botPerms: ['BanMembers'],

    async execute(interaction, client) {
        const guild = interaction.guild;

        await interaction.deferReply();

        const banList = await guild.bans.fetch();

        if (banList.size === 0) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **There are no banned members.**`)
                        .setColor(client.color),
                ],
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emojis.delete)
        );

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emojis.delete)
                .setDisabled(true)
        );

        const msg = await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Unbanning all members.**`)
                    .setColor(client.color),
            ],
            components: [row],
        });

        const unbanResults = [];

        for (const bannedUser of banList.values()) {
            guild.bans.remove(bannedUser.user.id)
                .then(() => {
                    unbanResults.push(`${bannedUser.user.tag} ${emojis.tick}`);
                })
                .catch(() => {
                    unbanResults.push(`${bannedUser.user.tag} ${emojis.cross}`);
                });

            await new Promise(resolve => setTimeout(resolve, 500)); // rate-limit
        }

        await msg.edit({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({
                        name: `Successfully Unbanned Members`,
                        iconURL: interaction.user.displayAvatarURL({ size: 1024 }),
                    })
                    .setDescription(unbanResults.join('\n'))
                    .setFooter({
                        text: `Executed by ${interaction.user.username}`,
                        iconURL: interaction.user.displayAvatarURL({ size: 1024 }),
                    }),
            ],
            components: [row],
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 });

        collector.on('collect', async i => {
            if (!i.isButton()) return;
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: 'Only the command author can use this button.',
                    ephemeral: true,
                });
            }
            if (i.customId === 'delete') {
                await msg.delete().catch(() => {});
                collector.stop();
            }
        });

        collector.on('end', async () => {
            await msg.edit({ components: [disabledRow] }).catch(() => {});
        });
    },
};
