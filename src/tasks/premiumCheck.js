import { EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';

export default async function premiumCheck(client) {
    async function runPremiumCheck() {
        try {
            const now = Date.now();
            const expiredUsers = [];

            const allUsers = await client.premiumDB.all();
            
            for (const entry of allUsers) {
                try {
                    if (!entry.id.startsWith('premium_')) continue;
                    
                    const userId = entry.id.replace('premium_', '');
                    const userData = entry.value;

                    if (userData.endTimestamp && now >= userData.endTimestamp) {
                        const allGuildEntries = await client.premiumGuildDB.all();
                        const userGuildEntries = allGuildEntries.filter(gEntry => 
                            gEntry.id.endsWith(`_${userId}`)
                        );

                        for (const guildEntry of userGuildEntries) {
                            await client.premiumGuildDB.delete(guildEntry.id);
                        }

                        await client.premiumDB.delete(entry.id);
                        expiredUsers.push(userId);

                        const user = await client.users.fetch(userId).catch(() => null);
                        if (user) {
                            const embed = new EmbedBuilder()
                                .setTitle(`${emojis.expire} Premium Subscription Ended`)
                                .setDescription('Your premium subscription has expired')
                                .setColor(client.color)
                                .addFields(
                                    { name: 'Plan', value: userData.plan || 'Unknown', inline: true },
                                    { name: 'Deactivated Servers', value: `${userGuildEntries.length}`, inline: true }
                                )
                                .setFooter({ text: 'Premium System' })
                                .setTimestamp();

                            await user.send({ embeds: [embed] }).catch(() => {});
                        }
                    }
                } catch (error) {
                    console.error(`[Premium] Error processing user ${entry.id}:`, error);
                }
            }

            if (expiredUsers.length > 0) {
                console.log(`[Premium] Cleanup completed - ${expiredUsers.length} users expired`);
            }
        } catch (error) {
            console.error('[Premium] System error:', error);
        }
    }

    await runPremiumCheck();
    
    setInterval(runPremiumCheck, 360); 
    console.log('[Premium] Automatic premium verification system started');
}