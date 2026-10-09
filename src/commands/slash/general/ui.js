import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import emojis from '../../../config/emojis.js';

const badgeEmojis = {
    ActiveDeveloper: emojis.activedev,
    BugHunterLevel1: emojis.bughunter1,
    BugHunterLevel2: emojis.bughunter2,
    PremiumEarlySupporter: emojis.earlysupporter,
    Partner: emojis.partner,
    Staff: emojis.staff,
    HypeSquadOnlineHouse1: emojis.hypesquadbravery,
    HypeSquadOnlineHouse2: emojis.hypesquadbrilliance,
    HypeSquadOnlineHouse3: emojis.hypesquadbalance,
    CertifiedModerator: emojis.CertifiedMod,
    VerifiedDeveloper: emojis.verifieddev,
    VerifiedBot: emojis.verifiedbot,
    BotHTTPInteractions: emojis.bot,
};

export const data = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Shows information about a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to get information about')
                .setRequired(false)
        ),
    /**
     * 
     * @param {import('discord.js').ChatInputCommandInteraction} interaction 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(interaction, client) {
        const target = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild?.members.cache.get(target.id) ||
            await interaction.guild?.members.fetch(target.id).catch(() => null);

        await interaction.deferReply();

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${emojis.loading} **Fetching information for ${target.tag}**`)
                    .setColor(client.color)
            ]
        })

        const createdTimestamp = `<t:${Math.floor(target.createdTimestamp / 1000)}:F> (<t:${Math.floor(target.createdTimestamp / 1000)}:R>)`;
        const joinedTimestamp = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)` : 'Not in this server';

        const flags = target.flags?.toArray() || [];
        const badges = flags.map(flag => badgeEmojis[flag] || flag).join(' ') || 'None';

        let roles = member?.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString());

        const roleCount = roles?.length || 0;
        roles = roles?.slice(0, 10).join(' ') || 'None';
        if (roleCount > 10) roles += ` and ${roleCount - 10} more...`;

        const permissions = member?.permissions.toArray() || [];
        const keyPermissions = permissions
            .filter(p => [
                'Administrator', 'ManageGuild', 'ManageRoles',
                'ManageChannels', 'KickMembers', 'BanMembers',
                'ManageMessages', 'ManageNicknames', 'ManageEmojisAndStickers'
            ].includes(p))
            .map(p => p.replace(/([A-Z])/g, ' $1').trim());

        const embeds = {
            basic: new EmbedBuilder()
                .setAuthor({ name: `${target.tag}'s Information`, iconURL: target.displayAvatarURL({ size: 1024 }) })
                .setDescription(`${emojis.user} __**Basic Information**__\n> **Username**: \`${target.username}\`\n` +
                    `> **Discriminator**: \`${target.discriminator}\`\n` +
                    `> **User ID**: \`${target.id}\`\n` +
                    `> **Account Type**: \`${target.bot ? 'Bot' : 'User'}\`\n` +
                    `> **Badges**: ${badges}\n` +
                    `> **Avatar**: [Link](${target.displayAvatarURL({ size: 2048 })})\n\n` +
                    `${emojis.expire} __**Timestamps**__\n> **Account Created**: ${createdTimestamp}\n` +
                    `> **Joined Server**: ${joinedTimestamp}`)
                .setThumbnail(target.displayAvatarURL({ size: 1024 }))
                .setColor(client.color)
                .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) }),

            server: new EmbedBuilder()
                .setAuthor({ name: `${target.tag}'s Server Information`, iconURL: target.displayAvatarURL({ size: 1024 }) })
                .setDescription(`${emojis.server} __**Server Information**__\n` +
                    `> **Nickname**: \`${member?.nickname || 'None'}\`\n` +
                    `> **Display Name**: \`${member?.displayName || target.username}\`\n` +
                    `> **Server Booster**: \`${member?.premiumSince ? 'Yes' : 'No'}\`\n` +
                    `> **Highest Role**: ${member?.roles.highest || 'None'}\n` +
                    `> **Role Count**: \`${roleCount}\`\n\n` +
                    `${emojis.antinuke} __**Key Permissions**__\n` +
                    `> ${keyPermissions.length ? keyPermissions.map(p => `\`${p}\``).join(', ') : 'None'}\n\n` +
                    `${emojis.role} __**Roles**__\n` +
                    `> ${roles}`)
                .setColor(client.color)
                .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) }),

            other: new EmbedBuilder()
                .setAuthor({ name: `${target.tag}'s Other Information`, iconURL: target.displayAvatarURL({ size: 1024 }) })
                .setDescription(`${emojis.info} __**Other Information**__\n` +
                    `> **Default Avatar**: [Link](${target.defaultAvatarURL})\n` +
                    `> **Banner**: ${target.bannerURL() ? `[Link](${target.bannerURL({ size: 2048 })})` : 'None'}\n` +
                    `> **Accent Color**: \`${target.hexAccentColor || 'Default'}\`\n` +
                    `> **System User**: \`${target.system ? 'Yes' : 'No'}\`\n` +
                    `> **Verified**: \`${target.flags?.has('VerifiedBot') ? 'Yes' : 'No'}\`\n` +
                    `> **MFA Enabled**: \`${target.flags?.has('MFASMS') ? 'Yes' : 'No'}\``)
                .setColor(client.color)
                .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ size: 1024 }) })
                .setImage(target.bannerURL({ size: 2048 }) || null)
        };

        const genRow = (type) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('basic').setLabel('Basic').setStyle(type === 'basic' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(type === 'basic'),
                new ButtonBuilder().setCustomId('server').setLabel('Server').setStyle(type === 'server' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(type === 'server'),
                new ButtonBuilder().setCustomId('other').setLabel('Other').setStyle(type === 'other' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(type === 'other')
            );
        };

        const msg = await interaction.editReply({ embeds: [embeds.basic], components: [genRow('basic')], withResponse: true });

        const collector = msg.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: "Only the command author can use these buttons",
                    flags: MessageFlags.Ephemeral
                });
            }

            await i.update({
                embeds: [embeds[i.customId]],
                components: [genRow(i.customId)]
            });
        });

        collector.on('end', async () => {
            await interaction.editReply({
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('basic').setLabel('Basic').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('server').setLabel('Server').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('other').setLabel('Other').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    )
                ]
            }).catch(() => { });
        });
    }
}