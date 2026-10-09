import { Events, ChannelType, PermissionsBitField } from "discord.js";

export const data = {
    name: Events.VoiceStateUpdate,
    once: false,
    async execute(oldState, newState) {
        const client = newState.client;
        const guild = newState.guild;

        const j2cData = await client.j2cDB.get(`j2cData_${guild.id}`);
        if (!j2cData) return;

        if (newState.channelId && newState.channelId === j2cData.channel) {
            const member = newState.member;

            const tempChannel = await guild.channels.create({
                name: `${member.user.username}'s VC`,
                type: ChannelType.GuildVoice,
                parent: j2cData.category || newState.channel.parentId,
                userLimit: j2cData.userLimit || 0,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.ViewChannel,
                        ],
                    },
                ],
            });

            await member.voice.setChannel(tempChannel).catch(() => {});

            await client.activeVcDB.set(tempChannel.id, {
                ownerId: member.id,
                channelId: tempChannel.id,
                guildId: guild.id,
                createdAt: Date.now(),
            });
        }

        const oldChannel = oldState?.channel;
        if (oldChannel) {
            const activeData = await client.activeVcDB.get(oldChannel.id);
            if (activeData && oldChannel.members.size === 0) {
                await oldChannel.delete().catch(() => {});
                await client.activeVcDB.delete(oldChannel.id);
            }
        }
    }
};
