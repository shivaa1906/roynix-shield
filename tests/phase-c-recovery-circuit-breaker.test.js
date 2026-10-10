import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
    AuditLogEvent,
    ChannelType,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsBitField
} from 'discord.js';
import { IncidentCoordinator } from '../src/utils/incidentCoordinator.js';
import { circuitBreaker } from '../src/utils/circuitBreaker.js';
import { blueprintManager } from '../src/utils/blueprintManager.js';
import { data as antiChannelUpdateModule } from '../src/antinuke/antiChannelUpdate.js';
import { data as antiChannelDeleteModule } from '../src/antinuke/antiChannelDelete.js';

function createMockEnvironment(antinukeOverrides = {}) {
    const client = new EventEmitter();
    client.user = { id: '100000000000000001', tag: 'RoynixShield#0001' };
    client.color = 0xff0000;
    client.auditLogCache = new Map();
    client.antinukeCache = new Map();
    client.antinukeActionTracker = new Map();
    client.incidentCoordinator = new IncidentCoordinator();
    client.users = { cache: new Map() };
    client.isBotOwner = (id) => id === '999999999999999999';

    const antinukeData = {
        enabled: true,
        extraOwners: ['200000000000000002'],
        whitelisted: {
            '300000000000000003': {
                events: ['antiChannelDelete', 'antiChannelUpdate', 'antiRoleDelete']
            }
        },
        punishment: 'ban',
        disabledEvents: [],
        logsChannel: '666666666666666666',
        ...antinukeOverrides
    };

    const guildId = `500000000000${Math.floor(100000 + Math.random() * 899999)}`;
    client.antinukeCache.set(guildId, antinukeData);
    client.getAntinukeData = async (id) => client.antinukeCache.get(id);

    const logMessages = [];
    const createdChannels = [];
    const createdRoles = [];
    const banCalls = [];
    const verificationLevelCalls = [];
    const everyonePermCalls = [];

    const initialEveryoneBitfield =
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.Connect |
        PermissionFlagsBits.MentionEveryone;

    const everyoneRole = {
        id: guildId,
        name: '@everyone',
        managed: false,
        editable: true,
        permissions: new PermissionsBitField(initialEveryoneBitfield),
        setPermissions: async (newPerms, reason) => {
            const bitfield = typeof newPerms === 'bigint' ? newPerms : new PermissionsBitField(newPerms).bitfield;
            everyoneRole.permissions = new PermissionsBitField(bitfield);
            everyonePermCalls.push({ bitfield, reason });
            return everyoneRole;
        }
    };

    const logChannel = {
        id: '666666666666666666',
        send: async (payload) => {
            logMessages.push(payload);
            return payload;
        }
    };

    let createSeq = 1;
    const guild = {
        id: guildId,
        ownerId: '111111111111111111',
        client,
        verificationLevel: 1,
        setVerificationLevel: async (level, reason) => {
            guild.verificationLevel = level;
            verificationLevelCalls.push({ level, reason });
            return guild;
        },
        members: {
            me: {
                permissions: new PermissionsBitField([
                    PermissionFlagsBits.Administrator,
                    PermissionFlagsBits.ViewAuditLog,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageRoles
                ]),
                roles: {
                    highest: { position: 20 }
                }
            },
            cache: new Map(),
            fetch: async (id) => guild.members.cache.get(id) || null
        },
        channels: {
            cache: new Map([['666666666666666666', logChannel]]),
            fetch: async (id) => guild.channels.cache.get(id) || null,
            create: async (opts) => {
                const newId = `created_ch_${createSeq++}`;
                const ch = {
                    id: newId,
                    guild,
                    name: opts.name,
                    type: opts.type ?? ChannelType.GuildText,
                    parentId: opts.parent ?? null,
                    rawPosition: opts.position ?? 0,
                    topic: opts.topic ?? null,
                    nsfw: Boolean(opts.nsfw),
                    rateLimitPerUser: opts.rateLimitPerUser ?? 0,
                    permissionOverwrites: {
                        cache: new Map((opts.permissionOverwrites || []).map((ow) => [ow.id, ow]))
                    },
                    isThread: () => false
                };
                createdChannels.push({ id: newId, opts, channel: ch });
                return ch;
            }
        },
        roles: {
            everyone: everyoneRole,
            cache: new Map([[guildId, everyoneRole]]),
            create: async (opts) => {
                const newId = `created_role_${createSeq++}`;
                const roleObj = {
                    id: newId,
                    guild,
                    name: opts.name,
                    color: opts.color ?? 0,
                    hoist: Boolean(opts.hoist),
                    mentionable: Boolean(opts.mentionable),
                    managed: false,
                    rawPosition: 1,
                    permissions: new PermissionsBitField(opts.permissions ?? 0n),
                    setPosition: async (pos) => {
                        roleObj.rawPosition = pos;
                        return roleObj;
                    }
                };
                createdRoles.push({ id: newId, opts, role: roleObj });
                return roleObj;
            }
        },
        bans: {
            create: async (userId, opts) => {
                banCalls.push({ userId, opts });
                return { user: { id: userId } };
            },
            remove: async (userId, reason) => ({ userId, reason })
        },
        fetchWebhooks: async () => new Map(),
        fetchAuditLogs: async () => ({ entries: new Map() })
    };

    client.guilds = {
        cache: new Map([[guildId, guild]])
    };

    return {
        client,
        guild,
        antinukeData,
        everyoneRole,
        initialEveryoneBitfield,
        createdChannels,
        createdRoles,
        banCalls,
        verificationLevelCalls,
        everyonePermCalls,
        logMessages
    };
}

