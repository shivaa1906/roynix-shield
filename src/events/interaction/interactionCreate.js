import { Events, EmbedBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import config from '../../config/config.js';
import emojis from '../../config/emojis.js';
import { isBotOwner } from '../../utils/isBotOwner.js';
import { v4 as uuidv4 } from 'uuid';

export const data = {
    name: Events.InteractionCreate,
    once: false,
    /**
     * @param {import('discord.js').Interaction} interaction 
     * @param {import('../../base/Roynix.js').Roynix} client 
     */
    async execute(interaction, client) {
        if (!interaction.isChatInputCommand()) return;
        const isOwner = isBotOwner(interaction.user.id)
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        const ignoreData = await client.ignoreDB.get(`ignore_${interaction.user.id}`);
        if(ignoreData?.channel?.includes(interaction.channel.id) && ignoreData?.user?.includes(interaction.user.id)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You cant use commands here because this channel is in the ignore list**`)
                        .setColor(client.color)
                ],
            });
        }


        if ((!interaction.channel?.permissionsFor(client.user)?.has(PermissionsBitField.Flags.SendMessages) ||
            !interaction.channel?.permissionsFor(client.user)?.has(PermissionsBitField.Flags.EmbedLinks))) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                        .setDescription(`${emojis.warn} **I don't have permissions to send message here**`)
                        .setColor(client.color)
                    ]
                })
            }

        if (command.botOwnerOnly && !isOwner) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`${emojis.cross} **You don't have permission to use this command.**`)
                        .setColor(client.color)
                ],
                
            });
        }

        if (command.userPerms?.length) {
            const missingPerms = command.userPerms.filter(p => 
                !interaction.member.permissions.has(PermissionsBitField.Flags[p])
            );
            
            if (missingPerms.length && !isOwner) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **You need** \`${missingPerms.join('`, `')}\` **permissions to use this command.**`)
                            .setColor(client.color)
                    ],
                    
                });
            }
        }

        if (command.botPerms?.length) {
            const missingPerms = command.botPerms.filter(p => 
                !interaction.guild.members.me.permissions.has(PermissionsBitField.Flags[p])
            );
            
            if (missingPerms.length) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **I need** \`${missingPerms.join('`, `')}\` **permissions to use this command.**`)
                            .setColor(client.color)
                    ],
                    
                });
            }
        }

        try {
            await command.execute(interaction, client);
        } catch (error) {
            const errorId = uuidv4().split('-')[0];
            const timestamp = new Date().toISOString();
            
            await client.errorDB.set(`error_${errorId}`, {
                id: errorId,
                command: interaction.commandName,
                error: error.stack || error.message,
                user: interaction.user.id,
                guild: interaction.guild?.id,
                timestamp,
                options: interaction.options.data.map(opt => ({
                    name: opt.name,
                    value: opt.value,
                    type: opt.type
                }))
            });

            console.error(`[${errorId}] Error in ${interaction.commandName}:`, error);
            
            const errorEmbed = new EmbedBuilder()
                .setDescription(`${emojis.cross} **An error occurred while executing this command.**`)
                .setFooter({ text: `Error ID: ${errorId} | Please report this to developers` })
                .setColor(client.color);

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    embeds: [errorEmbed]
                }).catch(console.error);
            } else {
                await interaction.reply({
                    embeds: [errorEmbed],
                }).catch(console.error);
            }
        }
    }
};