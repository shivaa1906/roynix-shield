import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import emojis from '../../../config/emojis.js';

export const data = {
    data: new SlashCommandBuilder()
    .setName('lockall')
    .setDescription('Locks all text channels in the server')
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for locking all channels')
            .setRequired(false)
    ),
    userPerms: ['ManageChannels', 'ManageRoles'],
    botPerms: ['ManageChannels', 'ManageRoles'],
    async execute(interaction, client) {
        const reason = interaction.options.getString('reason') || "No reason provided";
        const target = interaction.guild.roles.everyone;
    
        const textChannels = interaction.guild.channels.cache.filter(c =>
            c.isTextBased() && 
            !c.isThread() &&
            c.permissionsFor(interaction.guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages)
        );
    
        if (textChannels.size === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **There are no text channels to lock.**`)
                        .setColor(client.color)
                ],
            });
        }
    
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
            );
    
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.delete)
                    .setDisabled(true)
            );
    
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Locking ${textChannels.size} channels...**`)
                    .setColor(client.color)
            ],
        });
    
        let lockedCount = 0;
    
        for (const channel of textChannels.values()) {
            try {
                const botPerms = channel.permissionsFor(interaction.guild.members.me);
                if (!botPerms?.has(PermissionFlagsBits.ManageChannels)) continue;
    
                await channel.permissionOverwrites.edit(target, {
                    SendMessages: false
                });
                lockedCount++;
            } catch {
                continue;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.color)
                    .setThumbnail(interaction.guild.iconURL({ size: 1024 }))
                    .setAuthor({
                        name: "Channels Locked",
                        iconURL: interaction.user.displayAvatarURL({ size: 1024 })
                    })
                    .setDescription(
                        `${emojis.moderator} **Moderator:** ${interaction.user}\n` +
                        `${emojis.channel} **Channels Locked:** ${lockedCount}\n` +
                        `${emojis.reason} **Reason:** ${reason}`
                    )
                    .setFooter({
                        text: `Executed by ${interaction.user.username}`,
                        iconURL: interaction.user.displayAvatarURL({ size: 1024 })
                    })
            ],
            components: [row]
        });
    
        const reply = await interaction.fetchReply();
        const collector = reply.createMessageComponentCollector({ time: 180000 });
    
        collector.on('collect', async (i) => {
            if (!i.isButton() || i.customId !== 'delete') return;
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Only command author can use this button.', flags: MessageFlags.Ephemeral });
            }
            await reply.delete().catch(() => {});
            collector.stop();
        });
    
        collector.on('end', () => {
            reply.edit({ components: [disabledRow] }).catch(() => {});
        });
    }
}