// ============================================================================
// 1. CIRCUIT BREAKER DEDUPLICATION & SAFE LOCKDOWN RESTORATION (CB-01 / DET-04)
// ============================================================================

test('Phase C [CB-01 & DET-04]: circuitBreaker deduplicates identical incidents, ignores trusted/unknown actors, and only trips on >= 2 distinct untrusted incidents', async () => {
    const { client, guild } = createMockEnvironment();
    const attacker = { id: '777777777777777801', tag: 'Raider#0001' };
    const guildOwner = { id: guild.ownerId, tag: 'Owner#0001' };

    // 1. Trusted actor (guild owner) and null executor must never increment incidentTracker
    const ownerRecorded = await circuitBreaker.recordIncident(guild, client, 'antiChannelDelete', guildOwner, {
        incidentKey: 'owner_inc_1',
        targetId: 'ch_1'
    });
    const unknownRecorded = await circuitBreaker.recordIncident(guild, client, 'antiChannelDelete', null, {
        incidentKey: 'unknown_inc_1',
        targetId: 'ch_2'
    });
    assert.equal(ownerRecorded, false, 'Guild owner action must not be counted by circuitBreaker');
    assert.equal(unknownRecorded, false, 'Unattributed action must not be counted by circuitBreaker');
    assert.equal(circuitBreaker.isLockedDown(guild.id), false);

    // 2. Duplicate delivery of the SAME incident (same incidentKey / auditEntryId / targetId) must only count ONCE
    const firstDelivery = await circuitBreaker.recordIncident(guild, client, 'antiChannelDelete', attacker, {
        incidentKey: `${guild.id}:antiChannelDelete:ch_10`,
        auditEntryId: 'audit_1001',
        targetId: 'ch_10',
        moduleKey: 'antiChannelDelete'
    });
    const duplicateDeliveryByKey = await circuitBreaker.recordIncident(guild, client, 'antiChannelDelete', attacker, {
        incidentKey: `${guild.id}:antiChannelDelete:ch_10`,
        auditEntryId: 'audit_1001',
        targetId: 'ch_10',
        moduleKey: 'antiChannelDelete'
    });
    const duplicateDeliveryByTarget = await circuitBreaker.recordIncident(guild, client, 'antiChannelDelete', attacker, {
        auditEntryId: 'audit_1001',
        targetId: 'ch_10',
        moduleKey: 'antiChannelDelete'
    });

    assert.equal(firstDelivery, true, 'First delivery of untrusted incident must be recorded');
    assert.equal(duplicateDeliveryByKey, false, 'Duplicate delivery with same incidentKey must be ignored');
    assert.equal(duplicateDeliveryByTarget, false, 'Duplicate delivery with same auditEntryId/targetId must be ignored');
    assert.equal(
        circuitBreaker.isLockedDown(guild.id),
        false,
        'Single incident delivered multiple times must NEVER trip lockdown'
    );

    // 3. A second DISTINCT incident within 2 seconds trips the circuit breaker
    const secondIncident = await circuitBreaker.recordIncident(guild, client, 'antiChannelDelete', attacker, {
        incidentKey: `${guild.id}:antiChannelDelete:ch_11`,
        auditEntryId: 'audit_1002',
        targetId: 'ch_11',
        moduleKey: 'antiChannelDelete',
        lockdownDurationMs: 500
    });
    assert.equal(secondIncident, true);
    assert.equal(circuitBreaker.isLockedDown(guild.id), true, 'Two distinct incidents within 2s must trip lockdown');

    await circuitBreaker.restoreLockdown(guild, client);
});

