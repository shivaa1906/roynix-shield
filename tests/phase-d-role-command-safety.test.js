import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AuditLogEvent, ChannelType, Collection, PermissionFlagsBits } from 'discord.js';

import {
    isCommandAuthorized,
    verifyCollectorInteraction,
    positionAndAuditProtectRole
} from '../src/utils/securityPolicy.js';
import { IncidentCoordinator, incidentCoordinator } from '../src/utils/incidentCoordinator.js';
import { blueprintManager } from '../src/utils/blueprintManager.js';
import { data as antiRoleUpdate } from '../src/antinuke/antiRoleUpdate.js';
import { data as antiRoleDelete } from '../src/antinuke/antiRoleDelete.js';
import { data as slashAntinuke } from '../src/commands/slash/antinuke/antinuke.js';
import { data as prefixAntinuke } from '../src/commands/prefix/antinuke/antinuke.js';

function resetIncidentDecisionState() {
    incidentCoordinator.incidents?.clear?.();
    incidentCoordinator.executorStates?.clear?.();
}

function getDotPath(obj, pathStr) {
    if (!obj || !pathStr) return undefined;
    const parts = pathStr.split('.');
    let cur = obj;
    for (const part of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[part];
    }
    return cur;
}

function setDotPath(obj, pathStr, val) {
    const parts = pathStr.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
        cur = cur[p];
    }
    cur[parts[parts.length - 1]] = val;
}

function deleteDotPath(obj, pathStr) {
    const parts = pathStr.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cur == null || typeof cur !== 'object') return;
        cur = cur[p];
    }
    if (cur && typeof cur === 'object') {
        delete cur[parts[parts.length - 1]];
    }
}

function createInMemoryAntinukeDB(initialGuildData = {}) {
    const store = new Map();
    for (const [guildId, data] of Object.entries(initialGuildData)) {
        store.set(`antinukeData_${guildId}`, structuredClone(data));
    }

    return {
        store,
        async get(key) {
            const [rootKey, ...rest] = key.split('.');
            const rootObj = store.get(rootKey);
            if (rest.length === 0) return rootObj ? structuredClone(rootObj) : null;
            const sub = getDotPath(rootObj, rest.join('.'));
            return sub !== undefined ? structuredClone(sub) : null;
        },
        async set(key, value) {
            const [rootKey, ...rest] = key.split('.');
            if (rest.length === 0) {
                store.set(rootKey, structuredClone(value));
                return value;
            }
            const rootObj = store.get(rootKey) || {};
            setDotPath(rootObj, rest.join('.'), structuredClone(value));
            store.set(rootKey, rootObj);
            return value;
        },
        async delete(key) {
            const [rootKey, ...rest] = key.split('.');
            if (rest.length === 0) {
                store.delete(rootKey);
                return true;
            }
            const rootObj = store.get(rootKey);
            if (rootObj) {
                deleteDotPath(rootObj, rest.join('.'));
                store.set(rootKey, rootObj);
            }
            return true;
        }
    };
}

function createMockClient(guildId, initialAntinukeData) {
    const antinukeDB = createInMemoryAntinukeDB({ [guildId]: initialAntinukeData });
    const client = new EventEmitter();
    Object.assign(client, {
        user: {
            id: '900000000000000001',
            username: 'RoynixShield',
            avatarURL: () => 'https://example.com/bot.png',
            displayAvatarURL: () => 'https://example.com/bot.png'
        },
        color: 0xef9a12,
        stepDelayMs: 0,
        antinukeDB,
        auditLogCache: new Map(),
        incidentCoordinator: new IncidentCoordinator(),
        users: {
            cache: new Collection()
        },
        guilds: {
            cache: new Collection()
        },
        async getAntinukeData(gId) {
            return await antinukeDB.get(`antinukeData_${gId}`);
        },
        async setAntinukeData(gId, data) {
            return await antinukeDB.set(`antinukeData_${gId}`, data);
        }
    });
    return client;
}

