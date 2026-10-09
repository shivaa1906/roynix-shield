import { EmbedBuilder } from 'discord.js';
import emojis from '../config/emojis.js';
/**
* @param {import('discord.js').Message} message 
* @param {import('../base/Roynix').Roynix} client 
*/
export async function handleMediaOnly(message, client) {
    if (!message.guild) return false;
    
    const mediaDB = client.mediaDB;
    const mediaData = await mediaDB.get(`media_${message.guild.id}`) || {};
    const channels = mediaData?.channels || [];
    const bypass = mediaData?.bypass || [];
    
    if (channels.includes(message.channel.id)) {
        const hasMedia = message.attachments.size > 0 || message.embeds.length > 0;
        const canManage = message.channel.permissionsFor(message.guild.members.me).has('ManageMessages');
        
        if (!hasMedia && !bypass.includes(message.author.id) && canManage) {
            await message.delete().catch(() => null);
            
            if (message.channel.permissionsFor(message.guild.members.me).has('SendMessages')) {
                const msg = await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${emojis.warn} **This channel is reserved for media only!**`)
                            .setColor(client.color)
                    ]
                });
                setTimeout(() => msg.delete().catch(() => null), 5000);
            }

            return true;
        }
    }

    return false;
}
