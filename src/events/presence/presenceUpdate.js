import {
    ActivityType,
    Events,
    Presence,
    GuildMember,
  } from "discord.js";
  
  export const data = {
    name: Events.PresenceUpdate,
    once: false,
    /**
     * @param {Presence} oldPresence
     * @param {Presence} newPresence
     */
    async execute(oldPresence, newPresence) {
      const activityroleDB = newPresence.client.activityroleDB;
      const guild = newPresence.guild;
      const member = newPresence.member 
  
      if (!guild || !member) return;
  
      const activityData = await activityroleDB.get(`activityrole_${guild.id}`);
      if (!activityData) return;
  
      const activityTypes = {
        [ActivityType.Listening]: "spotify",
        [ActivityType.Watching]: "watching",
        [ActivityType.Playing]: "playing",
        [ActivityType.Streaming]: "streaming",
      };
  
      const newActivities = newPresence.activities ?? [];
      const newActiveTypes = new Set(
        newActivities.map((act) => act.type === ActivityType.Listening && act.name === "Spotify"
          ? "spotify"
          : activityTypes[act.type])
      );
  
      for (const [typeKey, dbKey] of Object.entries(activityTypes)) {
        const roleId = activityData?.[dbKey];
        if (!roleId) continue;
  
        const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => {});
        if (!role) continue;
  
        const hasRole = member.roles.cache.has(role.id);
  
        if (newActiveTypes.has(dbKey)) {
          if (!hasRole) {
            member.roles.add(role).catch(() => {});
          }
        } else {
          if (hasRole) {
            member.roles.remove(role).catch(() => {});
          }
        }
      }
    },
  };
  