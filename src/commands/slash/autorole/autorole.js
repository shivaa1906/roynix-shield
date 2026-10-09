import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import emojis from '../../../config/emojis.js';
import { paginate } from '../../../utils/pagination.js';

export const data = {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Manage automatic role assignment system')
        .addSubcommandGroup(group =>
            group
                .setName('humans')
                .setDescription('Manage roles for human members')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Add a role for humans')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('Role to assign to new humans')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a role from humans list')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('Role to remove from humans list')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('List all human autoroles')
                )
                .addSubcommand(sub =>
                    sub
                        .setName('reset')
                        .setDescription('Reset all human autoroles')
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('bots')
                .setDescription('Manage roles for bot members')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Add a role for bots')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('Role to assign to new bots')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a role from bots list')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('Role to remove from bots list')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('List all bot autoroles')
                )
                .addSubcommand(sub =>
                    sub
                        .setName('reset')
                        .setDescription('Reset all bot autoroles')
                )
        ),
        userPerms: ['Administrator'],
        botPerms: ['Administrator'],
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('../../../base/Roynix').Roynix} client
     */
    async execute(interaction, client) {
        const autoroleDB = client.autoroleDB;
        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        const type = subcommandGroup;
        const allPremiumEntries = await client.premiumGuildDB.all();
        const premium = allPremiumEntries.some(entry =>
            entry.id.startsWith(`guild_${interaction.guild.id}_`)
        )

        const currentData = await autoroleDB.get(`autorole_${interaction.guild.id}`) || {};
        const roles = currentData[type] || [];

        switch (subcommand) {
            case 'add': {
                const role = interaction.options.getRole('role');
                
                if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Cannot add roles with Administrator permission**`)
                                .setColor(client.color)
                        ],
                    });
                }

                if (roles.includes(role.id)) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Role is already in ${type} autoroles**`)
                                .setColor(client.color)
                        ],
                    });
                }

                if(roles.length >= (premium ? 20 : 5)) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **You have reached the maximum number of ${type} autoroles**`)
                                .setColor(client.color)
                        ],
                    });
                }

                

                roles.push(role.id);
                await autoroleDB.set(`autorole_${interaction.guild.id}.${type}`, roles);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Added ${role} to ${type} autoroles**`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'remove': {
                const role = interaction.options.getRole('role');
                
                if (!roles.includes(role.id)) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **Role is not in ${type} autoroles**`)
                                .setColor(client.color)
                        ],
                    });
                }

                const updated = roles.filter(r => r !== role.id);
                await autoroleDB.set(`autorole_${interaction.guild.id}.${type}`, updated);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Removed ${role} from ${type} autoroles**`)
                            .setColor(client.color)
                    ]
                });
            }

            case 'list': {
                if (!roles.length) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No ${type} autoroles configured**`)
                                .setColor(client.color)
                        ],
                    });
                }

                const itemsPerPage = 5;
                const totalPages = Math.ceil(roles.length / itemsPerPage);

                const generateEmbed = (page) => {
                    const start = page * itemsPerPage;
                    const end = start + itemsPerPage;
                    const current = roles.slice(start, end);

                    return new EmbedBuilder()
                        .setTitle(`${type.charAt(0).toUpperCase() + type.slice(1)} Autoroles`)
                        .setDescription(current.map(r => `<@&${r}>`).join('\n') || 'No roles')
                        .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
                        .setColor(client.color);
                };

                await paginate(interaction, roles, itemsPerPage, generateEmbed);
                break;
            }

            case 'reset': {
                if (!roles.length) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`${emojis.warn} **No ${type} autoroles to reset**`)
                                .setColor(client.color)
                        ],
                    });
                }

                await autoroleDB.set(`autorole_${interaction.guild.id}.${type}`, []);
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.tick} **Reset all ${type} autoroles**`)
                            .setColor(client.color)
                    ]
                });
            }
        }
    }
};