test('Phase C [CB-01]: circuitBreaker applies scoped @everyone lockdown, quarantines managed-role bots safely, and idempotently restores pre-lockdown settings', async () => {
    const {
        client,
        guild,
        antinukeData,
        everyoneRole,
        initialEveryoneBitfield,
        verificationLevelCalls,
        everyonePermCalls
    } = createMockEnvironment();

    // Add an unwhitelisted bot holding a managed integration role (role.managed === true)
    let managedRoleZeroed = false;
    const managedBotRole = {
        id: '888000000000000001',
        name: 'RogueBot Managed Role',
        managed: true,
        editable: true,
        permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
        setPermissions: async (perms) => {
            if (perms === 0n) managedRoleZeroed = true;
        }
    };
    guild.members.cache.set('777777777777777899', {
        id: '777777777777777899',
        user: { id: '777777777777777899', tag: 'UnwhitelistedBot#0099', bot: true },
        manageable: true,
        roles: {
            cache: new Map([[managedBotRole.id, managedBotRole]]),
            remove: async () => {
                throw new Error('50028 Invalid Role if called on managed role');
            }
        }
    });

    const attacker = { id: '777777777777777802', tag: 'BurstRaider#0002' };
    await circuitBreaker.tripBreaker(guild, client, antinukeData, 'antiChannelDelete', attacker, {
        lockdownDurationMs: 5000
    });

    assert.equal(circuitBreaker.isLockedDown(guild.id), true);
    assert.equal(managedRoleZeroed, true, 'Circuit breaker bot quarantine must zero permissions on managed bot roles');
    assert.equal(guild.verificationLevel, 4, 'Verification level must be elevated to 4 during lockdown');

    // Verify scoped @everyone permissions: SendMessages, Connect, MentionEveryone stripped; ViewChannel & ReadMessageHistory preserved
    assert.equal(everyoneRole.permissions.has(PermissionFlagsBits.SendMessages), false);
    assert.equal(everyoneRole.permissions.has(PermissionFlagsBits.Connect), false);
    assert.equal(everyoneRole.permissions.has(PermissionFlagsBits.MentionEveryone), false);
    assert.equal(everyoneRole.permissions.has(PermissionFlagsBits.ViewChannel), true);
    assert.equal(everyoneRole.permissions.has(PermissionFlagsBits.ReadMessageHistory), true);

    // Re-entering tripBreaker while locked down must be a no-op and must NOT overwrite pre-lockdown baseline
    const secondTrip = await circuitBreaker.tripBreaker(guild, client, antinukeData, 'antiChannelDelete', attacker, {
        lockdownDurationMs: 5000
    });
    assert.equal(secondTrip, false, 'Re-tripping during active lockdown must return false without overwriting baseline');

    // Restore lockdown and verify exact pre-lockdown state is restored idempotently
    const restoredFirst = await circuitBreaker.restoreLockdown(guild, client);
    const restoredSecond = await circuitBreaker.restoreLockdown(guild, client);

    assert.equal(restoredFirst, true);
    assert.equal(restoredSecond, false, 'Second restoreLockdown call must be idempotent no-op');
    assert.equal(circuitBreaker.isLockedDown(guild.id), false);
    assert.equal(guild.verificationLevel, 1, 'Original verificationLevel (1) must be restored');
    assert.equal(
        everyoneRole.permissions.bitfield,
        initialEveryoneBitfield,
        'Original @everyone permissions bitfield must be restored'
    );
    assert.equal(verificationLevelCalls.length, 2, 'Exactly 1 elevation + 1 restoration call');
    assert.equal(everyonePermCalls.length, 2, 'Exactly 1 lockdown scope + 1 restoration call');
});

