import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import emojis from '../config/emojis.js';
import { isCommandAuthorized } from './securityPolicy.js';

/**
 * @param {import('discord.js').Message | import('discord.js').CommandInteraction} context
 * @param {Array} items
 * @param {number} itemsPerPage
 * @param {function(page: number): Promise<EmbedBuilder>} generateEmbed
 */
export async function paginate(context, items, itemsPerPage, generateEmbed, bkl, mc) {
    const timeout = 60000;
    const client = context.client;
    const color = client.color;
    const user = context.user || context.author;
    let page = 0;
    const totalPages = Math.ceil(items.length / itemsPerPage);

    const getRow = (pageNum) => {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('first')
                .setEmoji(emojis.first)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageNum === 0),

            new ButtonBuilder()
                .setCustomId('prev')
                .setEmoji(emojis.prev)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageNum === 0),

            new ButtonBuilder()
                .setCustomId('delete')
                .setEmoji(emojis.delete)
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId('next')
                .setEmoji(emojis.next)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageNum === totalPages - 1),

            new ButtonBuilder()
                .setCustomId('last')
                .setEmoji(emojis.last)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageNum === totalPages - 1)
        );
    };

    const embed = await generateEmbed(page);
    let messageReply;
    if(mc) {
        messageReply = await mc.edit({
            embeds: [embed],
            components: [getRow(page)]
        })
    }
    else if(bkl) {
        messageReply = await context.editReply({
            embeds: [embed],
            components: [getRow(page)],
            withResponse: true
        });
    }
    else if (context.reply) {
        messageReply = await context.reply({
            embeds: [embed],
            components: [getRow(page)],
            withResponse: true
        });
    } else {
        messageReply = await context.channel.send({
            embeds: [embed],
            components: [getRow(page)]
        });
    }

    const collector = messageReply.createMessageComponentCollector({ time: timeout });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== user.id) {
            return interaction.reply({
                content: "You're not allowed to use these buttons.",
                flags: MessageFlags.Ephemeral,
            });
        }

        if (context.guild && client?.antinukeDB) {
            const freshData = await client.antinukeDB.get(`antinukeData_${context.guild.id}`);
            if (freshData && !isCommandAuthorized(context.guild, interaction.user.id, freshData, client)) {
                collector.stop('unauthorized');
                return interaction.reply({
                    content: "Your authorization has been revoked.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        switch (interaction.customId) {
            case 'first':
                page = 0;
                break;
            case 'prev':
                if (page > 0) page--;
                break;
            case 'next':
                if (page < totalPages - 1) page++;
                break;
            case 'last':
                page = totalPages - 1;
                break;
            case 'delete':
                await interaction.message.delete().catch(() => {});
                collector.stop();
                return;
        }

        const newEmbed = await generateEmbed(page);
        await interaction.update({
            embeds: [newEmbed],
            components: [getRow(page)],
        });
    });

    collector.on('end', async () => {
        if (messageReply.editable) {
            await messageReply.edit({ components: [] }).catch(() => {});
        }
    });
}
