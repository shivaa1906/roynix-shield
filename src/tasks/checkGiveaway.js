import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import emojis from '../config/emojis.js';

export default {
    async checkGiveaways(client) {
        const giveaways = await client.giveawayDB.all();
        const now = Date.now();

        for (const { id, value } of giveaways) {
            if (value.ended) {
                if (value.endTime && now - value.endTime >= 12 * 60 * 60 * 1000) {
                    await client.giveawayDB.delete(id).catch(() => {});
                }
                continue;
            }

            if (value.endTime && now >= value.endTime) {
                await this.endGiveaway(client, id, value);
            }
        }
    },

    async endGiveaway(client, giveawayId, giveawayData) {
        giveawayData.ended = true;
        giveawayData.endTime = Date.now();
        await client.giveawayDB.set(giveawayId, giveawayData);

        const channel = await client.channels.fetch(giveawayData.channelId).catch(() => null);
        if (!channel) return;

        const message = await channel.messages.fetch(giveawayData.messageId).catch(() => null);
        if (!message || !message.embeds.length) return;

        const winnerIds = giveawayData.participants.length
            ? this.pickWinners(giveawayData.participants, giveawayData.winners)
            : [];

        const giveawayLinkRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Giveaway Message')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${giveawayData.guildId}/${giveawayData.channelId}/${giveawayData.messageId}`)
        );

        if (winnerIds.length) {
            await channel.send({
                content: `Congratulations, ${winnerIds.map(id => `<@${id}>`).join(", ")}! You have won **${emojis.gift} ${giveawayData.prize} ${emojis.gift}**, Hosted By: <@${giveawayData.host}>`,
                components: [giveawayLinkRow]
            }).catch(() => {});
        } else {
            await channel.send({
                content: `No one participated in the giveaway for **${giveawayData.prize}**. Hosted By: <@${giveawayData.host}>.`,
                components: [giveawayLinkRow]
            }).catch(() => {});
        }

        const updatedEmbed = EmbedBuilder.from(message.embeds[0])
            .setColor(client.color)
            .setDescription(
                `${emojis.blue_dot} **Winners:** ${winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(", ") : "No participants"}\n` +
                `${emojis.blue_dot} **Ended:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                `${emojis.blue_dot} **Hosted By:** <@${giveawayData.host}>\n` +
                `${emojis.blue_dot} **Giveaway has ended.**`
            )
            .setFooter({
                text: 'Thanks for using Roynix',
                iconURL: client.user.avatarURL({ size: 1024 })
            });

        await message.edit({
            embeds: [updatedEmbed],
            content: `${emojis.gift} **Giveaway Ended** ${emojis.gift}`
        }).catch(() => {});

        setTimeout(async () => {
            const updatedGiveaway = await client.giveawayDB.get(giveawayId);
            if (updatedGiveaway && updatedGiveaway.ended && Date.now() - updatedGiveaway.endTime >= 12 * 60 * 60 * 1000) {
                await client.giveawayDB.delete(giveawayId).catch(() => {});
            }
        }, 12 * 60 * 60 * 1000);
    },

    pickWinners(participants, numWinners) {
        if (participants.length === 0) return [];

        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }

        return participants.slice(0, Math.min(numWinners, participants.length));
    },

    async rerollGiveaway(client, giveawayId, giveawayData) {
        const channel = await client.channels.fetch(giveawayData.channelId).catch(() => null);
        if (!channel) return;

        const message = await channel.messages.fetch(giveawayData.messageId).catch(() => null);
        if (!message || !message.embeds.length) return;

        const winnerIds = giveawayData.participants.length
            ? this.pickWinners(giveawayData.participants, giveawayData.winners)
            : [];

        if (winnerIds.length) {
            await channel.send(
                `${emojis.giveaway} **Reroll Winners:** ${winnerIds.map(id => `<@${id}>`).join(", ")}! You have won **${emojis.gift} ${giveawayData.prize} ${emojis.gift}**.`
            ).catch(() => {});
        } else {
            await channel.send(
                `No valid winners could be selected for **${giveawayData.prize}**.`
            ).catch(() => {});
        }

        const updatedEmbed = EmbedBuilder.from(message.embeds[0])
            .setColor(client.color)
            .setDescription(
                `${emojis.blue_dot} **New Winners:** ${winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(", ") : "No participants"}\n` +
                `${emojis.blue_dot} **Ended:** <t:${Math.floor(giveawayData.endTime / 1000)}:R>\n` +
                `${emojis.blue_dot} **Hosted By:** <@${giveawayData.host}>\n` +
                `${emojis.blue_dot} **Giveaway has ended.**`
            )
            .setFooter({
                text: 'Thanks for using Roynix',
                iconURL: client.user.avatarURL({ size: 1024 })
            });

        await message.edit({
            embeds: [updatedEmbed],
            content: `${emojis.gift} **Giveaway Ended** ${emojis.gift}`
        }).catch(() => {});
    }
};
