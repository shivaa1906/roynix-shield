import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    name: 'unmute',
    description: 'Unmute a user in the server.',
    userPerms: ['MuteMembers'],
    botPerms: ['MuteMembers'],
    args: [
        {
            name: 'user',
            description: 'The user to unmute.',
            required: true,
        },
        {
            name: 'reason',
            description: 'The reason for unmuting the user.',
            required: false,
        },
    ],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const user = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.guild.members.fetch(args[0]).catch(() => null);
        const reason = args.slice(1).join(" ") || "None";

        if (!user?.user?.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **Please provide a valid user to unmute.**`)
                ]
            });
        }

        if (!user.isCommunicationDisabled()) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **This user is not muted.**`)
                ]
            });
        }

        if (user.roles.highest.position >= message.member.roles.highest.position && !client.isBotOwner(message.author.id) && message.member.id !== message.guild.ownerId) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **You cannot unmute a member if their highest role is equal to or higher than yours.**`)
                ]
            });
        }

        if (!user.manageable || user.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(client.color)
                        .setDescription(`${emojis.warn} **I cannot unmute this member.**`)
                ]
            })
        }

        await user.timeout(null, `${reason} | Mod: ${interaction.user.username} (${interaction.user.id})`);


        const msg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Unmuted`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setDescription(`${emojis.moderator} **Moderator:** ${message.author}\n` +
                        `${emojis.user} **Target:** ${user}\n` +
                        `${emojis.reason} **Reason:** ${reason}`)
                    .setThumbnail(user.displayAvatarURL({ size: 1024 }))
                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
            ],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 })


        collector.on('collect', async (i) => {
            if (!i.isButton()) return;
            if (i.user.id !== message.author.id) return await i.reply({ content: 'Only command author can use this button.', flags: MessageFlags.Ephemeral })
            if (i.customId === 'delete') {
                await msg.delete().catch(() => { })
                collector.stop()
            }
        })

        collector.on('end', async () => {
            await msg.edit({ components: [disbaledRow] })
        })

    }
};
