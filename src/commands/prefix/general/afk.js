import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';
export const data = {
    name: 'afk',
    description: 'Set your AFK status',
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const afkDB = client.afkDB;
        const userId = message.author.id;
        const guildId = message.guild.id;
        const afkStatus = args.join(' ') || 'i\'m AFK!';

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('global_afk')
                .setLabel('Global AFK')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('server_afk')
                .setLabel('Server AFK')
                .setStyle(ButtonStyle.Success),
        );

        const embed = new EmbedBuilder()
            .setAuthor({ name: message.author.username, iconURL: message.author.avatarURL({ size: 1024 }) })
            .setDescription(`${emojis.info} Please choose whether you want to set your AFK status **globally** or **for this server**.`)
            .setColor(client.color);

        const reply = await message.reply({
            embeds: [embed],
            components: [row],
        });

        const filter = (interaction) => interaction.user.id === message.author.id;
        const collector = reply.createMessageComponentCollector({ filter, time: 40000 });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'global_afk') {
                await client.afkDB.set(`global_${message.author.id}`, {
                    reason: afkStatus,
                    timestamp: Date.now(),
                });

                const globalEmbed = new EmbedBuilder()
                    .setAuthor({ name: message.author.username, iconURL: message.author.avatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.tick} You are now **globally AFK**. Reason: **${afkStatus}**`)
                    .setColor(client.color);

                await interaction.update({ embeds: [globalEmbed], components: [] });
            } else if (interaction.customId === 'server_afk') {
                await client.afkDB.set(`server_${message.guild.id}_${message.author.id}`, {
                    reason: afkStatus,
                    timestamp: Date.now(),
                });

                const serverEmbed = new EmbedBuilder()
                    .setAuthor({ name: message.author.username, iconURL: message.author.avatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.tick} You are now **AFK in this server**. Reason: **${afkStatus}**`)
                    .setColor(client.color);

                await interaction.update({ embeds: [serverEmbed], components: [] });
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setAuthor({ name: message.author.username, iconURL: message.author.avatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.warn} AFK setup timed out. Please try again.`)
                    .setColor(client.color);

                await reply.edit({ embeds: [timeoutEmbed], components: [] });
            }
        });
    }
}