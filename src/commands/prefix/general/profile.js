import { EmbedBuilder } from 'discord.js';
import emojis from '../../../config/emojis.js';

const badgeMap = {
    owner: { name: 'Owner', emoji: emojis.owner },
    developer: { name: 'Developer', emoji: emojis.developer2 },
    coreteam: { name: 'Core Team', emoji: emojis.coreteam2 },
    admin: { name: 'Admin', emoji: emojis.admin },
    staff: { name: 'Staff', emoji: emojis.staff },
    partner: { name: 'Partner', emoji: emojis.partner },
    owner_friend: { name: 'Owner Friend', emoji: emojis.owner_friend },
    bug_hunter: { name: 'Bug Hunter', emoji: emojis.bug_hunter },
};

export const data = {
    name: 'profile',
    aliases: ['pr'],
    /**
     * @param {import('discord.js').Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix').Roynix} client 
     */
    async execute(message, args, client) {
        const targetUser = message.mentions.users.first() || message.author;
        const userId = targetUser.id;

        const [noprefixData, premiumData, badgeData, premiumGuilds] = await Promise.all([
            client.noprefixDB.get(`noprefix_${userId}`),
            client.premiumDB.get(`premium_${userId}`),
            client.badgeDB.get(`badges_${userId}`),
            client.premiumGuildDB.all()
        ]);

        const commandsUsed = await client.userDB.get(`commandCount_${userId}`) || 0;

        const userPremiumGuildCount = premiumGuilds
            .filter(entry => entry.id.startsWith(`guild_`) && entry.id.endsWith(`_${userId}`))
            .length;

        const profileData = {
            user: targetUser,
            noprefix: {
                has: Boolean(noprefixData),
                enabled: noprefixData?.enabled || false,
                plan: noprefixData?.plan || null,
                expires: noprefixData?.endTimestamp || null
            },
            premium: {
                has: Boolean(premiumData),
                plan: premiumData?.plan || null,
                expires: premiumData?.endTimestamp || null,
                guilds: {
                    max: premiumData?.maxGuilds || 0,
                    activated: userPremiumGuildCount
                }
            },
            badges: badgeData || [],
            commandsUsed,
        };

        const noPrefixExpire = profileData?.noprefix?.plan === 'Lifetime' && !profileData?.noprefix?.expires
            ? '**Never**'
            : `<t:${Math.floor(profileData.noprefix?.expires / 1000)}:R>`;

        const premiumExpire = profileData.premium?.plan === 'Lifetime' && !profileData.premium?.expires
            ? '**Never**'
            : `<t:${Math.floor(profileData.premium?.expires / 1000)}:R>`;

        const badgesDisplay = profileData.badges
            .map(badge => {
                const badgeInfo = badgeMap[badge];
                return badgeInfo ? `   - ${badgeInfo.emoji} ${badgeInfo.name}` : null;
            })
            .filter(Boolean)
            .join('\n') || "   - No badges";

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${targetUser.username}'s Profile`, iconURL: targetUser.displayAvatarURL({ size: 1024 }) })
            .setDescription(
                `- ${emojis.badges} **__Badges__**\n${badgesDisplay}\n\n` +
                `- ${emojis.noprefix_user} **__NoPrefix Stats__**\n` +
                `   - ${emojis.status} **Status:** ${profileData.noprefix.has ? `${profileData.noprefix.enabled ? 'Enabled' : 'Disabled'}` : 'You don\'t have noPrefix'}\n` +
                `${profileData.noprefix.has ? `   - ${emojis.plan} **Plan:** ${profileData.noprefix.plan}\n   - ${emojis.expire} **Expires:** ${noPrefixExpire}` : ''}\n\n` +
                `- ${emojis.premium_user} **__Premium Stats__**\n` +
                `   - ${emojis.status} **Status:** ${profileData.premium.has ? 'Active' : 'You don\'t have premium access'}\n` +
                `${profileData.premium.has ? `   - ${emojis.plan} **Plan:** ${profileData.premium.plan}\n   - ${emojis.expire} **Expires:** ${premiumExpire}\n   - ${emojis.server} **Guilds Activated:** ${profileData.premium.guilds.activated}/${profileData.premium.guilds.max}` : ''}\n\n` +
                `- ${emojis.slash} **__Commands Used__**\n   - ${profileData.commandsUsed}`
            )
            .setColor(client.color)
            .setThumbnail(targetUser.displayAvatarURL({ size: 256 }));

        await message.reply({ embeds: [embed] });
    }
};
