import { ActivityType, Events } from "discord.js";
import { info } from '../../utils/logger.js';
import premiumCheck from '../../tasks/premiumCheck.js'
import manager from '../../tasks/checkGiveaway.js'
export const data = {
    name: Events.ClientReady, 
    once: true, 
    /**
     * @param {import('../../base/Roynix.js').Roynix} client 
     */
    async execute(client) {
        await client.user.fetch(true).catch(() => null);
        info(`Logged in as ${client.user.tag}`); 

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
