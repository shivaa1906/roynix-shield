
import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags, Collection } from 'discord.js';
import config from '../../config/config.js';
import emojis from '../../config/emojis.js';
import { isBotOwner } from '../../utils/isBotOwner.js';
import { v4 as uuidv4 } from 'uuid';
import { handleAutoReact } from '../../modules/autoreact.js';
import { handleMediaOnly } from '../../modules/mediaOnly.js';
import { handleAutoResponder } from '../../modules/autoresponder.js';
import handleMessage from '../../modules/afk.js';

export const data = {
    name: Events.MessageCreate,
    once: false,
    /**
     * @param {import('discord.js').Message} message 
     * @param {import('../../base/Roynix.js').Roynix} client 
     * @returns 
     */
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        const owner = isBotOwner(message.author.id);
        const prefix = config.prefix;
        const noprefixDB = client.noprefixDB;
        const guildPrefix = (await client.prefixDB.get(`${message.guild.id}`).catch(() => null)) || prefix;

        await handleAutoReact(message, client);
        if (await handleMediaOnly(message, client)) return;
        await handleMessage(message, client);
        await handleAutoResponder(message, client);

        if (!client.cooldowns) client.cooldowns = new Collection();
        if (!client.cooldownLocks) client.cooldownLocks = new Collection();

        const npData = await noprefixDB.get(`noprefix_${message.author.id}`);
        const isEnabled = npData?.enabled;
        const isExpired = npData?.endTimestamp && Date.now() > npData.endTimestamp;
        const hasNoprefix = isEnabled && (npData.plan === 'Lifetime' || !isExpired);

        if ([`<@${client.user.id}>`, `<@!${client.user.id}>`].includes(message.content.trim())) {
            const embed = new EmbedBuilder()
                .setColor(client.color)
                .setAuthor({ name: client.user.tag, iconURL: client.user.avatarURL({ size: 1024 }) })
                .setDescription(`${emojis.slash} **My prefix is** \`${guildPrefix}\`\n${emojis.info} **Use** \`${guildPrefix}help\` **to see all my commands!**`)
                .setImage(config.banner || client.user.bannerURL({ size: 1024 }) || null)
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setThumbnail(client.user.avatarURL({ size: 1024 }));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Support Server")
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(emojis.server)
                    .setURL(config.links.supportServer),
                new ButtonBuilder()
                    .setLabel("Invite Me")
                    .setEmoji(emojis.invite)
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`),
                new ButtonBuilder()
                    .setEmoji(emojis.delete)
                    .setCustomId('delete')
                    .setStyle(ButtonStyle.Danger),
            );

            const msg = await message.reply({ embeds: [embed], components: [row] });

            const collector = msg.createMessageComponentCollector({ time: 15_000 });

            collector.on('collect', async (i) => {
                if (!i.isButton()) return;
                if (i.user?.id !== message.author.id) return i.reply({ content: 'This is not for you', flags: MessageFlags.Ephemeral });

                if (i.customId === 'delete') {
                    collector.stop();
                    await msg.delete().catch(() => null);
                }
            });

            collector.on('end', async () => {
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel("Support Server")
                        .setStyle(ButtonStyle.Link)
                        .setEmoji(emojis.server)
                        .setURL(config.links.supportServer),
                    new ButtonBuilder()
                        .setLabel("Invite Me")
                        .setEmoji(emojis.invite)
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`),
                    new ButtonBuilder()
                        .setEmoji(emojis.delete)
                        .setCustomId('delete')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true),
                );
                msg.edit({ components: [row2] });
            });
        }

        let args, commandName;
        let usedPrefix = null;
        if (message.content.startsWith(guildPrefix)) {
            usedPrefix = guildPrefix;
        } else if (message.content.startsWith('!')) {
            usedPrefix = '!';
        }

        if (usedPrefix) {
            args = message.content.slice(usedPrefix.length).trim().split(/ +/);
            commandName = args.shift().toLowerCase();
        } else if (hasNoprefix) {
            args = message.content.trim().split(/ +/);
            commandName = args.shift().toLowerCase();
        } else return;

        const command = client.prefix.get(commandName);
        if (!command) return;

        const ignoreData = await client.ignoreDB.get(`ignore_${message.guild.id}`) || { channels: [], bypass: [] };
        if (ignoreData?.channels?.includes(message.channel.id) && !ignoreData?.bypass?.includes(message.author.id)) return;

        if (!owner) {
            if (!client.cooldowns.has(command.name)) {
                client.cooldowns.set(command.name, new Collection());
            }

            const now = Date.now();
            const timestamps = client.cooldowns.get(command.name);
            const cooldownAmount = (command.cooldown || 5) * 1000;

            if (timestamps.has(message.author.id)) {
                const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
                
                if (now < expirationTime) {
                    if (!client.cooldownLocks.has(message.author.id)) {
                        const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                        
                        client.cooldownLocks.set(message.author.id, new Set());
                        const userLocks = client.cooldownLocks.get(message.author.id);
                        userLocks.add(command.name);

                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(client.color)
                                    .setDescription(`${emojis.warn} **Cooldown: Wait** \`${timeLeft}s\` **before using** \`${command.name}\``)
                            ],
                        });

                        setTimeout(() => {
                            userLocks.delete(command.name);
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

        if ((!message.channel.permissionsFor(client.user)?.has(PermissionsBitField.Flags.SendMessages) ||
            !message.channel.permissionsFor(client.user)?.has(PermissionsBitField.Flags.EmbedLinks))) return;
        

        if (command.botOwnerOnly && !owner) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setDescription(`${emojis.cross} **You don't have permission to use this command.**`)
                    .setColor(client.color)]
            });
        }

        if (command.userPerms?.length) {
            const missingPerms = command.userPerms.filter(p => !message.member.permissions.has(PermissionsBitField.Flags[p]));
            if (missingPerms.length && !owner) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setDescription(`${emojis.warn} **You need** \`${missingPerms.join('`, `')}\` **permissions to use this command.**`)
                        .setColor(client.color)]
                });
            }
        }

        if (command.botPerms?.length) {
            const missingPerms = command.botPerms.filter(p => !message.guild.members.me.permissions.has(PermissionsBitField.Flags[p]));
            if (missingPerms.length) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setDescription(`${emojis.warn} **I need** \`${missingPerms.join('`, `')}\` **permissions to use this command.**`)
                        .setColor(client.color)]
                });
            }
        }

        if (command.args?.length) {
            const missingArgs = command.args.filter(arg => arg.required && !args[command.args.indexOf(arg)]);
            if (missingArgs.length > 0) {
                const argList = command.args.map(arg =>
                    `\`${arg.name}\` - ${arg.description} ${arg.required ? '<required>' : '[optional]'}`).join('\n');

                const usageExample = command.args.map(arg =>
                    arg.required ? `<${arg.name}>` : `[${arg.name}]`).join(' ');

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 1024 }) })
                            .setDescription(`${emojis.warn}: **Missing Required Argument**\n\n` +
                                `**Usage:**\n` +
                                `\`\`\`${commandName} ${usageExample}\`\`\`\n` +
                                `**Arguments**\n` +
                                `${argList}\n\n` +
                                `\`\`\`ansi\n[31m<required>[0m [34m[optional][0m\`\`\``)
                            .setColor(client.color)
                    ]
                });
            }
        }

        try {
            await command.execute(message, args, client);
        } catch (error) {
            if (error.code === 50035) return;
            const errorId = uuidv4().split('-')[0];
            const timestamp = new Date().toISOString();

            await client.errorDB.set(`error_${errorId}`, {
                id: errorId,
                command: commandName,
                error: error.stack || error.message,
                user: message.author.id,
                guild: message.guild?.id,
                timestamp,
                args: args.join(' ')
            });

            console.error(`[${errorId}] Error in ${commandName}:`, error);

            await message.reply({
                embeds: [new EmbedBuilder()
                    .setDescription(`${emojis.cross} **An error occurred while using this command.**`)
                    .setFooter({ text: `Error ID: ${errorId} | Please report this to developers` })
                    .setColor(client.color)]
            });
        } finally {
            client.userDB.add(`commandCount_${message.author.id}`, 1).catch(() => null);
        }

        if (npData && isExpired && isEnabled) {
            try {
                await noprefixDB.delete(`noprefix_${message.author.id}`);
                const dm = await message.author.createDM();
                await dm.send({
                    embeds: [new EmbedBuilder()
                        .setDescription(`${emojis.warn} Your NoPrefix access has expired.`)
                        .setColor(client.color)]
                });
            } catch (error) {
                console.error(error);
            }
        }
    }
};
