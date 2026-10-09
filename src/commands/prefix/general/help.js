import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
    Message,
} from "discord.js";
import config from "../../../config/config.js";

export const data = {
    name: "help",
    description: "Launch the Roynix Shield Help Menu",
    aliases: ['h', 'commands', 'menu'],
    /**
     * @param {Message} message 
     * @param {String[]} args 
     * @param {import('../../../base/Roynix.js').Roynix} client 
     */
    async execute(message, args, client) {
        const prefix = (await client.prefixDB.get(`${message.guild.id}`)) || config.prefix || '!';

        // Direct command lookup if argument provided
        if (args && args.length > 0) {
            const query = args[0].toLowerCase();
            const cmd = client.prefix.get(query);
            if (cmd) {
                const cmdEmbed = new EmbedBuilder()
                    .setColor(client.color || 0x2b2d31)
                    .setAuthor({
                        name: `${client.user.username} - Command Info`,
                        iconURL: client.user.displayAvatarURL({ size: 1024 }),
                    })
                    .setTitle(`Command: ${cmd.name}`)
                    .setDescription(
                        `**Description:** ${cmd.description || 'No description provided.'}\n` +
                        `**Usage:** \`${prefix}${cmd.name}${cmd.args ? ' ' + cmd.args.map(a => `<${a.name}>`).join(' ') : ''}\`\n` +
                        `**Aliases:** ${cmd.aliases && cmd.aliases.length > 0 ? cmd.aliases.map(a => `\`${a}\``).join(', ') : '*None*'}`
                    )
                    .setFooter({
                        text: `Roynix Shield • Requested by ${message.author.tag}`,
                        iconURL: message.author.displayAvatarURL({ dynamic: true }),
                    })
                    .setTimestamp();

                return message.reply({ embeds: [cmdEmbed] });
            }
        }

        // Subsystems mapping with clean single-line descriptions
        const subsystems = {
            antinuke: {
                title: "Defense Protocols (Antinuke)",
                commands: [
                    { cmd: "antinuke", desc: "Open antinuke interactive dashboard" },
                    { cmd: "antinuke enable", desc: "Enable full anti-nuke protection" },
                    { cmd: "antinuke disable", desc: "Disable anti-nuke protection" },
                    { cmd: "antinuke whitelist <add|remove|show|reset>", desc: "Manage trusted whitelisted moderators" },
                    { cmd: "antinuke extraowner <add|remove|show|reset>", desc: "Manage server extra owners" },
                    { cmd: "antinuke punishment <set|show>", desc: "Set enforcement action (ban/kick/timeout)" },
                    { cmd: "antinuke logging <set|remove>", desc: "Set anti-nuke alerts log channel" },
                    { cmd: "antinuke toggle [module]", desc: "Toggle a module or open interactive menu" },
                    { cmd: "antinuke modules", desc: "Interactive protection module manager" },
                    { cmd: "antinuke config", desc: "View current security settings" },
                ]
            },
            moderation: {
                title: "Moderation Subsystem",
                commands: [
                    { cmd: "ban <user> [reason]", desc: "Ban a member from the server" },
                    { cmd: "unban <id>", desc: "Unban a user from the server" },
                    { cmd: "unbanall", desc: "Unban all banned users" },
                    { cmd: "kick <user> [reason]", desc: "Kick a member from the server" },
                    { cmd: "mute <user> <duration> [reason]", desc: "Apply timeout to a member" },
                    { cmd: "unmute <user>", desc: "Remove timeout from a member" },
                    { cmd: "purge [amount]", desc: "Delete recent messages in channel" },
                    { cmd: "lock [channel]", desc: "Lock channel messaging permissions" },
                    { cmd: "unlock [channel]", desc: "Unlock channel messaging permissions" },
                    { cmd: "lockall", desc: "Lock all channels in the server" },
                    { cmd: "unlockall", desc: "Unlock all channels in the server" },
                    { cmd: "hide [channel]", desc: "Hide channel from members" },
                    { cmd: "unhide [channel]", desc: "Unhide channel for members" },
                    { cmd: "hideall", desc: "Hide all channels in the server" },
                    { cmd: "unhideall", desc: "Unhide all channels in the server" },
                    { cmd: "nick <user> <name>", desc: "Change or reset a member's nickname" },
                    { cmd: "role <add|remove> <user> <role>", desc: "Add or remove a role from a user" },
                ]
            },
            automation: {
                title: "Automation Matrix",
                commands: [
                    { cmd: "automod", desc: "Configure Discord automod protection rules" },
                    { cmd: "autoresponder <add|remove|list>", desc: "Manage automated chat responses" },
                    { cmd: "autorole <add|remove|list>", desc: "Configure automatic roles for new members/bots" },
                    { cmd: "autoreact <add|remove|show|reset>", desc: "Set automated emoji reactions in channels" },
                    { cmd: "ignore <channel|bypass>", desc: "Configure ignored channels and bypass roles" },
                    { cmd: "media <channel|bypass>", desc: "Restrict channels to media-only attachments" },
                ]
            },
            voice: {
                title: "Voice Subsystem",
                commands: [
                    { cmd: "j2c set <channel>", desc: "Setup dynamic Join-to-Create voice generator" },
                    { cmd: "j2c disable", desc: "Disable Join-to-Create voice generator" },
                    { cmd: "vc lock", desc: "Lock your active voice room" },
                    { cmd: "vc unlock", desc: "Unlock your active voice room" },
                    { cmd: "vc mute <user>", desc: "Mute a user in your voice room" },
                    { cmd: "vc unmute <user>", desc: "Unmute a user in your voice room" },
                ]
            },
            community: {
                title: "Community & Engagement",
                commands: [
                    { cmd: "gstart <time> <winners> <prize>", desc: "Start an interactive giveaway" },
                    { cmd: "gend <messageId>", desc: "Conclude an active giveaway immediately" },
                    { cmd: "greroll <messageId>", desc: "Reroll new winners for a giveaway" },
                    { cmd: "gjoins <messageId>", desc: "View participants in a giveaway" },
                    { cmd: "welcome <set|test|disable>", desc: "Configure greeting messages for new members" },
                    { cmd: "activityrole <add|remove|list>", desc: "Assign roles based on games/Spotify status" },
                ]
            },
            utility: {
                title: "System Utilities & Diagnostics",
                commands: [
                    { cmd: "help [command]", desc: "Display help menu or command info" },
                    { cmd: "ping", desc: "Check bot latency, database ping & shard health" },
                    { cmd: "stats", desc: "Display CPU, memory and bot statistics" },
                    { cmd: "status", desc: "Inspect current shard cluster status" },
                    { cmd: "serverinfo", desc: "View detailed server information" },
                    { cmd: "userinfo [user]", desc: "Inspect user account tenure and roles" },
                    { cmd: "avatar [user]", desc: "Get user or server avatar" },
                    { cmd: "banner [user]", desc: "Get user profile banner" },
                    { cmd: "profile [user]", desc: "Display member profile overview" },
                    { cmd: "setprefix <new_prefix>", desc: "Configure custom bot prefix in this server" },
                    { cmd: "logging <set|remove|show>", desc: "Configure audit logging channels" },
                    { cmd: "afk [reason]", desc: "Set AFK status with automated auto-reply" },
                    { cmd: "invite", desc: "Get bot invite authorization link" },
                    { cmd: "support", desc: "Get Roynix Shield support server link" },
                ]
            }
        };

        const buildMainframeEmbed = () => {
            return new EmbedBuilder()
                .setColor(client.color || 0x2b2d31)
                .setAuthor({
                    name: `${client.user.username} - Help Menu`,
                    iconURL: client.user.displayAvatarURL({ size: 1024 }),
                })
                .setDescription(
                    `> **${client.user.username}** — Advanced multi-purpose Discord security, antinuke & server moderation bot.\n\n` +
                    `\`\`\`arm\n` +
                    `[ BOT TELEMETRY ]\n` +
                    `• Prefix  : ! (Server: ${prefix})\n` +
                    `• Shard   : Node #${message.guild.shardId ?? 0} / 2 Active\n` +
                    `• Latency : ${client.ws.ping}ms\n` +
                    `\`\`\`\n` +
                    `*- Select a category from the dropdown menu below to view its commands.*`
                )
                .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
                .setImage(config.banner || client.user.bannerURL({ size: 1024 }) || null)
                .setFooter({
                    text: `${client.user.username} • Requested by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true }),
                })
                .setTimestamp();
        };

        // When a category is selected, ONLY format clean `command - description` lines
        const buildSubsystemEmbed = (key) => {
            const sys = subsystems[key];
            if (!sys) return buildMainframeEmbed();

            const cmdList = sys.commands.map(item => `\`${prefix}${item.cmd}\` - ${item.desc}`).join("\n");

            return new EmbedBuilder()
                .setColor(client.color || 0x2b2d31)
                .setAuthor({
                    name: `${client.user.username} - ${sys.title}`,
                    iconURL: client.user.displayAvatarURL({ size: 1024 }),
                })
                .setDescription(cmdList)
                .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
                .setFooter({
                    text: `${client.user.username} • ${sys.commands.length} Commands • Requested by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true }),
                })
                .setTimestamp();
        };

        const menu = new StringSelectMenuBuilder()
            .setCustomId("roynix_help_menu")
            .setPlaceholder("Select a command category...")
            .addOptions([
                {
                    label: "Overview (Home)",
                    value: "mainframe",
                    description: "Return to the main bot overview",
                    emoji: "🛡️",
                },
                {
                    label: "Defense Protocols",
                    value: "antinuke",
                    description: "Antinuke, whitelists, recovery & audit logging",
                    emoji: "🔒",
                },
                {
                    label: "Moderation Core",
                    value: "moderation",
                    description: "Bans, kicks, timeouts, lockdown & purging",
                    emoji: "⚔️",
                },
                {
                    label: "Automation Matrix",
                    value: "automation",
                    description: "AutoMod, custom auto-replies, autoroles & media",
                    emoji: "🤖",
                },
                {
                    label: "Voice Subsystem",
                    value: "voice",
                    description: "Join-to-Create dynamic voice channels & controls",
                    emoji: "🔊",
                },
                {
                    label: "Engagement Suite",
                    value: "community",
                    description: "Giveaways, welcome notifications & activity roles",
                    emoji: "🎁",
                },
                {
                    label: "System Utilities",
                    value: "utility",
                    description: "Diagnostics, latency probes, server info & config",
                    emoji: "⚙️",
                },
            ]);

        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Support")
                .setStyle(ButtonStyle.Link)
                .setEmoji("🌐")
                .setURL(config.links.supportServer || "https://discord.gg/"),
            new ButtonBuilder()
                .setLabel("Invite")
                .setStyle(ButtonStyle.Link)
                .setEmoji("➕")
                .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot+applications.commands`),
            new ButtonBuilder()
                .setCustomId("roynix_close_session")
                .setLabel("Close")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🗑️")
        );

        const row = new ActionRowBuilder().addComponents(menu);

        const initialEmbed = buildMainframeEmbed();
        const msg = await message.reply({
            embeds: [initialEmbed],
            components: [row, actionButtons],
        });

        const collector = msg.createMessageComponentCollector({
            time: 180_000,
        });

        collector.on("collect", async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({
                    content: `[ACCESS DENIED] This help menu is bound exclusively to ${message.author.tag}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (interaction.isButton() && interaction.customId === "roynix_close_session") {
                collector.stop("terminated");
                await msg.delete().catch(() => null);
                return;
            }

            if (interaction.isStringSelectMenu() && interaction.customId === "roynix_help_menu") {
                const choice = interaction.values[0];
                if (choice === "mainframe") {
                    await interaction.update({
                        embeds: [buildMainframeEmbed()],
                        components: [row, actionButtons],
                    });
                } else {
                    await interaction.update({
                        embeds: [buildSubsystemEmbed(choice)],
                        components: [row, actionButtons],
                    });
                }
            }
        });

        collector.on("end", async (_, reason) => {
            if (reason === "terminated") return;
            const disabledMenu = new ActionRowBuilder().addComponents(
                StringSelectMenuBuilder.from(menu).setDisabled(true).setPlaceholder("Help Menu Expired")
            );
            const disabledButtons = new ActionRowBuilder().addComponents(
                actionButtons.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
            );
            await msg.edit({ components: [disabledMenu, disabledButtons] }).catch(() => null);
        });
    },
};