// ============================================================================
// 2. IDEMPOTENT RECONSTRUCTION & RECOVERY RACES (REC-01)
// ============================================================================

test('Phase C [REC-01]: blueprintManager.restoreChannelHierarchical and restoreRole are idempotent across concurrent and sequential calls', async () => {
    const { guild, createdChannels, createdRoles } = createMockEnvironment();

    const originalChannel = {
        id: 'ch_orig_501',
        guild,
        name: 'announcements',
        type: ChannelType.GuildText,
        parentId: null,
        rawPosition: 2,
        topic: 'Official server news',
        nsfw: false,
        rateLimitPerUser: 5,
        permissionOverwrites: { cache: new Map() },
        isThread: () => false
    };
    blueprintManager.recordChannel(originalChannel);

    // Fire 2 concurrent calls + 1 sequential call after completion for the same deleted channel ID
    const [res1, res2] = await Promise.all([
        blueprintManager.restoreChannelHierarchical(guild, originalChannel),
        blueprintManager.restoreChannelHierarchical(guild, originalChannel)
    ]);
    const res3 = await blueprintManager.restoreChannelHierarchical(guild, originalChannel);

    assert.equal(res1, true);
    assert.equal(res2, true);
    assert.equal(res3, true);
    assert.equal(
        createdChannels.length,
        1,
        'Deleted channel must be recreated exactly once across concurrent and post-completion calls'
    );
    assert.equal(createdChannels[0].opts.name, 'announcements');
    assert.equal(createdChannels[0].opts.topic, 'Official server news');

    // Role restoration idempotency + member role re-assignment
    const memberRoleAddCalls = [];
    const memberId = '444444444444444444';
    guild.members.cache.set(memberId, {
        id: memberId,
        manageable: true,
        roles: {
            add: async (roleId, reason) => {
                memberRoleAddCalls.push({ roleId, reason });
            }
        }
    });

    const originalRole = {
        id: 'role_orig_601',
        guild,
        name: 'Server Staff',
        color: 0x3498db,
        hoist: true,
        mentionable: true,
        managed: false,
        rawPosition: 5,
        permissions: new PermissionsBitField([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers]),
        members: new Map([[memberId, { id: memberId }]])
    };
    blueprintManager.recordRole(originalRole);

    const [roleRes1, roleRes2] = await Promise.all([
        blueprintManager.restoreRole(guild, originalRole),
        blueprintManager.restoreRole(guild, originalRole)
    ]);
    const roleRes3 = await blueprintManager.restoreRole(guild, originalRole);

    assert.equal(roleRes1, true);
    assert.equal(roleRes2, true);
    assert.equal(roleRes3, true);
    assert.equal(createdRoles.length, 1, 'Deleted role must be recreated exactly once');
    assert.equal(createdRoles[0].opts.name, 'Server Staff');
    assert.equal(memberRoleAddCalls.length, 1, 'Recreated role must be re-assigned to cached member who held it');
    assert.equal(memberRoleAddCalls[0].roleId, createdRoles[0].id);
});

