import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import emojis from '../../../config/emojis.js';
import { isBotOwner } from '../../../utils/isBotOwner.js';

export const data = {
    name: 'unban',
    description: 'Unbans a user by ID.',
    userPerms: ['BanMembers'],
    botPerms: ['BanMembers'],
    category: 'moderation',
    args: [
        {
            name: 'user',
            description: 'User ID to unban',
            required: true
        },
        {
            name: 'reason',
            description: 'Reason for unbanning the user',
            required: false
        }
    ],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const userId = args[0];
        const reason = args.slice(1).join(" ") || "None";

        if (!userId || isNaN(userId)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **Please provide a valid user ID.**`)
                        .setColor(client.color)
                ]
            });
        }

        const banList = await message.guild.bans.fetch().catch(() => null);

        if(!banList) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.cross} **Failed to fetch ban list.**`)
                        .setColor(client.color)
                ]
            });
        }
        const bannedUser = banList?.get(userId);

        if (!bannedUser) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **User is not banned.**`)
                        .setColor(client.color)
                ]
            });
        }

        await message.guild.bans.remove(userId, `${reason} | Mod: ${message.author.username} (${message.author.id})`);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setEmoji(emojis.delete)
                    .setStyle(ButtonStyle.Danger)
            );

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setEmoji(emojis.delete)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

        const msg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Unbanned`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${message.author}\n` +
                        `${emojis.rmv} **Target:** <@${userId}>\n` +
                        `${emojis.reason} **Reason:** ${reason}`)
                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
            ],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ time: 180_000 });

        collector.on('collect', async (i) => {
            if (!i.isButton()) return;
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'Only the command author can use this button.', ephemeral: true });
            }
            if (i.customId === 'delete') {
                await msg.delete().catch(() => {});
                collector.stop();
            }
        });

        collector.on('end', async () => {
            await msg.edit({ components: [disabledRow] });
        });
    }
}
