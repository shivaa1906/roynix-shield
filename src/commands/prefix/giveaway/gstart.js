import { EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'gstart',
    description: 'Starts giveaway',
    args: [
        {
            name: 'winners',
            description: 'Number of winners',
            required: true,
        },
        {
            name: 'duration',
            description: 'Duration of giveaway',
            required: true,
        },
        {
            name: 'prize',
            description: 'Prize of giveaway',
            required: true,
        },
    ],
    /** @type {Array<keyof typeof import('discord.js').PermissionsBitField.Flags>} */
    userPerms: ['ManageGuild'],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix.js').Roynix} client 
     */
    async execute(message, args, client) {
        const giveawayDB = client.giveawayDB;
        const winners = parseInt(args[0]);
        const duration = args[1].toLowerCase();
        const prize = args.slice(2).join(" ");

        if (isNaN(winners) || winners < 1 || winners > 10) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                    .setDescription(`${emojis.warn} **Invalid number of winners. Please provide a number between 1 and 10.**`)
                    .setColor(client.color)
                ]
            })
        }

        if (!/^\d+[mhdw]$/.test(duration)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Invalid duration format! Use \`1m\`, \`1h\`, \`1d\`, or \`1w\`.**`)
                        .setColor(client.color)
                ]
            })
        }

         if (!prize.trim()) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Prize cannot be empty.**`)
                        .setColor(client.color)
                ]
            })
        }

        const durationToMs = (duration) => {
            const timeMap = {
                m: 60 * 1000,
                h: 60 * 60 * 1000,
                d: 24 * 60 * 60 * 1000,
                w: 7 * 24 * 60 * 60 * 1000
            };

            const match = duration.match(/^(\d+)([mhdw])$/);
            if (!match) return null;

            const [, value, unit] = match;
            return parseInt(value) * timeMap[unit];
        };

        const durationMs = durationToMs(duration);
        if (!durationMs) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Invalid duration format! Use \`1m\`, \`1h\`, \`1d\`, or \`1w\`.**`)
                        .setColor(client.color)
                ]
            })
        }

        const endTime = Date.now() + durationMs;

        await message.delete().catch(() => { })

        const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle(`${emojis.gift} ${prize} ${emojis.gift}`)
            .setDescription(`${emojis.blue_dot} **Winners:** ${winners}\n` +
                `${emojis.blue_dot} **Ends In:** <t:${Math.floor(endTime / 1000)}:R>\n` +
                `${emojis.blue_dot} **Hosted By:** ${message.author}\n` +
                `${emojis.blue_dot} **React ${emojis.giveaway} To Enter The Giveaway**`
            )
            .setFooter({ text: `Thanks for using Roynix`, iconURL: client.user.avatarURL({ size: 1024 }) })
            .setTimestamp()

            const giveawayMessage = await message.channel.send({ embeds: [embed], content: `${emojis.gift} **New Giveaway** ${emojis.gift}` });
            await giveawayMessage.react(emojis.giveaway).catch(() => { })

            const giveawayData = {
                messageId: giveawayMessage.id,
                channelId: message.channel.id,
                guildId: message.guild.id,
                prize,
                winners,
                host: message.author.id,
                endTime,
                participants: [],
                ended: false
            };

            giveawayDB.set(`giveaway_${giveawayMessage.id}`, giveawayData);
    }
}