test('Phase C [REC-01]: concurrent category, child channels, orphaned surviving child, and deleted role permission overwrites synchronize without race duplicates', async () => {
    const { guild, createdChannels, createdRoles } = createMockEnvironment();

    const staffRole = {
        id: 'role_staff_700',
        guild,
        name: 'Mod Team',
        color: 0x00ff00,
        hoist: true,
        mentionable: false,
        managed: false,
        rawPosition: 4,
        permissions: new PermissionsBitField([PermissionFlagsBits.ManageMessages]),
        members: new Map()
    };

    const category = {
        id: 'cat_staff_701',
        guild,
        name: 'Staff Headquarters',
        type: ChannelType.GuildCategory,
        parentId: null,
        rawPosition: 1,
        permissionOverwrites: {
            cache: new Map([
                [
                    staffRole.id,
                    {
                        id: staffRole.id,
                        type: OverwriteType.Role,
                        allow: new PermissionsBitField([PermissionFlagsBits.ViewChannel]),
                        deny: new PermissionsBitField(0n)
                    }
                ]
            ])
        },
        isThread: () => false
    };

    const child1 = {
        id: 'ch_child_702',
        guild,
        name: 'mod-chat',
        type: ChannelType.GuildText,
        parentId: category.id,
        rawPosition: 1,
        permissionOverwrites: {
            cache: new Map([
                [
                    staffRole.id,
                    {
                        id: staffRole.id,
                        type: OverwriteType.Role,
                        allow: new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]),
                        deny: new PermissionsBitField(0n)
                    }
                ]
            ])
        },
        isThread: () => false
    };

    const child2 = {
        id: 'ch_child_703',
        guild,
        name: 'mod-logs',
        type: ChannelType.GuildText,
        parentId: category.id,
        rawPosition: 2,
        permissionOverwrites: { cache: new Map() },
        isThread: () => false
    };

    const reattachedParents = [];
    const survivingOrphanChild = {
        id: 'ch_child_704',
        guild,
        name: 'surviving-channel',
        type: ChannelType.GuildText,
        parentId: category.id,
        rawPosition: 3,
        permissionOverwrites: { cache: new Map() },
        isThread: () => false,
        setParent: async (newParentId) => {
            survivingOrphanChild.parentId = newParentId;
            reattachedParents.push(newParentId);
            return survivingOrphanChild;
        }
    };

    // Snapshot initial healthy state
    blueprintManager.recordRole(staffRole);
    blueprintManager.recordChannel(category);
    blueprintManager.recordChannel(child1);
    blueprintManager.recordChannel(child2);
    blueprintManager.recordChannel(survivingOrphanChild);

    // Simulate nuke: category is deleted from cache, survivingOrphanChild gets parentId = null via Discord orphan cascade
    survivingOrphanChild.parentId = null;
    guild.channels.cache.set(survivingOrphanChild.id, survivingOrphanChild);
    blueprintManager.recordChannel(survivingOrphanChild); // Should preserve category linkage despite parentId === null!

    // Simultaneously restore deleted role, deleted category, and both deleted child channels
    await Promise.all([
        blueprintManager.restoreRole(guild, staffRole),
        blueprintManager.restoreChannelHierarchical(guild, child1),
        blueprintManager.restoreChannelHierarchical(guild, child2),
        blueprintManager.restoreChannelHierarchical(guild, category)
    ]);

    const recreatedCats = createdChannels.filter((c) => c.opts.type === ChannelType.GuildCategory);
    const recreatedTexts = createdChannels.filter((c) => c.opts.type === ChannelType.GuildText);

    assert.equal(recreatedCats.length, 1, 'Category must be recreated exactly once despite 3 concurrent callers');
    assert.equal(recreatedTexts.length, 2, 'Both deleted child channels must be recreated once');
    assert.equal(createdRoles.length, 1, 'Deleted staff role must be recreated once');

    const newCatId = recreatedCats[0].id;
    const newRoleId = createdRoles[0].id;

    // Both recreated child channels must be parented to the newly recreated category ID
    assert.equal(recreatedTexts[0].opts.parent, newCatId);
    assert.equal(recreatedTexts[1].opts.parent, newCatId);

    // Surviving orphaned child channel must be re-attached to the newly recreated category ID
    assert.deepEqual(reattachedParents, [newCatId]);

    // Recreated child1 must have its permission overwrite remapped from old staffRole.id to newRoleId
    const child1Created = recreatedTexts.find((c) => c.opts.name === 'mod-chat');
    assert.ok(child1Created);
    assert.equal(
        child1Created.opts.permissionOverwrites.some((ow) => ow.id === newRoleId),
        true,
        'Channel permission overwrite must remap deleted role ID to newly recreated role ID'
    );
});