function createCollectorRig() {
    const handlers = { collect: [], end: [] };
    const collector = {
        stopped: false,
        stopReason: null,
        on(event, fn) {
            if (handlers[event]) handlers[event].push(fn);
            return collector;
        },
        stop(reason = 'user') {
            if (collector.stopped) return;
            collector.stopped = true;
            collector.stopReason = reason;
            for (const fn of handlers.end) {
                fn(new Map(), reason);
            }
        },
        async emitCollect(interaction) {
            for (const fn of handlers.collect) {
                await fn(interaction);
            }
        }
    };
    return collector;
}

test('Phase D - ROLE-02: Protection-role tampering is detected and reverted even when antiRoleUpdate & autoRecovery are disabled', async () => {
    resetIncidentDecisionState();
    const guildId = '100000000000000101';
    const protectRoleId = '200000000000000201';
    const attackerId = '300000000000000301';

    const client = createMockClient(guildId, {
        enabled: true,
        protectRole: protectRoleId,
        punishment: 'ban',
        extraOwners: [],
        whitelisted: {},
        disabledEvents: ['antiRoleUpdate', 'autoRecovery'],
        logsChannel: '400000000000000401'
    });

    const editCalls = [];
    const setPositionCalls = [];
    let bannedUserId = null;
    const sentLogs = [];

    const oldRole = {
        id: protectRoleId,
        name: 'Roynix Protect',
        color: 0xef9a12,
        hoist: false,
        mentionable: false,
        position: 9,
        rawPosition: 9,
        permissions: { bitfield: 0n }
    };

    const newRole = {
        id: protectRoleId,
        name: 'Hacked Role',
        color: 0xff0000,
        hoist: true,
        mentionable: true,
        position: 2,
        rawPosition: 2,
        permissions: {
            bitfield: PermissionFlagsBits.Administrator,
            has: (flag) => (PermissionFlagsBits.Administrator & flag) === flag
        },
        guild: null,
        async edit(payload, reason) {
            editCalls.push({ payload, reason });
            Object.assign(this, payload);
            return this;
        },
        async setPosition(pos, opts) {
            setPositionCalls.push({ pos, opts });
            this.position = pos;
            return this;
        }
    };

    const guild = {
        id: guildId,
        name: 'Test Guild',
        ownerId: '800000000000000801',
        iconURL: () => null,
        roles: {
            cache: new Collection([[protectRoleId, newRole]]),
            highest: { id: '200000000000000299', position: 10 }
        },
        members: {
            cache: new Collection(),
            me: {
                id: client.user.id,
                roles: { highest: { id: '200000000000000299', position: 10 }, cache: new Collection() },
                permissions: { has: () => true }
            },
            async fetch() {
                return null;
            }
        },
        bans: {
            async create(userId) {
                bannedUserId = userId;
                return true;
            }
        },
        channels: {
            cache: new Collection([
                ['400000000000000401', {
                    id: '400000000000000401',
                    isTextBased: () => true,
                    send: async (msg) => {
                        sentLogs.push(msg);
                        return msg;
                    }
                }]
            ])
        },
        async fetchAuditLogs({ type }) {
            if (type === AuditLogEvent.RoleUpdate) {
                return {
                    entries: new Collection([
                        ['audit_1', {
                            id: 'audit_1',
                            action: AuditLogEvent.RoleUpdate,
                            target: { id: protectRoleId },
                            executor: { id: attackerId, tag: 'Attacker#0001', bot: false },
                            createdTimestamp: Date.now()
                        }]
                    ])
                };
            }
            return { entries: new Collection() };
        }
    };
    newRole.guild = guild;

    await antiRoleUpdate.execute(client);
    for (const listener of client.listeners('roleUpdate')) {
        await listener(oldRole, newRole);
    }

    assert.equal(bannedUserId, attackerId, 'Untrusted attacker tampering with Roynix Protect role must be banned');
    assert.equal(editCalls.length, 1, 'Roynix Protect metadata and permissions must be reverted');
    assert.equal(editCalls[0].payload.name, 'Roynix Protect');
    assert.equal(editCalls[0].payload.permissions, 0n, 'Roynix Protect permissions must be reset to 0n');
    assert.equal(setPositionCalls.length, 1, 'Roynix Protect position must be restored below bot highest role');
    assert.equal(setPositionCalls[0].pos, 9);
    assert.equal(sentLogs.length, 1, 'Security log should be sent');
});

