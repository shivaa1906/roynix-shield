import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import pkg from '@napi-rs/canvas';
const { createCanvas, loadImage, GlobalFonts } = pkg;
import { join } from "path";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

GlobalFonts.registerFromPath(
  join(__dirname, '..', 'assets', 'fonts', 'Poppins-Bold.ttf'),
  'Poppins'
);

export async function handleWelcome(guild, member, client) {
  const welcomeData = await client.welcomeDB.get(`welcomeData_${guild.id}`) || {};
  if (!welcomeData?.enabled) return;

  const channel = guild.channels.cache.get(welcomeData.channel)
    || await guild.channels.fetch(welcomeData.channel).catch(() => {});
  if (!channel || !channel.isTextBased()) return;

  const message = welcomeData.message;
  if (!message) return;

  const canvas = createCanvas(1024, 450);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 20);
  ctx.fill();

  ctx.font = "bold 60px 'Poppins'";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("WELCOME", canvas.width / 2, 80);

  ctx.font = "32px 'Poppins'";
  ctx.fillStyle = "#808080";
  ctx.fillText(`To ${guild.name}`, canvas.width / 2, 125);

  const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 512 }));
  const avatarX = canvas.width / 2;
  const avatarY = 250;
  const avatarRadius = 100;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 2, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.font = "bold 40px 'Poppins'";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(member.user.tag, avatarX, 400);

  const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'welcome.png' });

  const formatedDescription = message
    .replace(/{user_name}/g, member.user.username)
    .replace(/{user_tag}/g, member.user.tag)
    .replace(/{user_id}/g, member.user.id)
    .replace(/{user_gname}/g, member.user.globalName || member.user.username)
    .replace(/{user_discriminator}/g, member.user.discriminator)
    .replace(/{user_created}/g, `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
    .replace(/{user_mention}/g, member.toString())
    .replace(/{server_name}/g, guild.name)
    .replace(/{server_id}/g, guild.id)
    .replace(/{server_created}/g, `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`)
    .replace(/{server_owner}/g, guild.members.cache.get(guild.ownerId)?.user.tag || 'Unknown')
    .replace(/{server_owner_mention}/g, `<@${guild.ownerId}>`)
    .replace(/{total_members}/g, guild.memberCount.toString())
    .replace(/{human_count}/g, guild.members.cache.filter(m => !m.user.bot).size.toString())
    .replace(/{bot_count}/g, guild.members.cache.filter(m => m.user.bot).size.toString())
    .replace(/{timestamp}/g, `<t:${Math.floor(Date.now() / 1000)}:R>`)
    .replace(/{join_position}/g, guild.memberCount.toString());

  const embed = new EmbedBuilder()
    .setDescription(formatedDescription)
    .setColor(client.color)
    .setImage('attachment://welcome.png')
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setFooter({ text: 'Thanks for joining :3', iconURL: guild.iconURL({ size: 1024 }) });

  await channel.send({ embeds: [embed], files: [attachment], content: `Welcome ${member}` }).catch(() => {});
}
