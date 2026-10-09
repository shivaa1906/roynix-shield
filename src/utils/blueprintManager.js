import { ChannelType } from 'discord.js';

class BlueprintManager {
    constructor() {
        /** @type {Map<string, { channels: Map<string, object>, categories: Map<string, object> }>} */
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
                categories: new Map()
            });
        }
        return this.guildBlueprints.get(guildId);
    }

    /**
     * Capture full guild channel structure into blueprint memory
     * @param {import('discord.js').Guild} guild 
     */
    captureGuild(guild) {
        if (!guild) return;
        const bp = this._getGuildBlueprint(guild.id);

        for (const [_, ch] of guild.channels.cache) {
            this.recordChannel(ch);
        }
    }

    /**
     * Record or update a single channel in the blueprint
     * @param {import('discord.js').GuildChannel} channel 
     */
    recordChannel(channel) {
        if (!channel || !channel.guild || channel.isThread?.()) return;
        const bp = this._getGuildBlueprint(channel.guild.id);

        const overwrites = channel.permissionOverwrites?.cache?.map(ow => ({
            id: ow.id,
            type: ow.type,
            allow: ow.allow.bitfield,
            deny: ow.deny.bitfield
        })) || [];

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
     * Atomically restore a deleted channel with full hierarchical fidelity
     * @param {import('discord.js').Guild} guild 
     * @param {import('discord.js').GuildChannel} channelFallback 
     * @returns {Promise<boolean>}
     */
    async restoreChannelHierarchical(guild, channelFallback) {
        if (!guild || !channelFallback) return false;
        try {
            const guildId = guild.id;
            const channelId = channelFallback.id;
            const snapshot = this.getChannelSnapshot(guildId, channelId);

            const name = snapshot?.name || channelFallback.name;
            const type = snapshot?.type || channelFallback.type;
            const position = snapshot?.position ?? channelFallback.rawPosition ?? 0;
            const rawParentId = snapshot?.parentId || channelFallback.parentId || null;
            const overwrites = channelFallback.permissionOverwrites?.cache || snapshot?.overwrites || [];

            // 1. Hierarchical Category Resolution: Ensure parent category exists
            let targetParentId = null;
            if (rawParentId) {
                // Check if category still exists in guild cache
                const existingParent = guild.channels.cache.get(rawParentId);
                if (existingParent) {
                    targetParentId = existingParent.id;
                } else if (this.recreatedCategories.has(rawParentId)) {
                    // Category was recreated earlier in this nuke burst
                    targetParentId = this.recreatedCategories.get(rawParentId);
                } else {
                    // Parent category was also deleted! Recreate parent category first from blueprint
                    const bp = this._getGuildBlueprint(guildId);
                    const catSnapshot = bp.categories.get(rawParentId);
                    if (catSnapshot) {
                        try {
                            const newCategory = await guild.channels.create({
                                name: catSnapshot.name,
                                type: ChannelType.GuildCategory,
                                position: catSnapshot.position,
                                permissionOverwrites: catSnapshot.overwrites,
                                reason: 'Roynix Time Machine | Blueprint Parent Category Reconstruction'
                            });
                            this.recreatedCategories.set(rawParentId, newCategory.id);
                            targetParentId = newCategory.id;
                            setTimeout(() => this.recreatedCategories.delete(rawParentId), 30000).unref?.();
                        } catch {}
                    }
                }
            }

            // 2. Atomic Channel Recreation based on type
            const baseOptions = {
                name,
                position,
                parent: targetParentId,
                permissionOverwrites: overwrites,
                reason: 'Roynix Time Machine | Atomic Blueprint Channel Restoration'
            };

            switch (type) {
                case ChannelType.GuildText:
                    await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildText,
                        topic: snapshot?.topic || channelFallback.topic || undefined,
                        nsfw: snapshot?.nsfw ?? channelFallback.nsfw ?? false,
                        rateLimitPerUser: snapshot?.rateLimitPerUser || channelFallback.rateLimitPerUser || 0
                    });
                    return true;

                case ChannelType.GuildVoice:
                    await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildVoice,
                        bitrate: snapshot?.bitrate || channelFallback.bitrate || undefined,
                        userLimit: snapshot?.userLimit || channelFallback.userLimit || undefined,
                        rtcRegion: snapshot?.rtcRegion || channelFallback.rtcRegion || undefined
                    });
                    return true;

                case ChannelType.GuildAnnouncement:
                    await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildAnnouncement,
                        topic: snapshot?.topic || channelFallback.topic || undefined,
                        nsfw: snapshot?.nsfw ?? channelFallback.nsfw ?? false
                    });
                    return true;

                case ChannelType.GuildCategory:
                    const newCat = await guild.channels.create({
                        name,
                        type: ChannelType.GuildCategory,
                        position,
                        permissionOverwrites: overwrites,
                        reason: 'Roynix Time Machine | Category Blueprint Restoration'
                    });
                    this.recreatedCategories.set(channelId, newCat.id);
                    setTimeout(() => this.recreatedCategories.delete(channelId), 30000).unref?.();
                    return true;

                case ChannelType.GuildStageVoice:
                    await guild.channels.create({
                        ...baseOptions,
                        type: ChannelType.GuildStageVoice,
                        bitrate: snapshot?.bitrate || channelFallback.bitrate || undefined,
                        userLimit: snapshot?.userLimit || channelFallback.userLimit || undefined
                    });
                    return true;

                default:
                    await guild.channels.create(baseOptions);
                    return true;
            }
        } catch {
            return false;
        }
    }
}

export const blueprintManager = new BlueprintManager();