test('Phase D - ROLE-02: Protection-role deletion recreates role and updates antinukeDB protectRole ID (and clears if deleted by owner)', async () => {
    resetIncidentDecisionState();
    const guildId = '100000000000000102';
    const oldProtectRoleId = '200000000000000202';
    const newProtectRoleId = '200000000000000203';
    const attackerId = '300000000000000302';
    const ownerId = '800000000000000802';

    const client = createMockClient(guildId, {
        enabled: true,
        protectRole: oldProtectRoleId,
        punishment: 'ban',
        extraOwners: [],
        whitelisted: {},
        disabledEvents: ['antiRoleDelete', 'autoRecovery'],
        logsChannel: null
    });

    let addedToBot = false;
    let positionedAt = null;
    const recreatedRole = {
        id: newProtectRoleId,
        name: 'Roynix Protect',
        position: 1,
        permissions: { bitfield: 0n },
        async setPosition(pos) {
            positionedAt = pos;
            this.position = pos;
            return this;
        }
    };

    const rolesCache = new Collection();
    const guild = {
        id: guildId,
        name: 'Role Delete Guild',
        ownerId,
        client,
        roles: {
            cache: rolesCache,
            highest: { id: '200000000000000299', position: 8 },
            async create() {
                rolesCache.set(recreatedRole.id, recreatedRole);
                return recreatedRole;
            }
        },
        channels: {
            cache: new Collection()
        },
        members: {
            cache: new Collection(),
            me: {
                id: client.user.id,
                roles: {
                    highest: { id: '200000000000000299', position: 8 },
                    cache: new Collection(),
                    async add(roleOrId) {
                        addedToBot = (roleOrId?.id || roleOrId) === newProtectRoleId;
                    }
                },
                permissions: { has: () => true }
            },
            async fetch() {
                return null;
            }
        },
        bans: {
            async create() {
                return true;
            }
        },
        async fetchAuditLogs() {
            return {
                entries: new Collection([
                    ['audit_del_1', {
                        id: 'audit_del_1',
                        action: AuditLogEvent.RoleDelete,
                        target: { id: oldProtectRoleId },
                        executor: { id: attackerId, tag: 'Attacker#0002', bot: false },
                        createdTimestamp: Date.now()
                    }]
                ])
            };
        }
    };

    const deletedRole = {
        id: oldProtectRoleId,
        name: 'Roynix Protect',
        color: 0xef9a12,
        hoist: false,
        mentionable: false,
        position: 7,
        rawPosition: 7,
        permissions: { bitfield: 0n },
        guild
    };

    await antiRoleDelete.execute(client);
    for (const listener of client.listeners('roleDelete')) {
        await listener(deletedRole);
    }

    const updatedData = await client.antinukeDB.get(`antinukeData_${guildId}`);
    assert.equal(updatedData.protectRole, newProtectRoleId, 'antinukeDB protectRole must be updated to newly recreated role ID');
    assert.equal(addedToBot, true, 'Recreated protection role must be re-assigned to bot member');
    assert.equal(positionedAt, 7, 'Recreated protection role must be positioned below bot highest role');

    // Now test trusted owner deleting the protection role -> clears stale protectRole ID
    resetIncidentDecisionState();
    rolesCache.delete(newProtectRoleId);
    guild.fetchAuditLogs = async () => ({
        entries: new Collection([
            ['audit_del_2', {
                id: 'audit_del_2',
                action: AuditLogEvent.RoleDelete,
                target: { id: newProtectRoleId },
                executor: { id: ownerId, tag: 'Owner#0001', bot: false },
                createdTimestamp: Date.now()
            }]
        ])
    });

    for (const listener of client.listeners('roleDelete')) {
        await listener({ ...deletedRole, id: newProtectRoleId });
    }
    const afterOwnerDelete = await client.antinukeDB.get(`antinukeData_${guildId}`);
    assert.equal(afterOwnerDelete.protectRole, null, 'Trusted deletion of protection role should clear stale protectRole ID');
});

