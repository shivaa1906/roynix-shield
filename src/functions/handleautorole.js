import { Guild, GuildManager } from "discord.js";
import { Roynix } from "../base/Roynix.js";

/**
 * 
 * @param {Guild} guild 
 * @param {GuildManager} member 
 * @param {Roynix} client 
 */
export async function handleAutoRole(guild, member, client) {
    const autoroleData = await client.autoroleDB.get(`autoroleData_${guild.id}`) || {};

    const botAutoroles = autoroleData.bots || [];
    const humanAutoroles = autoroleData.humans || [];

    const isBot = member.user.bot;

    const rolesToAdd = isBot ? botAutoroles : humanAutoroles;
    if (!rolesToAdd || rolesToAdd.length === 0) return;

    rolesToAdd.forEach(r => {
        role = guild.roles.cache.get(r) || guild.roles.fetch(r).catch(() => {});
        if (role) {
            setTimeout(() => {
                member.roles.add(role).catch(() => {});
            }, 1000);
        }
    });
}