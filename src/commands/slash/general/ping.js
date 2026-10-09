import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import getQuickDBPing from "../../../utils/dbPing.js";
import emojis from "../../../config/emojis.js";

export const data = {data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong and the bot\'s latency.'),
    async execute(interaction, client) {
        await interaction.deferReply();
    
        const apiPing = client.ws.ping;
        const dbPing = await getQuickDBPing();
    
        const embed = new EmbedBuilder()
            .setAuthor({ name: "Pong!", iconURL: client.user.displayAvatarURL({ size: 1024 }) })
            .setDescription(
                `**Latency:** \`${apiPing}ms\`\n**Database Latency:** \`${dbPing}ms\`\n**Shard ID:** \`${interaction.guild.shardId}\`\n**Status:** ${emojis.on}`
            )
            .setTimestamp()
            .setFooter({ 
                text: client.user.tag, 
                iconURL: client.user.displayAvatarURL({ size: 1024 })
            })
            .setColor(client.color);
    
        return interaction.editReply({ embeds: [embed] });
    }
}