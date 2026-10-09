import { EmbedBuilder } from 'discord.js';
import emojis from '../../config/emojis.js';

export const data = {
    name: 'messageReactionRemove',
    once: false,
    /**
     * @param {import('discord.js').MessageReaction} reaction
     * @param {import('discord.js').User} user
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(reaction, user) {
        if (user.bot) return;

        const giveawayEmojiId = emojis.giveaway.replace(/[^0-9]/g, '');
        if (reaction.emoji.id !== giveawayEmojiId) return;
        const client = user.client;

        const giveawayData = await client.giveawayDB.get(`giveaway_${reaction.message.id}`) || {};
        const guild = client.guilds.cache.get(giveawayData.guildId) || await client.guilds.fetch(giveawayData.guildId).catch(() => null);
        if (!giveawayData || giveawayData.ended) return;

        if (!giveawayData?.participants?.includes(user.id)) return;

        giveawayData.participants = giveawayData.participants.filter(participant => participant !== user.id);
        await client.giveawayDB.set(`giveaway_${reaction.message.id}`, giveawayData);

        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(client.color)
                .setAuthor({
                    name: `${guild.name}`,
                    iconURL: guild.iconURL({ size: 1024 })
                })
                .setTitle(`${emojis.giveaway} Giveaway Entry Removed`)
                .setDescription(`You have been removed from the giveaway. If this was a mistake, you can react again to re-enter.`)
                .addFields(
                    {
                        name: `${emojis.gift} Prize`,
                        value: `${giveawayData.prize}`,
                    },
                    {
                        name: `${emojis.winners} Winners`,
                        value: `${giveawayData.winnerCount || 1}`,
                    },
                    {
                        name: `${emojis.ignore} Message Link`,
                        value: `[Jump to Giveaway](https://discord.com/channels/${reaction.message.guildId}/${reaction.message.channelId}/${reaction.message.id})`
                    }
                )
                .setThumbnail(guild.iconURL({ size: 1024 }))
                .setFooter({
                    text: 'You have been removed from the giveaway.',
                    iconURL: client.user.avatarURL({ size: 1024 })
                });

            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
        }
    }
};
