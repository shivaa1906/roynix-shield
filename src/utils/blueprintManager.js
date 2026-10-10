import { ChannelType, PermissionsBitField, OverwriteType } from 'discord.js';
import { circuitBreaker } from './circuitBreaker.js';

function toEntriesArray(collectionOrMap) {
    if (!collectionOrMap) return [];
    if (Array.isArray(collectionOrMap)) return collectionOrMap;
    if (typeof collectionOrMap.values === 'function') return Array.from(collectionOrMap.values());
    return [];
}

class BlueprintManager {
    constructor() {
        /** @type {Map<string, { channels: Map<string, object>, categories: Map<string, object>, roles: Map<string, object>, lastCapturedAt?: number }>} */
        this.guildBlueprints = new Map();
        /** @type {Map<string, string>} oldCategoryId -> newlyRecreatedCategoryId */
        this.recreatedCategories = new Map();
        /** @type {Map<string, Promise<string|null>>} oldCategoryId -> in-flight category creation promise */
        this.pendingCategories = new Map();
        /** @type {Map<string, string>} oldRoleId -> newlyRecreatedRoleId */
        this.recreatedRoles = new Map();
        /** @type {Map<string, Promise<boolean>>} oldRoleId -> in-flight role creation promise */
        this.pendingRoles = new Map();
        /** @type {Map<string, string>} oldChannelId -> newlyRecreatedChannelId */
        this.recreatedChannels = new Map();
        /** @type {Map<string, Promise<boolean>>} oldChannelId -> in-flight channel creation promise */
        this.pendingChannels = new Map();
        /** @type {Map<string, string>} liveChannelId -> originalCategoryId (for re-attaching orphaned children) */
        this.channelParentOrigin = new Map();
        this.maxMappingEntries = 2000;
    }

    /**
     * Bound internal ID-remapping and parent-origin maps to prevent unbounded growth.
     * @param {number} [maxEntries]
     */
    sweep(maxEntries = this.maxMappingEntries) {
        const capMap = (map) => {
            while (map.size > maxEntries) {
                const oldestKey = map.keys().next().value;
                if (oldestKey === undefined) break;
                map.delete(oldestKey);
            }
        };
        capMap(this.recreatedCategories);
        capMap(this.recreatedRoles);
        capMap(this.recreatedChannels);
        capMap(this.channelParentOrigin);
    }