test('Phase D - ROLE-02: syncProtectRoleIfStale heals stale protectRole ID from existing Roynix Protect role or reports missing in config', async () => {
    const guildId = '100000000000000103';
    const staleRoleId = '200000000000000999';
    const actualRoleId = '200000000000000888';

    const client = createMockClient(guildId, {
        enabled: true,
        protectRole: staleRoleId,
        punishment: 'ban',
        extraOwners: [],
        whitelisted: {},
        disabledEvents: []
    });

    const actualRole = { id: actualRoleId, name: 'Roynix Protect', position: 5 };
    const guild = {
        id: guildId,
        ownerId: '800000000000000803',
        iconURL: () => null,
        roles: {
            cache: new Collection([[actualRoleId, actualRole]]),
            async fetch() {
                return null;
            }
        }
    };

    const antinukeData = await client.antinukeDB.get(`antinukeData_${guildId}`);
    const syncRes = await blueprintManager.syncProtectRoleIfStale(guild, client, antinukeData);
    assert.equal(syncRes.rebound, true);
    assert.equal(syncRes.roleId, actualRoleId);

    const storedAfterSync = await client.antinukeDB.get(`antinukeData_${guildId}`);
    assert.equal(storedAfterSync.protectRole, actualRoleId, 'antinukeDB should persist healed protectRole ID');

    // Now remove actualRole so no protection role exists at all and run prefix `!antinuke config`
    guild.roles.cache.clear();
    let configReply = null;
    const message = {
        guild,
        author: {
            id: guild.ownerId,
            username: 'Owner',
            avatarURL: () => null,
            displayAvatarURL: () => null
        },
        async reply(payload) {
            configReply = payload;
            return payload;
        }
    };

    await prefixAntinuke.execute(message, ['config'], client);
    const desc = configReply.embeds[0].data.description;
    assert.match(desc, /Missing \/ Deleted/, 'Config should report Missing / Deleted when protectRole no longer exists');
});

test('Phase D - ROLE-01: Impossible role hierarchy operations are truthfully reported in enable, disable, and antiRoleUpdate', async () => {
    const guildId = '100000000000000104';
    const ownerId = '800000000000000804';
    const protectRoleId = '200000000000000404';

    // 1. Test positionAndAuditProtectRole when bot highest role is at position 1 (impossible to position below)
    const lowBotMe = {
        roles: {
            highest: { id: 'bot_role', position: 1 }
        }
    };
    const lowGuild = {
        roles: {
            highest: { id: 'top_admin_role', position: 10 }
        }
    };
    const lowProtectRole = {
        id: protectRoleId,
        position: 1
    };

    const audit1 = await positionAndAuditProtectRole(lowGuild, lowBotMe, lowProtectRole, { warn: '⚠️' });
    assert.equal(audit1.positioned, false);
    assert.equal(audit1.hierarchyBlocked, true);
    assert.match(audit1.warningText, /Role Hierarchy Warning/);
    assert.match(audit1.warningText, /Hierarchy Notice/);

    // 2. Test slash and prefix `disable` when protectRole is above bot's highest role (cannot delete)
    const client = createMockClient(guildId, {
        enabled: true,
        protectRole: protectRoleId,
        punishment: 'ban',
        extraOwners: ['700000000000000701'],
        whitelisted: { '600000000000000601': { events: ['antiBan'] } },
        disabledEvents: ['antiPrune']
    });

    const unDeletableRole = {
        id: protectRoleId,
        name: 'Roynix Protect',
        position: 9,
        async delete() {
            throw new Error('Missing Permissions: Role Hierarchy');
        }
    };

    const guild = {
        id: guildId,
        ownerId,
        iconURL: () => null,
        roles: {
            cache: new Collection([[protectRoleId, unDeletableRole]]),
            highest: { id: 'top_role', position: 10 },
            async fetch(id) {
                return id === protectRoleId ? unDeletableRole : null;
            }
        },
        members: {
            me: {
                id: client.user.id,
                roles: { highest: { id: 'bot_role', position: 5 }, cache: new Collection() },
                permissions: { has: () => true }
            }
        }
    };

    const edits = [];
    const prefixMsg = {
        guild,
        author: {
            id: ownerId,
            username: 'GuildOwner',
            avatarURL: () => null,
            displayAvatarURL: () => null
        },
        async reply(payload) {
            return {
                async edit(editPayload) {
                    edits.push(editPayload);
                    return this;
                }
            };
        }
    };

    await prefixAntinuke.execute(prefixMsg, ['disable'], client);
    const finalDisableDesc = edits.at(-1).embeds[0].data.description;
    assert.doesNotMatch(finalDisableDesc, /\*\*Role:\*\* `Deleted`/, 'Must NOT falsely report Role: Deleted when blocked by hierarchy');
    assert.match(finalDisableDesc, /Delete Failed \(Hierarchy\)/, 'Must truthfully report hierarchy block on role deletion');
    assert.match(finalDisableDesc, /Role Hierarchy Warning/);
});

