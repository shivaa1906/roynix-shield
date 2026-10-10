import { ChannelType, PermissionsBitField, OverwriteType } from 'discord.js';

class BlueprintManager {
    constructor() {
        /** @type {Map<string, { channels: Map<string, object>, categories: Map<string, object>, roles: Map<string, object> }>} */
        this.guildBlueprints = new Map();
        /** @type {Map<string, string>} oldCategoryId -> newlyRecreatedCategoryId (for hierarchical recovery) */
        this.recreatedCategories = new Map();
    }

    /**
     * Get or initialize guild blueprint storage
     * @param {string} guildId 
     */
    _getGuildBlueprint(guildId) {
        if (!this.guildBlueprints.has(guildId)) {
            this.guildBlueprints.set(guildId, {
                channels: new Map(),
                categories: new Map(),
                roles: new Map()
            });
        }
        return this.guildBlueprints.get(guildId);
    }

    /**
     * Capture full guild channel & role structure into blueprint memory
     * @param {import('discord.js').Guild} guild 
     */
    captureGuild(guild) {
        if (!guild) return;
        const bp = this._getGuildBlueprint(guild.id);

        for (const [_, ch] of guild.channels.cache) {
            this.recordChannel(ch);
        }

        for (const [_, role] of guild.roles.cache) {
            this.recordRole(role);
        }
    }

    /**
     * Record or update a single role in the blueprint
     * @param {import('discord.js').Role} role 
     */
    recordRole(role) {
        if (!role || !role.guild || role.managed) return;
        const bp = this._getGuildBlueprint(role.guild.id);

        bp.roles.set(role.id, {
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.rawPosition,
            permissions: role.permissions.bitfield.toString(),
            mentionable: role.mentionable
        });
    }

    /**
     * Record or update a single channel in the blueprint
     * @param {import('discord.js').GuildChannel} channel 
     */
    recordChannel(channel) {
        if (!channel || !channel.guild || channel.isThread?.()) return;
        const bp = this._getGuildBlueprint(channel.guild.id);

        const overwrites = [];
        if (channel.permissionOverwrites?.cache) {
            for (const [id, ow] of channel.permissionOverwrites.cache) {
                overwrites.push({
                    id,
                    type: ow.type,
                    allow: typeof ow.allow?.bitfield === 'bigint' ? ow.allow.bitfield.toString() : String(ow.allow || 0),
                    deny: typeof ow.deny?.bitfield === 'bigint' ? ow.deny.bitfield.toString() : String(ow.deny || 0)
                });
            }
        }

        const data = {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            parentId: channel.parentId || null,
            position: channel.rawPosition ?? 0,
            topic: channel.topic || null,
            nsfw: Boolean(channel.nsfw),
            rateLimitPerUser: channel.rateLimitPerUser || 0,
            bitrate: channel.bitrate || null,
            userLimit: channel.userLimit || null,
            rtcRegion: channel.rtcRegion || null,
            overwrites
        };

        if (channel.type === ChannelType.GuildCategory) {
            bp.categories.set(channel.id, data);
        } else {
            bp.channels.set(channel.id, data);
        }
    }

    /**
     * Retrieve snapshot of a deleted channel
     * @param {string} guildId 
     * @param {string} channelId 
     * @returns {object|null}
     */
    getChannelSnapshot(guildId, channelId) {
        const bp = this.guildBlueprints.get(guildId);
        if (!bp) return null;
        return bp.channels.get(channelId) || bp.categories.get(channelId) || null;
    }

    /**
     * Sanitize permission overwrites so only live roles/members in the guild are passed
     * and all BitFields are clean serializable strings
     * @param {import('discord.js').Guild} guild 
     * @param {Array|Collection} rawOverwrites 
     * @returns {Array<object>}
     */
    _sanitizeOverwrites(guild, rawOverwrites) {
        const safe = [];
        const items = Array.isArray(rawOverwrites) 
            ? rawOverwrites 
            : (rawOverwrites?.values ? Array.from(rawOverwrites.values()) : []);

        for (const ow of items) {
            if (!ow || !ow.id) continue;
            const targetId = ow.id;

            // Must be @everyone, an existing role, or an existing member
            const isEveryone = targetId === guild.id;
            const isRole = guild.roles.cache.has(targetId);
            const isMember = guild.members.cache.has(targetId);

            if (isEveryone || isRole || isMember) {
                const type = (isEveryone || isRole) ? OverwriteType.Role : OverwriteType.Member;
                const allow = typeof ow.allow === 'bigint' 
                    ? ow.allow.toString() 
                    : String(ow.allow?.bitfield ?? ow.allow ?? 0);
                const deny = typeof ow.deny === 'bigint' 
                    ? ow.deny.toString() 
                    : String(ow.deny?.bitfield ?? ow.deny ?? 0);

                safe.push({
                    id: targetId,
                    type,
                    allow,
                    deny
                });
            }
        }
        return safe;
    }

