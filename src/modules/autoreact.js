/**
 * @param {import("discord.js").Message} message 
 * @param {import("../base/Roynix").Roynix} client
 */
export async function handleAutoReact(message, client) {
    if (!message.guild || message.author.bot) return;

    const allKeys = await client.autoreactDB.all();
    const autoReacts = allKeys
        .filter(entry => entry.id.startsWith(`autoreact_${message.guild.id}_`))
        .map(entry => ({
            trigger: entry.id.replace(`autoreact_${message.guild.id}_`, ""),
            emoji: entry.value
        }));

    if (autoReacts.length === 0) return;

    for (const reactionEntry of autoReacts) {
        if (message.content.toLowerCase().includes(reactionEntry.trigger.toLowerCase())) {
            let emoji = reactionEntry.emoji;

            const unicodeEmojiRegex = /\p{Extended_Pictographic}/u;
            if (unicodeEmojiRegex.test(emoji)) {
                await message.react(emoji).catch(() => {}); 
                continue;
            }

            const customEmoji = message.guild.emojis.cache.find(e => e.toString() === emoji || e.id === emoji.replace(/\D/g, ""));
            if (customEmoji) {
                await message.react(customEmoji).catch(() => {}); 
            }
        }
    }
}
