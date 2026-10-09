import { EmbedBuilder } from 'discord.js'
import emojis from '../../../config/emojis.js'

export const data = {
    name: 'unbanall',
    description: 'Unbans all banned users in the guild',
    /** @type {Array<keyof typeof import('discord.js').PermissionsBitField.Flags>} */
    userPerms: ['BanMembers'],
    /** @type {Array<keyof typeof import('discord.js').PermissionsBitField.Flags>} */
    botPerms: ['BanMembers'],
    /**
     * 
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const guild = message.guild
        const banList = await guild.bans.fetch()

        if (!banList) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.cross} **Failed to fetch ban list.**`)
                        .setColor(client.color)
                ]
            })
        }

        if (banList.size === 0) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **There are no banned members.**`)
                        .setColor(client.color)
                ]
            })
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
            )

        const disbaledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
                    .setDisabled(true)
            )

        const msg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Unbanning all members.**`)
                    .setColor(client.color)
            ]
        })

        let unbanResults = [];

        for (let bannedUser of banList.values()) {
            try {
                await guild.bans.remove(bannedUser.user.id);
                unbanResults.push(`${bannedUser.user.tag} ${emojis.tick}`);
            } catch (error) {
                unbanResults.push(`${bannedUser.user.tag} ${emojis.cross}`);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        msg.edit({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setAuthor({ name: `Successfully Unbanned Members`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                    .setDescription(unbanResults.join("\n"))
                    .setFooter({ text: `Executed by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
            ],
            components: [row]
        })

        const collector = msg.createMessageComponentCollector({ time: 180000 })

        collector.on('collect', async (i) => {
            if (!i.isButton()) return;
            if(i.user.id !== message.author.id) return await i.reply({ content: 'Only command author can use this button.'})
            if (i.customId === 'delete') {
                await msg.delete().catch(() => {})
                collector.stop()
            }
        })

        collector.on('end', async () => {
            await msg.edit({ components: [disbaledRow]})
        })

        return
    }
}