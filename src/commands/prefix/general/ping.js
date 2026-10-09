import { EmbedBuilder } from "discord.js";
import getQuickDBPing from "../../../utils/dbPing.js";
import emojis from "../../../config/emojis.js";

export const data = {
    name: 'ping',
    category: 'general',
    aliases: ['pong'],
    description: 'Replies with Pong and the bot\'s latency.',
    /**
     * @param {import("discord.js").Message} message 
     * @param {string[]} args 
     * @param {import("discord.js").Client} client 
     */
    async execute(message, args, client) {
        const apiPing = client.ws.ping;

        const dbPing = await getQuickDBPing();

        const embed = new EmbedBuilder()
            .setAuthor({ name: "Pong!", iconURL: client.user.displayAvatarURL({ size: 1024 }) })
            .setDescription(
                `**Latency:** \`${apiPing}ms\`\n**Database Latency:** \`${dbPing}ms\`\n**Shard ID:** \`${message.guild.shardId}\`\n**Status:** ${emojis.on}`
            )
            .setTimestamp()
            .setFooter({ text: client.user.tag, iconURL: client.user.displayAvatarURL({ size: 1024 })})
            .setColor(client.color)

        return message.reply({ content: null, embeds: [embed] });
    },
};