test('Phase D - AUTH-03: Prefix owner & whitelist subcommands do not call unawaited members.fetch and safely handle invalid IDs & uncached users', async () => {
    const guildId = '100000000000000105';
    const ownerId = '800000000000000805';
    const uncachedExtraOwnerId = '500000000000000505';

    const client = createMockClient(guildId, {
        enabled: true,
        protectRole: '200000000000000501',
        punishment: 'ban',
        extraOwners: [uncachedExtraOwnerId],
        whitelisted: {},
        disabledEvents: []
    });

    const fetchCalls = [];
    const guild = {
        id: guildId,
        ownerId,
        iconURL: () => null,
        members: {
            cache: new Collection(),
            async fetch(arg) {
                fetchCalls.push(arg);
                throw new Error('Unknown Member');
            }
        }
    };

    const replies = [];
    const createMessage = () => ({
        guild,
        client,
        author: {
            id: ownerId,
            username: 'Owner',
            avatarURL: () => null,
            displayAvatarURL: () => null
        },
        mentions: {
            members: new Collection()
        },
        async reply(payload) {
            replies.push(payload);
            return {
                editable: true,
                createMessageComponentCollector: () => createCollectorRig(),
                edit: async () => {}
            };
        }
    });

    // 1. `extraowner show` should NOT call `members.fetch(undefined)` and should format uncached user as `<@id>` instead of `undefined`
    await prefixAntinuke.execute(createMessage(), ['extraowner', 'show'], client);
    assert.equal(fetchCalls.length, 0, '`extraowner show` must not call guild.members.fetch');
    const showDesc = replies.at(-1).embeds[0].data.description;
    assert.doesNotMatch(showDesc, /undefined/, '`extraowner show` must not render `undefined` for uncached users');
    assert.match(showDesc, new RegExp(`<@${uncachedExtraOwnerId}> \\(\`${uncachedExtraOwnerId}\`\\)`));

    // 2. `whitelist reset` should NOT call `members.fetch(undefined)`
    await prefixAntinuke.execute(createMessage(), ['whitelist', 'reset'], client);
    assert.equal(fetchCalls.length, 0, '`whitelist reset` must not call guild.members.fetch');

    // 3. `extraowner add 999999999999999999` (non-existent member ID) should await fetch, catch error, and reply cleanly without TypeError
    await prefixAntinuke.execute(createMessage(), ['extraowner', 'add', '999999999999999999'], client);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0], '999999999999999999');
    assert.match(replies.at(-1).embeds[0].data.description, /Please mention a valid Member or provide a valid Member ID/);

    // 4. `whitelist add 999999999999999999` (non-existent member ID) should await fetch, catch error, and reply cleanly without TypeError
    await prefixAntinuke.execute(createMessage(), ['whitelist', 'add', '999999999999999999'], client);
    assert.equal(fetchCalls.length, 2);
    assert.match(replies.at(-1).embeds[0].data.description, /Please mention a valid Member or provide a valid Member ID/);
});