// ============================================================================
// 3. SNAPSHOT VALIDATION & ANTI-POISONING GUARDS (REC-02)
// ============================================================================

test('Phase C [REC-02]: blueprintManager validates snapshots, blocks captureGuild overwrite after >30% resource loss, and prevents untrusted channelUpdate poisoning', async () => {
    const { client, guild } = createMockEnvironment();

    // 1. Structural validation rejects invalid candidates
    assert.equal(blueprintManager.isValidChannel(null), false);
    assert.equal(blueprintManager.isValidChannel({ id: '1', guild, name: '' }), false);
    assert.equal(blueprintManager.isValidChannel({ id: '1', guild, name: 'thread', isThread: () => true }), false);
    assert.equal(blueprintManager.isValidRole({ id: guild.id, guild, name: '@everyone', managed: false }), false);
    assert.equal(blueprintManager.isValidRole({ id: '2', guild, name: 'BotRole', managed: true }), false);

    // 2. Populate 5 healthy channels in guild cache and capture baseline
    for (let i = 1; i <= 5; i++) {
        guild.channels.cache.set(`healthy_ch_${i}`, {
            id: `healthy_ch_${i}`,
            guild,
            name: `channel-${i}`,
            type: ChannelType.GuildText,
            parentId: null,
            rawPosition: i,
            permissionOverwrites: { cache: new Map() },
            isThread: () => false
        });
    }
    const baselineCaptured = blueprintManager.captureGuild(guild);
    assert.equal(baselineCaptured, true);

    // Simulate slow attack where 4 of the 5 channels were deleted and remaining channel was renamed
    guild.channels.cache.clear();
    guild.channels.cache.set('healthy_ch_1', {
        id: 'healthy_ch_1',
        guild,
        name: 'poisoned-channel-1',
        type: ChannelType.GuildText,
        parentId: null,
        rawPosition: 1,
        permissionOverwrites: { cache: new Map() },
        isThread: () => false
    });

    const poisonedCaptureResult = blueprintManager.captureGuild(guild);
    assert.equal(
        poisonedCaptureResult,
        false,
        'captureGuild must refuse to overwrite healthy snapshot when >30% of channels disappeared'
    );
    assert.equal(
        blueprintManager.getChannelSnapshot(guild.id, 'healthy_ch_1')?.name,
        'channel-1',
        'Existing healthy channel snapshot must not be overwritten by poisoned captureGuild'
    );
    assert.equal(
        blueprintManager.getChannelSnapshot(guild.id, 'healthy_ch_5')?.name,
        'channel-5',
        'Deleted channel snapshots must remain intact'
    );

    // 3. Verify untrusted channelUpdate does not poison blueprint before channelDelete recovery
    await antiChannelUpdateModule.execute(client);
    await antiChannelDeleteModule.execute(client);

    const attacker = { id: '777777777777777805', tag: 'ChannelVandal#0005' };
    const oldCh = {
        id: 'healthy_ch_2',
        guild,
        name: 'channel-2',
        type: ChannelType.GuildText,
        parentId: null,
        rawPosition: 2,
        permissionOverwrites: { cache: new Map() },
        isThread: () => false
    };
    const vandalizedCh = {
        ...oldCh,
        name: 'nuked-by-vandal',
        edit: async () => vandalizedCh
    };

    guild.fetchAuditLogs = async ({ type }) => {
        if (type === AuditLogEvent.ChannelUpdate) {
            return {
                entries: new Map([
                    [
                        '1800000000000000501',
                        {
                            id: '1800000000000000501',
                            action: AuditLogEvent.ChannelUpdate,
                            target: { id: 'healthy_ch_2' },
                            executor: attacker,
                            createdTimestamp: Date.now()
                        }
                    ]
                ])
            };
        }
        return { entries: new Map() };
    };

    client.emit('channelUpdate', oldCh, vandalizedCh);
    await new Promise((r) => setTimeout(r, 90));

    assert.equal(
        blueprintManager.getChannelSnapshot(guild.id, 'healthy_ch_2')?.name,
        'channel-2',
        'Untrusted channelUpdate must NEVER overwrite healthy blueprint snapshot with vandalized name'
    );
});
