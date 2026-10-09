import { Events } from "discord.js";
import { handleWelcome } from '../../functions/handleWelcome.js'
export const data = {
    name: Events.GuildMemberAdd,
    once: false,
    /**
     * @param {import('discord.js').GuildMember} member 
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(member, client) {
        const guild = member.guild;
        if (!guild) return;
        handleWelcome(guild, member, client);
    }
};