test('Phase D - AUTH-04 & AUTH-05: Prefix punishment set handles non-author click without ReferenceError and collectors enforce live authorization revocation', async () => {
    const guildId = '100000000000000106';
    const ownerId = '800000000000000806';
    const extraOwnerId = '700000000000000706';
    const intruderId = '600000000000000606';

    const client = createMockClient(guildId, {
        enabled: true,
        protectRole: '200000000000000601',
        punishment: 'ban',
        extraOwners: [extraOwnerId],
        whitelisted: {},
        disabledEvents: []
    });

    const guild = {
        id: guildId,
        ownerId,
        iconURL: () => null
    };

    let activeCollector = null;
    const messageEdits = [];
    const message = {
        guild,
        client,
        author: {
            id: extraOwnerId,
            username: 'ExtraOwner',
            avatarURL: () => null,
            displayAvatarURL: () => null
        },
        async reply() {
            activeCollector = createCollectorRig();
            return {
                editable: true,
                createMessageComponentCollector: () => activeCollector,
                async edit(payload) {
                    messageEdits.push(payload);
                    return this;
                }
            };
        }
    };

    await prefixAntinuke.execute(message, ['punishment', 'set'], client);
    assert.ok(activeCollector, 'Collector should be created for punishment set');

    // 1. Intruder clicks select menu -> must reply ephemerally without ReferenceError: i is not defined
    let intruderReply = null;
    await activeCollector.emitCollect({
        user: { id: theIntruderId() },
        isStringSelectMenu: () => true,
        customId: 'select_action',
        values: ['kick'],
        async reply(payload) {
            intruderReply = payload;
        }
    });
    assert.ok(intruderReply, 'Non-author click must receive ephemeral rejection without ReferenceError');
    assert.equal(intruderReply.content, 'You cannot interact with this.');

    // 2. Revoke Extra Owner authorization while collector is still open!
    await client.antinukeDB.set(`antinukeData_${guildId}.extraOwners`, []);

    let revokedReply = null;
    await activeCollector.emitCollect({
        user: { id: extraOwnerId },
        isStringSelectMenu: () => true,
        customId: 'select_action',
        values: ['kick'],
        async reply(payload) {
            revokedReply = payload;
        }
    });

    assert.ok(revokedReply, 'Revoked Extra Owner must be rejected on collector interaction');
    assert.match(revokedReply.content, /no longer authorized to perform this action/i);
    assert.equal(activeCollector.stopped, true, 'Collector must stop when author loses authorization');

    const storedPunishment = await client.antinukeDB.get(`antinukeData_${guildId}.punishment`);
    assert.equal(storedPunishment, 'ban', 'Punishment must NOT be mutated after Extra Owner revocation');

    function theIntruderId() {
        return '600000000000000606';
    }
});

