import { ActivityType, Events, PermissionFlagsBits } from "discord.js";
import { info } from '../../utils/logger.js';
import config from '../../config/config.js';
import premiumCheck from '../../tasks/premiumCheck.js'
import manager from '../../tasks/checkGiveaway.js'

async function ensureExternalEmojisForGuild(guild) {
    try {
        const everyone = guild.roles?.everyone;
        if (!everyone) return;
        if (!everyone.permissions.has(PermissionFlagsBits.UseExternalEmojis)) {
            await everyone.setPermissions(
                everyone.permissions.add(PermissionFlagsBits.UseExternalEmojis),
                'Enable UseExternalEmojis so Roynix Security custom emojis render'
            ).catch(() => null);
        }
    } catch {}
}

export const data = {
    name: Events.ClientReady, 
    once: true, 
    /**
     * @param {import('../../base/Roynix.js').Roynix} client 
     */
    async execute(client) {
        await client.user.fetch(true).catch(() => null);
        if (config.avatar) {
            client.user.displayAvatarURL = () => config.avatar;
            client.user.avatarURL = () => config.avatar;
        }
        if (config.banner) {
            client.user.bannerURL = () => config.banner;
        }
        info(`Logged in as ${client.user.tag}`); 

        for (const guild of client.guilds.cache.values()) {
            ensureExternalEmojisForGuild(guild);
        }
        client.on(Events.GuildCreate, (guild) => {
            ensureExternalEmojisForGuild(guild);
        });

        client.user.setPresence({
            activities: [
                {
                    name: `Protecting ${client.guilds.cache.size} Servers`,
                    type: ActivityType.Custom,
                },
            ],
            status: "dnd",
        })

        setInterval(() => manager.checkGiveaways(client), 30 * 1000); 


        premiumCheck(client)
    },
};