    /**
     * Atomically restore a deleted channel with full hierarchical fidelity and multi-tier fallbacks
     * @param {import('discord.js').Guild} guild 
     * @param {import('discord.js').GuildChannel|object} channelFallback 
     * @returns {Promise<boolean>}
     */
    async restoreChannelHierarchical(guild, channelFallback) {
        if (!guild || !channelFallback) return false;
        const guildId = guild.id;
        const channelId = channelFallback.id;

        try {
            const snapshot = this.getChannelSnapshot(guildId, channelId);

            const name = (snapshot?.name || channelFallback.name || 'recovered-channel').slice(0, 100);
            const type = snapshot?.type ?? channelFallback.type ?? ChannelType.GuildText;
            const position = snapshot?.position ?? channelFallback.rawPosition ?? undefined;
            const rawParentId = snapshot?.parentId || channelFallback.parentId || null;
            
            // 1. Hierarchical Category Resolution: Verify parent exists and is alive
            let targetParentId = null;
            if (rawParentId && type !== ChannelType.GuildCategory) {
                const existingParent = guild.channels.cache.get(rawParentId);
                if (existingParent && existingParent.type === ChannelType.GuildCategory) {
                    targetParentId = existingParent.id;
                } else if (this.recreatedCategories.has(rawParentId)) {
                    const mappedCat = guild.channels.cache.get(this.recreatedCategories.get(rawParentId));
                    if (mappedCat && mappedCat.type === ChannelType.GuildCategory) {
                        targetParentId = mappedCat.id;
                    }
                } else {
                    // Recreate parent category first from blueprint if it was also deleted
                    const bp = this._getGuildBlueprint(guildId);
                    const catSnapshot = bp.categories.get(rawParentId);
                    if (catSnapshot) {
                        try {
                            const catSafeOverwrites = this._sanitizeOverwrites(guild, catSnapshot.overwrites);
                            const newCategory = await guild.channels.create({
                                name: catSnapshot.name.slice(0, 100),
                                type: ChannelType.GuildCategory,
                                position: catSnapshot.position,
                                permissionOverwrites: catSafeOverwrites,
                                reason: 'Roynix Time Machine | Blueprint Parent Category Reconstruction'
                            });
                            this.recreatedCategories.set(rawParentId, newCategory.id);
                            targetParentId = newCategory.id;
                            setTimeout(() => this.recreatedCategories.delete(rawParentId), 45000).unref?.();
                        } catch {}
                    }
                }
            }

            // 2. Build sanitized permission overwrites
            const safeOverwrites = this._sanitizeOverwrites(
                guild, 
                snapshot?.overwrites || channelFallback.permissionOverwrites?.cache || []
            );

            // 3. Primary Atomic Creation
            const baseOptions = {
                name,
                parent: targetParentId || undefined,
                permissionOverwrites: safeOverwrites,
                reason: 'Roynix Time Machine | Channel Auto-Recovery'
            };

            let createdChannel = null;

            switch (type) {
                case ChannelType.GuildText:
                    createdChannel = await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildText,
                        topic: (snapshot?.topic || channelFallback.topic || undefined)?.slice(0, 1024),
                        nsfw: Boolean(snapshot?.nsfw ?? channelFallback.nsfw),
                        rateLimitPerUser: Math.min(snapshot?.rateLimitPerUser || channelFallback.rateLimitPerUser || 0, 21600)
                    });
                    break;

                case ChannelType.GuildVoice:
                    createdChannel = await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildVoice,
                        bitrate: snapshot?.bitrate || channelFallback.bitrate || undefined,
                        userLimit: snapshot?.userLimit || channelFallback.userLimit || undefined,
                        rtcRegion: snapshot?.rtcRegion || channelFallback.rtcRegion || undefined
                    });
                    break;

                case ChannelType.GuildAnnouncement:
                    createdChannel = await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildAnnouncement,
                        topic: (snapshot?.topic || channelFallback.topic || undefined)?.slice(0, 1024),
                        nsfw: Boolean(snapshot?.nsfw ?? channelFallback.nsfw)
                    });
                    break;

                case ChannelType.GuildCategory:
                    createdChannel = await guild.channels.create({
                        name,
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: safeOverwrites,
                        reason: 'Roynix Time Machine | Category Auto-Recovery'
                    });
                    if (createdChannel) {
                        this.recreatedCategories.set(channelId, createdChannel.id);
                        setTimeout(() => this.recreatedCategories.delete(channelId), 45000).unref?.();
                    }
                    break;

                case ChannelType.GuildStageVoice:
                    createdChannel = await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildStageVoice,
                        bitrate: snapshot?.bitrate || channelFallback.bitrate || undefined,
                        userLimit: snapshot?.userLimit || channelFallback.userLimit || undefined
                    });
                    break;

                default:
                    createdChannel = await guild.channels.create(baseOptions);
                    break;
            }

            if (createdChannel) {
                this.recordChannel(createdChannel);
                return true;
            }
            return false;
        } catch (err) {
            // Tier-2 Fallback: If creation failed due to strict constraints, create minimal safe channel
            try {
                const safeName = (channelFallback.name || 'recovered-channel').slice(0, 100);
                const isCat = channelFallback.type === ChannelType.GuildCategory;
                const fallbackChannel = await guild.channels.create({
                    name: safeName,
                    type: isCat ? ChannelType.GuildCategory : ChannelType.GuildText,
                    reason: 'Roynix Time Machine | Resilient Fallback Channel Recovery'
                });
                if (fallbackChannel) {
                    this.recordChannel(fallbackChannel);
                    return true;
                }
            } catch {}
            return false;
        }
    }

    /**
     * Atomically restore a deleted role from blueprint memory
     * @param {import('discord.js').Guild} guild 
     * @param {string|import('discord.js').Role} roleFallback 
     * @returns {Promise<boolean>}
     */
    async restoreRole(guild, roleFallback) {
        if (!guild || !roleFallback) return false;
        try {
            const roleId = typeof roleFallback === 'string' ? roleFallback : roleFallback.id;
            const bp = this._getGuildBlueprint(guild.id);
            const snapshot = bp.roles.get(roleId);

            const name = (snapshot?.name || roleFallback.name || 'recovered-role').slice(0, 100);
            const color = snapshot?.color || roleFallback.color || undefined;
            const hoist = Boolean(snapshot?.hoist ?? roleFallback.hoist);
            const mentionable = Boolean(snapshot?.mentionable ?? roleFallback.mentionable);

            // Safe permissions resolution
            let permissions = undefined;
            if (snapshot?.permissions) {
                permissions = new PermissionsBitField(BigInt(snapshot.permissions));
            } else if (roleFallback.permissions) {
                permissions = roleFallback.permissions;
            }

            // Ensure bot does not grant permissions it doesn't possess
            if (guild.members.me?.permissions && permissions) {
                permissions = permissions.bitfield & guild.members.me.permissions.bitfield;
            }

            const newRole = await guild.roles.create({
                name,
                color,
                hoist,
                mentionable,
                permissions,
                reason: 'Roynix Time Machine | Blueprint Role Auto-Recovery'
            });

            if (newRole) {
                this.recordRole(newRole);
                return true;
            }
            return false;
        } catch {
            // Fallback role creation with base permissions
            try {
                const name = (typeof roleFallback === 'string' ? 'recovered-role' : roleFallback.name || 'recovered-role').slice(0, 100);
                const newRole = await guild.roles.create({
                    name,
                    reason: 'Roynix Time Machine | Safe Fallback Role Auto-Recovery'
                });
                return !!newRole;
            } catch {
                return false;
            }
        }
    }
}

export const blueprintManager = new BlueprintManager();