    /**
     * Remove stored blueprint and parent mappings when a guild leaves.
     * @param {string} guildId
     */
    removeGuildBlueprint(guildId) {
        if (!guildId) return false;
        const bp = this.guildBlueprints.get(guildId);
        if (bp) {
            for (const chId of bp.channels.keys()) {
                this.channelParentOrigin.delete(chId);
                this.recreatedChannels.delete(chId);
            }
            for (const catId of bp.categories.keys()) {
                this.recreatedCategories.delete(catId);
            }
            for (const roleId of bp.roles.keys()) {
                this.recreatedRoles.delete(roleId);
            }
        }
        return this.guildBlueprints.delete(guildId);
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
                roles: new Map(),
                lastCapturedAt: 0
            });
        }
        return this.guildBlueprints.get(guildId);
    }

    /**
     * Validate structural integrity of a channel candidate before snapshot persistence
     * @param {any} channel
     * @returns {boolean}
     */
    isValidChannel(channel) {
        if (!channel || typeof channel !== 'object') return false;
        if (channel.isThread?.()) return false;
        if (!channel.guild?.id || typeof channel.id !== 'string' || !channel.id.trim()) return false;
        if (typeof channel.name !== 'string' || !channel.name.trim()) return false;
        return true;
    }

    /**
     * Validate structural integrity of a role candidate before snapshot persistence
     * @param {any} role
     * @returns {boolean}
     */
    isValidRole(role) {
        if (!role || typeof role !== 'object') return false;
        if (!role.guild?.id || typeof role.id !== 'string' || !role.id.trim()) return false;
        if (role.managed || role.id === role.guild.id) return false;
        if (typeof role.name !== 'string' || !role.name.trim()) return false;
        return true;
    }

    /**
     * Retry helper for resilient execution under heavy big-server nuke load
     * @template T
     * @param {() => Promise<T>} fn
     * @param {number} retries
     * @returns {Promise<T>}
     */
    async _withRetry(fn, retries = 3) {
        let lastErr;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastErr = err;
                const waitMs = err?.retry_after ? Math.ceil(err.retry_after * 1000) : (400 * (attempt + 1));
                await new Promise(r => setTimeout(r, waitMs));
            }
        }
        throw lastErr;
    }

    /**
     * Capture full guild channel & role structure into blueprint memory with anti-poisoning protection.
     * Refuses to overwrite a healthy snapshot during an active lockdown or when >30% of resources
     * have disappeared unless `options.force === true`.
     *
     * @param {import('discord.js').Guild} guild
     * @param {{ force?: boolean }} [options]
     * @returns {boolean} True if full snapshot capture was applied
     */
    captureGuild(guild, options = {}) {
        if (!guild?.id) return false;
        const force = Boolean(options.force);

        if (!force && circuitBreaker.isLockedDown(guild.id)) {
            return false;
        }

        const bp = this._getGuildBlueprint(guild.id);
        const existingChannelCount = bp.channels.size + bp.categories.size;
        const existingRoleCount = bp.roles.size;

        const validChannels = toEntriesArray(guild.channels?.cache).filter((ch) => this.isValidChannel(ch));
        const validRoles = toEntriesArray(guild.roles?.cache).filter((r) => this.isValidRole(r));

        const channelDropTooLarge =
            existingChannelCount >= 3 && validChannels.length < Math.ceil(existingChannelCount * 0.7);
        const roleDropTooLarge =
            existingRoleCount >= 3 && validRoles.length < Math.ceil(existingRoleCount * 0.7);

        if (!force && (channelDropTooLarge || roleDropTooLarge)) {
            for (const ch of validChannels) {
                this.seedChannelIfMissing(ch);
            }
            for (const role of validRoles) {
                this.seedRoleIfMissing(role);
            }
            return false;
        }

        for (const ch of validChannels) {
            this.recordChannel(ch, null, { trusted: true });
        }
        for (const role of validRoles) {
            this.recordRole(role, { trusted: true });
        }
        bp.lastCapturedAt = Date.now();
        return true;
    }

    /**
     * Seed a role into the blueprint only if no snapshot currently exists for it.
     * Prevents unverified `roleUpdate` events from overwriting pre-attack state.
     * @param {import('discord.js').Role} role
     */
    seedRoleIfMissing(role) {
        if (!this.isValidRole(role)) return false;
        const bp = this._getGuildBlueprint(role.guild.id);
        if (bp.roles.has(role.id)) return false;
        return this.recordRole(role, { trusted: true });
    }

    /**
     * Record or update a single role in the blueprint (including cached member IDs holding the role)
     * @param {import('discord.js').Role} role
     * @param {{ trusted?: boolean, fromRecovery?: boolean }} [options]
     */
    recordRole(role, options = {}) {
        if (!this.isValidRole(role)) return false;
        const guildId = role.guild.id;
        const bp = this._getGuildBlueprint(guildId);
        const existing = bp.roles.get(role.id);

        if (existing && !options.trusted && !options.fromRecovery && circuitBreaker.isLockedDown(guildId)) {
            return false;
        }

        const memberIds = [];
        if (role.members) {
            if (typeof role.members.keys === 'function') {
                for (const memberId of role.members.keys()) {
                    memberIds.push(memberId);
                }
            } else if (Symbol.iterator in Object(role.members)) {
                for (const entry of role.members) {
                    const id = Array.isArray(entry) ? entry[0] : entry?.id;
                    if (id) memberIds.push(id);
                }
            }
        }

        const permValue = typeof role.permissions?.bitfield === 'bigint'
            ? role.permissions.bitfield.toString()
            : String(role.permissions ?? existing?.permissions ?? '0');

        bp.roles.set(role.id, {
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: Boolean(role.hoist),
            position: role.rawPosition ?? role.position ?? existing?.position ?? 0,
            permissions: permValue,
            mentionable: Boolean(role.mentionable),
            memberIds: memberIds.length > 0 ? memberIds : (existing?.memberIds || []),
            updatedAt: Date.now()
        });
        return true;
    }

    /**
     * Remove a role snapshot when intentionally deleted by a trusted actor
     * @param {string} guildId
     * @param {string} roleId
     */
    removeRoleSnapshot(guildId, roleId) {
        const bp = this.guildBlueprints.get(guildId);
        if (!bp) return false;
        return bp.roles.delete(roleId);
    }

    /**
     * Seed a channel into the blueprint only if no snapshot currently exists for it.
     * Prevents unverified `channelUpdate` events from overwriting pre-attack state.
     * @param {import('discord.js').GuildChannel} channel
     */
    seedChannelIfMissing(channel) {
        if (!this.isValidChannel(channel)) return false;
        const bp = this._getGuildBlueprint(channel.guild.id);
        const exists = channel.type === ChannelType.GuildCategory
            ? bp.categories.has(channel.id)
            : bp.channels.has(channel.id);
        if (exists) return false;
        return this.recordChannel(channel, null, { trusted: true });
    }

    /**
     * Record or update a single channel in the blueprint
     * @param {import('discord.js').GuildChannel} channel
     * @param {string} [originParentId]
     * @param {{ trusted?: boolean, fromRecovery?: boolean }} [options]
     */
    recordChannel(channel, originParentId = null, options = {}) {
        if (!this.isValidChannel(channel)) return false;
        const guildId = channel.guild.id;
        const bp = this._getGuildBlueprint(guildId);
        const isCat = channel.type === ChannelType.GuildCategory;
        const existing = isCat ? bp.categories.get(channel.id) : bp.channels.get(channel.id);

        if (existing && !options.trusted && !options.fromRecovery && circuitBreaker.isLockedDown(guildId)) {
            return false;
        }

        const overwrites = [];
        const rawCache = channel.permissionOverwrites?.cache || channel.overwrites;
        if (rawCache) {
            for (const ow of toEntriesArray(rawCache)) {
                if (!ow?.id) continue;
                overwrites.push({
                    id: ow.id,
                    type: ow.type,
                    allow: typeof ow.allow?.bitfield === 'bigint' ? ow.allow.bitfield.toString() : String(ow.allow ?? 0),
                    deny: typeof ow.deny?.bitfield === 'bigint' ? ow.deny.bitfield.toString() : String(ow.deny ?? 0)
                });
            }
        }

        let effectiveParentId = channel.parentId || originParentId || null;
        if (!effectiveParentId && !isCat && existing?.parentId) {
            const prevParentId = existing.parentId;
            const parentInCache = Boolean(channel.guild?.channels?.cache?.get?.(prevParentId));
            // Preserve parent category linkage when Discord orphans children during category deletion/recovery
            if (!parentInCache || this.pendingCategories.has(prevParentId) || this.recreatedCategories.has(prevParentId)) {
                effectiveParentId = this.recreatedCategories.get(prevParentId) || prevParentId;
            }
        }

        if (effectiveParentId && !isCat) {
            this.channelParentOrigin.set(channel.id, effectiveParentId);
        }

        const data = {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            parentId: effectiveParentId,
            position: channel.rawPosition ?? channel.position ?? existing?.position ?? 0,
            topic: channel.topic ?? null,
            nsfw: Boolean(channel.nsfw),
            rateLimitPerUser: channel.rateLimitPerUser || 0,
            bitrate: channel.bitrate || null,
            userLimit: channel.userLimit || null,
            rtcRegion: channel.rtcRegion || null,
            overwrites: overwrites.length > 0 ? overwrites : (existing?.overwrites || []),
            updatedAt: Date.now()
        };

        if (isCat) {
            bp.categories.set(channel.id, data);
        } else {
            bp.channels.set(channel.id, data);
        }
        return true;
    }

    /**
     * Remove a channel snapshot when intentionally deleted by a trusted actor
     * @param {string} guildId
     * @param {string} channelId
     */
    removeChannelSnapshot(guildId, channelId) {
        const bp = this.guildBlueprints.get(guildId);
        if (!bp) return false;
        this.channelParentOrigin.delete(channelId);
        return bp.channels.delete(channelId) || bp.categories.delete(channelId);
    }

    /**
     * Retrieve snapshot of a deleted channel (resolving recreated ID mappings if applicable)
     * @param {string} guildId
     * @param {string} channelId
     * @returns {object|null}
     */
    getChannelSnapshot(guildId, channelId) {
        const bp = this.guildBlueprints.get(guildId);
        if (!bp) return null;
        const direct = bp.channels.get(channelId) || bp.categories.get(channelId);
        if (direct) return direct;
        const mappedId = this.recreatedChannels.get(channelId) || this.recreatedCategories.get(channelId);
        if (mappedId) {
            return bp.channels.get(mappedId) || bp.categories.get(mappedId) || null;
        }
        return null;
    }

    /**
     * Retrieve snapshot of a role (resolving recreated ID mappings if applicable)
     * @param {string} guildId
     * @param {string} roleId
     * @returns {object|null}
     */
    getRoleSnapshot(guildId, roleId) {
        const bp = this.guildBlueprints.get(guildId);
        if (!bp) return null;
        const direct = bp.roles.get(roleId);
        if (direct) return direct;
        const mappedId = this.recreatedRoles.get(roleId);
        if (mappedId) {
            return bp.roles.get(mappedId) || null;
        }
        return null;
    }

    /**
     * Detect and heal stale `antinukeData.protectRole` IDs if the protection role was recreated or replaced.
     * @param {import('discord.js').Guild} guild
     * @param {any} client
     * @param {object} antinukeData
     * @returns {Promise<{ role: any, healed: boolean, stale: boolean }>}
     */
    async syncProtectRoleIfStale(guild, client, antinukeData) {
        if (!guild || !antinukeData) {
            return { role: null, roleId: null, healed: false, rebound: false, stale: false, missing: true };
        }
        const storedId = antinukeData.protectRole;
        if (storedId) {
            const existing = guild.roles?.cache?.get?.(storedId)
                || (typeof guild.roles?.fetch === 'function' ? await guild.roles.fetch(storedId).catch(() => null) : null);
            if (existing) {
                return { role: existing, roleId: existing.id, healed: false, rebound: false, stale: false, missing: false };
            }
        }

        // Check if the stale role ID was recently recreated by BlueprintManager
        const mappedId = storedId ? this.recreatedRoles.get(storedId) : null;
        let replacement = mappedId ? guild.roles?.cache?.get?.(mappedId) : null;
        if (!replacement && typeof guild.roles?.cache?.find === 'function') {
            replacement = guild.roles.cache.find(
                (r) => !r?.managed && (r?.name === 'Roynix Protect' || r?.name === 'Roynix Shield Protect')
            );
        }

        if (replacement?.id) {
            antinukeData.protectRole = replacement.id;
            const botClient = client || guild.client;
            if (typeof botClient?.antinukeDB?.set === 'function') {
                await botClient.antinukeDB.set(`antinukeData_${guild.id}.protectRole`, replacement.id).catch(() => null);
            } else if (typeof botClient?.setAntinukeData === 'function') {
                await botClient.setAntinukeData(guild.id, { ...antinukeData, protectRole: replacement.id }).catch(() => null);
            }
            return { role: replacement, roleId: replacement.id, healed: true, rebound: true, stale: false, missing: false };
        }

        return { role: null, roleId: null, healed: false, rebound: false, stale: Boolean(storedId), missing: true };
    }

    /**
     * Wait for any in-flight role restorations referenced by a channel's permission overwrites
     * @param {Array|Collection} rawOverwrites
     */
    async _awaitPendingOverwriteRoles(rawOverwrites) {
        const items = toEntriesArray(rawOverwrites);
        const pendingPromises = [];
        for (const ow of items) {
            if (ow?.id && this.pendingRoles.has(ow.id)) {
                pendingPromises.push(this.pendingRoles.get(ow.id).catch(() => null));
            }
        }
        if (pendingPromises.length > 0) {
            await Promise.all(pendingPromises);
        }
    }

    /**
     * Sanitize permission overwrites, automatically remapping deleted Role IDs to newly recreated Role IDs
     * @param {import('discord.js').Guild} guild
     * @param {Array|Collection} rawOverwrites
     * @returns {Array<object>}
     */
    _sanitizeOverwrites(guild, rawOverwrites) {
        const safe = [];
        const items = toEntriesArray(rawOverwrites);
        const recreatedRoleValues = new Set(this.recreatedRoles.values());

        const seenIds = new Set();
        for (const ow of items) {
            if (!ow || !ow.id) continue;
            let targetId = ow.id;

            // Remap if this role was deleted and recreated during the nuke
            if (this.recreatedRoles.has(targetId)) {
                targetId = this.recreatedRoles.get(targetId);
            }

            if (seenIds.has(targetId)) continue;

            const isEveryone = targetId === guild.id;
            const isRole = Boolean(guild.roles?.cache?.has?.(targetId) || recreatedRoleValues.has(targetId));
            const isMember = Boolean(guild.members?.cache?.has?.(targetId));

            if (isEveryone || isRole || isMember) {
                seenIds.add(targetId);
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
     * Ensure a deleted category is recreated exactly once (deduplicating concurrent child channel requests)
     * and re-attach any orphaned child channels that belonged to it.
     * @param {import('discord.js').Guild} guild
     * @param {string} oldCategoryId
     * @param {object} [categoryFallback]
     * @returns {Promise<string|null>} New Category ID
     */
    async _ensureCategoryRecreated(guild, oldCategoryId, categoryFallback = null) {
        if (!guild || !oldCategoryId) return null;

        // 1. Check if original category is still alive
        const existing = guild.channels?.cache?.get?.(oldCategoryId);
        if (existing && existing.type === ChannelType.GuildCategory) {
            return existing.id;
        }

        // 2. Check if already recreated (even if gateway CHANNEL_CREATE hasn't populated cache yet)
        if (this.recreatedCategories.has(oldCategoryId)) {
            const mappedId = this.recreatedCategories.get(oldCategoryId);
            const mappedCat = guild.channels?.cache?.get?.(mappedId);
            if (!mappedCat || mappedCat.type === ChannelType.GuildCategory) {
                return mappedId;
            }
        }

        // 3. Check if recreation is currently in-flight (prevents duplicate categories when child channels delete at once)
        if (this.pendingCategories.has(oldCategoryId)) {
            return await this.pendingCategories.get(oldCategoryId);
        }

        const createPromise = (async () => {
            try {
                const bp = this._getGuildBlueprint(guild.id);
                const catSnapshot = bp.categories.get(oldCategoryId) || categoryFallback;
                if (!catSnapshot) return null;

                const rawOverwrites = catSnapshot.overwrites || catSnapshot.permissionOverwrites?.cache || [];
                await this._awaitPendingOverwriteRoles(rawOverwrites);

                const catName = (catSnapshot.name || 'recovered-category').slice(0, 100);
                const catPosition = catSnapshot.position ?? catSnapshot.rawPosition ?? undefined;
                const catSafeOverwrites = this._sanitizeOverwrites(guild, rawOverwrites);

                const newCategory = await this._withRetry(() =>
                    guild.channels.create({
                        name: catName,
                        type: ChannelType.GuildCategory,
                        position: catPosition,
                        permissionOverwrites: catSafeOverwrites,
                        reason: 'Roynix Time Machine | Category Reconstruction'
                    })
                );

                if (newCategory) {
                    this.recreatedCategories.set(oldCategoryId, newCategory.id);
                    setTimeout(() => this.recreatedCategories.delete(oldCategoryId), 120000).unref?.();
                    guild.channels?.cache?.set?.(newCategory.id, newCategory);
                    this.recordChannel(newCategory, null, { fromRecovery: true });

                    // Remap stored child channel snapshots so subsequent child recoveries target the new category
                    for (const [childId, chSnap] of bp.channels.entries()) {
                        if (chSnap?.parentId === oldCategoryId) {
                            chSnap.parentId = newCategory.id;
                            this.channelParentOrigin.set(childId, newCategory.id);
                        }
                    }

                    // Re-attach any surviving or already-recreated child channels that were orphaned
                    await this._reattachOrphanedChildren(guild, oldCategoryId, newCategory.id).catch(() => null);
                    return newCategory.id;
                }
                return null;
            } catch {
                return null;
            } finally {
                this.pendingCategories.delete(oldCategoryId);
            }
        })();

        this.pendingCategories.set(oldCategoryId, createPromise);
        return await createPromise;
    }

    /**
     * Re-attach surviving or already-recreated child channels whose original category was deleted
     * @param {import('discord.js').Guild} guild
     * @param {string} oldCategoryId
     * @param {string} newCategoryId
     */
    async _reattachOrphanedChildren(guild, oldCategoryId, newCategoryId) {
        const bp = this._getGuildBlueprint(guild.id);
        for (const ch of toEntriesArray(guild.channels?.cache)) {
            if (!ch || ch.type === ChannelType.GuildCategory || ch.isThread?.()) continue;
            const chId = ch.id;
            const originParent = this.channelParentOrigin.get(chId) || bp.channels.get(chId)?.parentId;
            if ((originParent === oldCategoryId || originParent === newCategoryId) && ch.parentId !== newCategoryId) {
                if (typeof ch.setParent === 'function') {
                    await ch.setParent(newCategoryId, {
                        lockPermissions: false,
                        reason: 'Roynix Time Machine | Re-attaching to recovered category'
                    }).catch(() => null);
                }
                this.channelParentOrigin.set(chId, newCategoryId);
            }
        }
    }

    /**
     * Atomically restore a deleted channel with full hierarchical fidelity, deduplication, and multi-tier fallbacks
     * @param {import('discord.js').Guild} guild
     * @param {import('discord.js').GuildChannel|object} channelFallback
     * @returns {Promise<boolean>}
     */
    async restoreChannelHierarchical(guild, channelFallback) {
        if (!guild || !channelFallback) return false;
        const guildId = guild.id;
        const channelId = typeof channelFallback === 'string' ? channelFallback : channelFallback.id;
        if (!channelId) return false;

        const snapshot = this.getChannelSnapshot(guildId, channelId);
        const fallbackObj = typeof channelFallback === 'object' ? channelFallback : {};
        const type = snapshot?.type ?? fallbackObj.type ?? ChannelType.GuildText;

        // If the deleted channel IS a category, use the deduplicated category builder
        if (type === ChannelType.GuildCategory) {
            const newCatId = await this._ensureCategoryRecreated(guild, channelId, fallbackObj);
            return Boolean(newCatId);
        }

        // Idempotency guard: if this channel was already recreated, do not create a second copy
        if (this.recreatedChannels.has(channelId)) {
            return true;
        }

        if (this.pendingChannels.has(channelId)) {
            return await this.pendingChannels.get(channelId);
        }

        const task = (async () => {
            try {
                if (this.recreatedChannels.has(channelId)) {
                    return true;
                }

                const name = (snapshot?.name || fallbackObj.name || 'recovered-channel').slice(0, 100);
                const position = snapshot?.position ?? fallbackObj.rawPosition ?? fallbackObj.position ?? undefined;
                const rawParentId =
                    snapshot?.parentId ||
                    fallbackObj.parentId ||
                    this.channelParentOrigin.get(channelId) ||
                    null;

                // 1. Hierarchical Category Resolution (recreates parent category once if missing)
                let targetParentId = null;
                if (rawParentId) {
                    targetParentId = await this._ensureCategoryRecreated(guild, rawParentId);
                }

                // 2. Wait for any concurrent role restorations and build sanitized permission overwrites
                const rawOverwrites = snapshot?.overwrites || fallbackObj.permissionOverwrites?.cache || fallbackObj.overwrites || [];
                await this._awaitPendingOverwriteRoles(rawOverwrites);
                const safeOverwrites = this._sanitizeOverwrites(guild, rawOverwrites);

                // 3. Primary Atomic Creation with automatic retry on transient rate limits
                const baseOptions = {
                    name,
                    position,
                    parent: targetParentId || undefined,
                    permissionOverwrites: safeOverwrites,
                    reason: 'Roynix Time Machine | Channel Auto-Recovery'
                };

                const createdChannel = await this._withRetry(async () => {
                    switch (type) {
                        case ChannelType.GuildText:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildText,
                                topic: (snapshot?.topic || fallbackObj.topic || undefined)?.slice(0, 1024),
                                nsfw: Boolean(snapshot?.nsfw ?? fallbackObj.nsfw),
                                rateLimitPerUser: Math.min(snapshot?.rateLimitPerUser || fallbackObj.rateLimitPerUser || 0, 21600)
                            });

                        case ChannelType.GuildVoice:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildVoice,
                                bitrate: snapshot?.bitrate || fallbackObj.bitrate || undefined,
                                userLimit: snapshot?.userLimit || fallbackObj.userLimit || undefined,
                                rtcRegion: snapshot?.rtcRegion || fallbackObj.rtcRegion || undefined
                            });

                        case ChannelType.GuildAnnouncement:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildAnnouncement,
                                topic: (snapshot?.topic || fallbackObj.topic || undefined)?.slice(0, 1024),
                                nsfw: Boolean(snapshot?.nsfw ?? fallbackObj.nsfw)
                            });

                        case ChannelType.GuildStageVoice:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildStageVoice,
                                bitrate: snapshot?.bitrate || fallbackObj.bitrate || undefined,
                                userLimit: snapshot?.userLimit || fallbackObj.userLimit || undefined
                            });

                        case ChannelType.GuildForum:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildForum,
                                topic: (snapshot?.topic || fallbackObj.topic || undefined)?.slice(0, 1024),
                                rateLimitPerUser: Math.min(snapshot?.rateLimitPerUser || fallbackObj.rateLimitPerUser || 0, 21600)
                            });

                        default:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildText
                            });
                    }
                });

                if (createdChannel) {
                    this.recreatedChannels.set(channelId, createdChannel.id);
                    setTimeout(() => this.recreatedChannels.delete(channelId), 120000).unref?.();
                    guild.channels?.cache?.set?.(createdChannel.id, createdChannel);
                    this.recordChannel(createdChannel, targetParentId || rawParentId, { fromRecovery: true });
                    return true;
                }
                return false;
            } catch {
                // Tier-2 Fallback: Create safe channel without parent/overwrites if constraints failed
                try {
                    const safeName = (snapshot?.name || fallbackObj.name || 'recovered-channel').slice(0, 100);
                    const isCat = type === ChannelType.GuildCategory;
                    const fallbackChannel = await guild.channels.create({
                        name: safeName,
                        type: isCat ? ChannelType.GuildCategory : ChannelType.GuildText,
                        reason: 'Roynix Time Machine | Resilient Fallback Channel Recovery'
                    });
                    if (fallbackChannel) {
                        if (isCat) {
                            this.recreatedCategories.set(channelId, fallbackChannel.id);
                            setTimeout(() => this.recreatedCategories.delete(channelId), 120000).unref?.();
                        } else {
                            this.recreatedChannels.set(channelId, fallbackChannel.id);
                            setTimeout(() => this.recreatedChannels.delete(channelId), 120000).unref?.();
                        }
                        guild.channels?.cache?.set?.(fallbackChannel.id, fallbackChannel);
                        this.recordChannel(fallbackChannel, fallbackObj.parentId || null, { fromRecovery: true });
                        return true;
                    }
                } catch {}
                return false;
            } finally {
                this.pendingChannels.delete(channelId);
            }
        })();

        this.pendingChannels.set(channelId, task);
        return await task;
    }

    /**
     * Atomically restore a deleted role from blueprint memory, remap IDs, and re-assign to cached members
     * @param {import('discord.js').Guild} guild
     * @param {string|import('discord.js').Role} roleFallback
     * @returns {Promise<boolean>}
     */
    async restoreRole(guild, roleFallback) {
        if (!guild || !roleFallback) return false;
        const roleId = typeof roleFallback === 'string' ? roleFallback : roleFallback.id;
        if (!roleId) return false;

        if (this.recreatedRoles.has(roleId)) return true;
        if (this.pendingRoles.has(roleId)) return await this.pendingRoles.get(roleId);

        const task = (async () => {
            try {
                if (this.recreatedRoles.has(roleId)) return true;

                const bp = this._getGuildBlueprint(guild.id);
                const snapshot = bp.roles.get(roleId);
                const fallbackObj = typeof roleFallback === 'object' ? roleFallback : {};

                const name = (snapshot?.name || fallbackObj.name || 'recovered-role').slice(0, 100);
                const color = snapshot?.color || fallbackObj.color || undefined;
                const hoist = Boolean(snapshot?.hoist ?? fallbackObj.hoist);
                const mentionable = Boolean(snapshot?.mentionable ?? fallbackObj.mentionable);

                let permissions = undefined;
                if (snapshot?.permissions != null) {
                    permissions = new PermissionsBitField(BigInt(snapshot.permissions));
                } else if (fallbackObj.permissions != null) {
                    const rawPerms = typeof fallbackObj.permissions?.bitfield !== 'undefined'
                        ? fallbackObj.permissions.bitfield
                        : fallbackObj.permissions;
                    permissions = rawPerms instanceof PermissionsBitField
                        ? rawPerms
                        : new PermissionsBitField(rawPerms);
                }

                if (guild.members?.me?.permissions?.bitfield != null && permissions?.bitfield != null) {
                    permissions = permissions.bitfield & guild.members.me.permissions.bitfield;
                }

                const newRole = await this._withRetry(() =>
                    guild.roles.create({
                        name,
                        color,
                        hoist,
                        mentionable,
                        permissions,
                        reason: 'Roynix Time Machine | Blueprint Role Auto-Recovery'
                    })
                );

                if (newRole) {
                    this.recreatedRoles.set(roleId, newRole.id);
                    setTimeout(() => this.recreatedRoles.delete(roleId), 120000).unref?.();
                    guild.roles?.cache?.set?.(newRole.id, newRole);
                    this.recordRole(newRole, { fromRecovery: true });

                    const botClient = guild.client;
                    const antinukeData = botClient?.antinukeCache?.get?.(guild.id)
                        || (typeof botClient?.getAntinukeData === 'function'
                            ? await botClient.getAntinukeData(guild.id).catch(() => null)
                            : await botClient?.antinukeDB?.get?.(`antinukeData_${guild.id}`)?.catch?.(() => null));
                    const isProtectRole = Boolean(antinukeData?.protectRole && antinukeData.protectRole === roleId);

                    if (isProtectRole) {
                        antinukeData.protectRole = newRole.id;
                        if (typeof botClient?.antinukeDB?.set === 'function') {
                            await botClient.antinukeDB.set(`antinukeData_${guild.id}.protectRole`, newRole.id).catch(() => null);
                        } else if (typeof botClient?.setAntinukeData === 'function') {
                            await botClient.setAntinukeData(guild.id, { ...antinukeData, protectRole: newRole.id }).catch(() => null);
                        }
                        if (typeof guild.members?.me?.roles?.add === 'function') {
                            await guild.members.me.roles.add(newRole.id, 'Roynix Time Machine | Re-assigning Protection Role').catch(() => null);
                        }
                    }

                    // Restore role position safely below bot's highest role
                    const botHighest = guild.members?.me?.roles?.highest?.position ?? 0;
                    const desiredPos = isProtectRole && botHighest > 1
                        ? botHighest - 1
                        : (snapshot?.position ?? fallbackObj.rawPosition ?? fallbackObj.position);
                    if (typeof desiredPos === 'number' && desiredPos > 0 && botHighest > 1 && typeof newRole.setPosition === 'function') {
                        const targetPos = Math.min(desiredPos, botHighest - 1);
                        await newRole.setPosition(targetPos).catch(() => null);
                    }

                    // Re-assign role back to members who held it before deletion (up to 25 cached members to respect rate limits)
                    const memberIds = snapshot?.memberIds || [];
                    if (memberIds.length > 0) {
                        for (const memberId of memberIds.slice(0, 25)) {
                            const member = guild.members?.cache?.get?.(memberId);
                            if (member && member.manageable !== false && typeof member.roles?.add === 'function') {
                                await member.roles.add(newRole.id, 'Roynix Time Machine | Restoring Deleted Role to Member').catch(() => null);
                            }
                        }
                    }

                    return true;
                }
                return false;
            } catch {
                try {
                    const name = (typeof roleFallback === 'string' ? 'recovered-role' : roleFallback.name || 'recovered-role').slice(0, 100);
                    const newRole = await guild.roles.create({
                        name,
                        reason: 'Roynix Time Machine | Safe Fallback Role Auto-Recovery'
                    });
                    if (newRole) {
                        this.recreatedRoles.set(roleId, newRole.id);
                        setTimeout(() => this.recreatedRoles.delete(roleId), 120000).unref?.();
                        guild.roles?.cache?.set?.(newRole.id, newRole);
                        this.recordRole(newRole, { fromRecovery: true });
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            } finally {
                this.pendingRoles.delete(roleId);
            }
        })();

        this.pendingRoles.set(roleId, task);
        return await task;
    }
}

export const blueprintManager = new BlueprintManager();