test('Phase D - Slash & Prefix Parity: Extra Owner permissions, Owner-only restriction, and configuration persistence across disable/enable', async () => {
    const guildId = '100000000000000107';
    const ownerId = '800000000000000807';
    const extraOwnerId = '700000000000000707';
    const whitelistedUserId = '600000000000000607';

    const client = createMockClient(guildId, {
        enabled: true,
        protectRole: '200000000000000701',
        punishment: 'kick',
        logsChannel: '400000000000000701',
        extraOwners: [extraOwnerId],
        whitelisted: {
            [whitelistedUserId]: { events: ['antiBan', 'antiKick'], executorId: ownerId, timestamp: 1700000000000 }
        },
        disabledEvents: ['antiPrune']
    });

    const rolesCache = new Collection([
        ['200000000000000701', {
            id: '200000000000000701',
            name: 'Roynix Protect',
            position: 5,
            async setPosition(pos) {
                this.position = pos;
                return this;
            },
            async delete() {
                rolesCache.delete(this.id);
                return this;
            }
        }]
    ]);

    const guild = {
        id: guildId,
        ownerId,
        iconURL: () => null,
        roles: {
            cache: rolesCache,
            highest: { id: 'top_role', position: 10 },
            async fetch(id) {
                return rolesCache.get(id) || null;
            },
            async create(opts) {
                const created = {
                    id: '200000000000000702',
                    name: opts.name,
                    position: 5,
                    async setPosition(pos) {
                        this.position = pos;
                        return this;
                    },
                    async delete() {
                        rolesCache.delete(this.id);
                        return this;
                    }
                };
                rolesCache.set(created.id, created);
                return created;
            }
        },
        members: {
            cache: new Collection(),
            me: {
                id: client.user.id,
                roles: {
                    highest: { id: 'bot_high', position: 10 },
                    cache: new Collection(),
                    async add() {}
                },
                permissions: { has: () => true }
            }
        }
    };

    // 1. Extra Owner is blocked from `/antinuke owner` (Slash) and `!antinuke extraowner` (Prefix)
    let slashOwnerReply = null;
    await slashAntinuke.execute({
        guild,
        user: { id: extraOwnerId, username: 'ExtraOwner', avatarURL: () => null },
        options: {
            getSubcommandGroup: () => 'owner',
            getSubcommand: () => 'reset',
            getUser: () => null,
            getChannel: () => null,
            getString: () => null
        },
        async reply(payload) {
            slashOwnerReply = payload;
        }
    }, client);
    assert.match(slashOwnerReply.embeds[0].data.description, /Only server owner can use this command/i);

    let prefixOwnerReply = null;
    await prefixAntinuke.execute({
        guild,
        client,
        author: { id: extraOwnerId, username: 'ExtraOwner', avatarURL: () => null },
        async reply(payload) {
            prefixOwnerReply = payload;
        }
    }, ['extraowner', 'reset'], client);
    assert.match(prefixOwnerReply.embeds[0].data.description, /Only server owner can use this command/i);

    // 2. Extra Owner CAN run `/antinuke disable` and `/antinuke enable`, and all settings survive!
    await slashAntinuke.execute({
        guild,
        user: { id: extraOwnerId, username: 'ExtraOwner', avatarURL: () => null },
        options: {
            getSubcommandGroup: () => null,
            getSubcommand: () => 'disable',
            getUser: () => null,
            getChannel: () => null,
            getString: () => null
        },
        async deferReply() {},
        async editReply() {}
    }, client);

    const disabledState = await client.antinukeDB.get(`antinukeData_${guildId}`);
    assert.equal(disabledState.enabled, false);
    assert.deepEqual(disabledState.extraOwners, [extraOwnerId]);
    assert.ok(disabledState.whitelisted[whitelistedUserId]);
    assert.equal(disabledState.punishment, 'kick');
    assert.equal(disabledState.logsChannel, '400000000000000701');
    assert.deepEqual(disabledState.disabledEvents, ['antiPrune']);

    await slashAntinuke.execute({
        guild,
        user: { id: extraOwnerId, username: 'ExtraOwner', avatarURL: () => null },
        options: {
            getSubcommandGroup: () => null,
            getSubcommand: () => 'enable',
            getUser: () => null,
            getChannel: () => null,
            getString: () => null
        },
        async deferReply() {},
        async editReply() {}
    }, client);

    const reEnabledState = await client.antinukeDB.get(`antinukeData_${guildId}`);
    assert.equal(reEnabledState.enabled, true);
    assert.equal(reEnabledState.protectRole, '200000000000000702');
    assert.deepEqual(reEnabledState.extraOwners, [extraOwnerId]);
    assert.ok(reEnabledState.whitelisted[whitelistedUserId]);
    assert.equal(reEnabledState.punishment, 'kick');
    assert.equal(reEnabledState.logsChannel, '400000000000000701');
    assert.deepEqual(reEnabledState.disabledEvents, ['antiPrune']);
});
