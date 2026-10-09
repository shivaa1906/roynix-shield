import { EmbedBuilder, Collection } from "discord.js";
import emojis from '../config/emojis.js';
import { isBotOwner } from "../utils/isBotOwner.js";

/**
 * @param {import("discord.js").Message} message 
 * @param {import("../base/Roynix").Roynix} client
 */
export async function handleAutoResponder(message, client) {
    if (!message.guild || message.author.bot) return;

    const allKeys = await client.autoresponderDB.all();
    const autoResponders = allKeys
        .filter(entry => entry.id.startsWith(`autoresponder_${message.guild.id}_`))
        .map(entry => ({
            trigger: entry.id.replace(`autoresponder_${message.guild.id}_`, ""),
            response: entry.value
        }));

    if (autoResponders.length === 0) return;



    for (const responder of autoResponders) {
        if (message.content.toLowerCase().includes(responder.trigger.toLowerCase())) {
            try {

                const owner = isBotOwner(message.author.id);
                if (!owner) {
                    if (!client.cooldowns.has("autoresponder")) {
                        client.cooldowns.set("autoresponder", new Collection());
                    }

                    const now = Date.now();
                    const timestamps = client.cooldowns.get("autoresponder");
                    const cooldownAmount = 5000;

                    if (timestamps.has(message.author.id)) {
                        const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

                        if (now < expirationTime) {
                            if (!client.cooldownLocks.has(message.author.id)) {
                                const timeLeft = ((expirationTime - now) / 1000).toFixed(1);

                                client.cooldownLocks.set(message.author.id, new Set());
                                const userLocks = client.cooldownLocks.get(message.author.id);
                                userLocks.add("autoresponder");

                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setColor(client.color)
                                            .setDescription(`${emojis.warn} **Cooldown: Wait** \`${timeLeft}s\` **before triggering autoresponses**`)
                                    ]
                                });

                                setTimeout(() => {
                                    userLocks.delete("autoresponder");
                                    if (userLocks.size === 0) {
                                        client.cooldownLocks.delete(message.author.id);
                                    }
                                }, expirationTime - now);
                            }
                            return;
                        }
                    }

                    timestamps.set(message.author.id, now);
                    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
                }

                await message.channel.send({
                    content: responder.response,
                    allowedMentions: { parse: [] }
                });
            } catch (error) {
                console.error(`Failed to send autoresponse for trigger "${responder.trigger}":`, error);
            }
        }
    }
}
