import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import { getAuditExecutor, selectMatchingAuditEntry } from '../src/utils/getExecutor.js';
import { evaluateActorTrust, AUDIT_EVENT_TO_MODULE } from '../src/utils/securityPolicy.js';
import { IncidentCoordinator } from '../src/utils/incidentCoordinator.js';
import { punishExecutor } from '../src/utils/punishExecutor.js';
import { data as antiBotModule } from '../src/antinuke/antiBot.js';
import { data as antiChannelDeleteModule } from '../src/antinuke/antiChannelDelete.js';

/**
 * Helper to create an isolated mock client + guild without touching live Discord APIs or SQLite files.
 */
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
                events: ['antiChannelDelete', 'antiBot']
            }
        },
        punishment: 'ban',
        disabledEvents: [],
        logsChannel: null,
        ...antinukeOverrides
    };

    const guildId = '500000000000000005';
    client.antinukeCache.set(guildId, antinukeData);
    client.getAntinukeData = async (id) => client.antinukeCache.get(id);

    const banCalls = [];
    const kickCalls = [];
    const roleSetCalls = [];
    const logMessages = [];

    const guild = {
        id: guildId,
        ownerId: '111111111111111111',
        client,
        members: {
            me: {
                permissions: {
                    has: (perm) => perm === PermissionFlagsBits.ViewAuditLog
                }
            },
            cache: new Map(),
            fetch: async (id) => guild.members.cache.get(id) || null
        },
        channels: {
            cache: new Map(),
            fetch: async (id) => guild.channels.cache.get(id) || null
        },
        bans: {
            create: async (userId, opts) => {
                banCalls.push({ userId, opts });
                return { user: { id: userId } };
            },
            remove: async (userId, reason) => ({ userId, reason })
        },
        fetchAuditLogs: async () => ({ entries: new Map() })
    };

    client.guilds = {
        cache: new Map([[guildId, guild]])
    };

    return {
        client,
        guild,
        antinukeData,
        banCalls,
        kickCalls,
        roleSetCalls,
        logMessages
    };
}

test('A1.1 — Exact target attribution resolves matching executor and auditEntryId', async () => {
    const { client, guild } = createMockEnvironment();
    const now = Date.now();

    guild.fetchAuditLogs = async ({ type }) => {
        assert.equal(type, AuditLogEvent.ChannelDelete);
        return {
            entries: new Map([
                ['7001', {
                    id: '7001',
                    action: AuditLogEvent.ChannelDelete,
                    target: { id: 'chan_exact_1' },
                    executor: { id: '444444444444444444', tag: 'Attacker#0001' },
                    createdTimestamp: now - 200
                }]
            ])
        };
    };

    const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, 'chan_exact_1', client, {
        retries: 0,
        wsWaitMs: 10
    });

    assert.ok(executor, 'Expected matching executor to be returned');
    assert.equal(executor.id, '444444444444444444');
    assert.equal(executor.auditEntryId, '7001');
});

test('A1.2 — Mismatched audit entries and wildcard cache entries are never used as confirmed executor', async () => {
    const { client, guild } = createMockEnvironment();
    const now = Date.now();

    // Populate cache with a different target AND a legacy _any key
    const otherTargetData = {
        guildId: guild.id,
        action: AuditLogEvent.ChannelDelete,
        targetId: 'chan_other',
        executor: { id: '111111111111111111', tag: 'Owner#0001' },
        createdTimestamp: now
    };
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.ChannelDelete}_chan_other`, otherTargetData);
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.ChannelDelete}_any`, otherTargetData);

    // REST also returns a recent entry for chan_other, not chan_target
    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['7002', {
                id: '7002',
                action: AuditLogEvent.ChannelDelete,
                target: { id: 'chan_other' },
                executor: { id: '111111111111111111', tag: 'Owner#0001' },
                createdTimestamp: now - 100
            }]
        ])
    });

    const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, 'chan_target', client, {
        retries: 0,
        wsWaitMs: 10
    });

    assert.equal(executor, null, 'Mismatched target must return null and never fall back to _any or .first()');
});

test('A1.3 — Delayed audit-log events are resolved via bounded retries without guessing', async () => {
    const { client, guild } = createMockEnvironment();
    let fetchCalls = 0;

    guild.fetchAuditLogs = async () => {
        fetchCalls += 1;
        if (fetchCalls < 2) {
            // First attempt: entry not yet indexed by Discord
            return { entries: new Map() };
        }
        return {
            entries: new Map([
                ['7003', {
                    id: '7003',
                    action: AuditLogEvent.RoleDelete,
                    target: { id: 'role_delayed_1' },
                    executor: { id: '555555555555555555', tag: 'DelayedActor#0001' },
                    createdTimestamp: Date.now() - 50
                }]
            ])
        };
    };

    const executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, 'role_delayed_1', client, {
        retries: 2,
        retryDelayMs: 20,
        wsWaitMs: 10
    });

    assert.equal(fetchCalls, 2);
    assert.ok(executor);
    assert.equal(executor.id, '555555555555555555');
});

test('A1.4 — Missing executors and ambiguous conflicting audit entries return null safely', async () => {
    const { client, guild } = createMockEnvironment();
    const now = Date.now();

    // Case 1: Entry has no executor
    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['7004', {
                id: '7004',
                action: AuditLogEvent.ChannelDelete,
                target: { id: 'chan_no_exec' },
                executor: null,
                createdTimestamp: now - 100
            }]
        ])
    });

    const missingExec = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, 'chan_no_exec', client, {
        retries: 0,
        wsWaitMs: 10
    });
    assert.equal(missingExec, null);

    // Case 2: Ambiguous simultaneous entries for same target with different executors
    const ambiguousSelection = selectMatchingAuditEntry([
        {
            id: '7005',
            action: AuditLogEvent.ChannelUpdate,
            target: { id: 'chan_ambig' },
            executor: { id: '8001' },
            createdTimestamp: now - 100
        },
        {
            id: '7006',
            action: AuditLogEvent.ChannelUpdate,
            target: { id: 'chan_ambig' },
            executor: { id: '8002' },
            createdTimestamp: now - 200
        }
    ], {
        type: AuditLogEvent.ChannelUpdate,
        targetId: 'chan_ambig',
        hasSpecificTarget: true,
        now
    });

    assert.equal(ambiguousSelection.status, 'ambiguous');
    assert.equal(ambiguousSelection.entry, null);
});

test('A1.5 — Concurrent unrelated actions coalescing REST fetch still resolve each caller strictly by its own targetId', async () => {
    const { client, guild } = createMockEnvironment();
    const now = Date.now();
    let restCallCount = 0;

    guild.fetchAuditLogs = async () => {
        restCallCount += 1;
        await new Promise((r) => setTimeout(r, 20));
        return {
            entries: new Map([
                ['8010', {
                    id: '8010',
                    action: AuditLogEvent.ChannelDelete,
                    target: { id: 'channel_A' },
                    executor: { id: '111111111111111111', tag: 'Owner#0001' },
                    createdTimestamp: now - 50
                }],
                ['8011', {
                    id: '8011',
                    action: AuditLogEvent.ChannelDelete,
                    target: { id: 'channel_B' },
                    executor: { id: '666666666666666666', tag: 'Attacker#0001' },
                    createdTimestamp: now - 40
                }]
            ])
        };
    };

    const [execA, execB, execUnrelated] = await Promise.all([
        getAuditExecutor(guild, AuditLogEvent.ChannelDelete, 'channel_A', client, { retries: 0, wsWaitMs: 5 }),
        getAuditExecutor(guild, AuditLogEvent.ChannelDelete, 'channel_B', client, { retries: 0, wsWaitMs: 5 }),
        getAuditExecutor(guild, AuditLogEvent.ChannelDelete, 'channel_C', client, { retries: 0, wsWaitMs: 5 })
    ]);

    assert.equal(restCallCount, 1, 'Expected concurrent fetches for same guild+type to coalesce HTTP call');
    assert.equal(execA?.id, '111111111111111111');
    assert.equal(execB?.id, '666666666666666666');
    assert.equal(execUnrelated, null, 'Unmatched target must not inherit channel_A or channel_B executor');
});

test('A2.1 — Trusted guild-owner, bot-owner, extra-owner, and per-event whitelisted actions are consistently exempted', async () => {
    const { client, guild, antinukeData, banCalls } = createMockEnvironment();

    // 1. Guild Owner
    const ownerTrust = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'antiChannelDelete',
        executorId: guild.ownerId,
        targetId: 'ch_1'
    });
    assert.equal(ownerTrust.trustState, 'trusted');
    assert.equal(ownerTrust.reason, 'guild_owner');
    assert.equal(ownerTrust.isExempt, true);

    // Verify punishExecutor refuses to ban Guild Owner even if invoked directly
    const punishRes = await punishExecutor(guild, { id: guild.ownerId }, 'ban', 'Test', client);
    assert.equal(punishRes, 'No Action');
    assert.equal(banCalls.length, 0);

    // 2. Global Bot Owner
    const botOwnerTrust = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'antiRoleDelete',
        executorId: '999999999999999999',
        targetId: 'role_1'
    });
    assert.equal(botOwnerTrust.trustState, 'trusted');
    assert.equal(botOwnerTrust.reason, 'bot_owner');

    // 3. Extra Owner
    const extraOwnerTrust = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'antiBan',
        executorId: '200000000000000002',
        targetId: 'user_1'
    });
    assert.equal(extraOwnerTrust.trustState, 'trusted');
    assert.equal(extraOwnerTrust.reason, 'extra_owner');

    // 4. Per-event Whitelisted User (exempt for antiChannelDelete, NOT exempt for antiRoleDelete)
    const wlAllowed = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'antiChannelDelete',
        executorId: '300000000000000003',
        targetId: 'ch_2'
    });
    assert.equal(wlAllowed.trustState, 'trusted');
    assert.equal(wlAllowed.isExempt, true);

    const wlDenied = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'antiRoleDelete',
        executorId: '300000000000000003',
        targetId: 'role_2'
    });
    assert.equal(wlDenied.trustState, 'untrusted');
    assert.equal(wlDenied.isExempt, false);

    // 5. Missing executor remains explicitly unknown
    const unknownTrust = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'antiChannelDelete',
        executorId: null,
        targetId: 'ch_3'
    });
    assert.equal(unknownTrust.trustState, 'unknown');
    assert.equal(unknownTrust.isExempt, false);
});

test('A3.1 — AntiBot resolves inviter before bot action, allows bots invited by Guild Owner, and does not ban on unresolved attribution', async () => {
    const { client, guild, banCalls } = createMockEnvironment();
    await antiBotModule.execute(client);

    // Case 1: Bot invited by Guild Owner -> neither bot nor owner is banned
    const botByOwner = {
        id: '888000000000000001',
        user: { id: '888000000000000001', bot: true, tag: 'GoodBot#0001' },
        guild,
        kick: async () => { throw new Error('Should not kick bot invited by Guild Owner'); }
    };
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.BotAdd}_${botByOwner.id}`, {
        guildId: guild.id,
        action: AuditLogEvent.BotAdd,
        targetId: botByOwner.id,
        auditEntryId: '9101',
        executor: { id: guild.ownerId, tag: 'ServerOwner#0001' },
        createdTimestamp: Date.now()
    });

    await client.emit('guildMemberAdd', botByOwner);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(banCalls.length, 0, 'Bot invited by Guild Owner must not be banned');

    // Case 2: Bot added with missing/unresolved attribution -> does NOT ban bot or crash on null executor
    const botUnresolved = {
        id: '888000000000000002',
        user: { id: '888000000000000002', bot: true, tag: 'MysteryBot#0001' },
        guild,
        kick: async () => { throw new Error('Should not kick bot when attribution is unresolved'); }
    };
    guild.fetchAuditLogs = async () => ({ entries: new Map() });

    await client.emit('guildMemberAdd', botUnresolved);
    await new Promise((r) => setTimeout(r, 380));
    assert.equal(banCalls.length, 0, 'Unresolved bot attribution must not trigger speculative ban');

    // Case 3: Bot invited by untrusted user -> bans both unauthorized bot and untrusted inviter
    const botByAttacker = {
        id: '888000000000000003',
        user: { id: '888000000000000003', bot: true, tag: 'NukeBot#0001' },
        guild,
        kick: async () => ({})
    };
    const attackerId = '777000000000000007';
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.BotAdd}_${botByAttacker.id}`, {
        guildId: guild.id,
        action: AuditLogEvent.BotAdd,
        targetId: botByAttacker.id,
        auditEntryId: '9103',
        executor: { id: attackerId, tag: 'RogueAdmin#0001' },
        createdTimestamp: Date.now()
    });

    await client.emit('guildMemberAdd', botByAttacker);
    await new Promise((r) => setTimeout(r, 30));

    const bannedIds = banCalls.map((b) => b.userId).sort();
    assert.deepEqual(bannedIds, [attackerId, botByAttacker.id].sort(), 'Expected both unauthorized bot and untrusted inviter to be banned');
});

test('A4.1 — Duplicate delivery of one incident across raw, audit-log, and module paths executes punishment and recovery only once', async () => {
    const { client, guild, antinukeData, banCalls } = createMockEnvironment();
    const coordinator = client.incidentCoordinator;
    const attacker = { id: '777111111111111111', tag: 'Attacker#1111' };
    const targetChannelId = '900111111111111111';
    const auditEntryId = '95001';
    const now = Date.now();

    // Delivery 1: Raw Gateway Sniffer
    const inc1 = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: AUDIT_EVENT_TO_MODULE[AuditLogEvent.ChannelDelete],
        targetId: targetChannelId,
        executorId: attacker.id,
        auditEntryId,
        timestamp: now
    });

    // Delivery 2: guildAuditLogEntryCreate
    const inc2 = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: 'antiChannelDelete',
        targetId: targetChannelId,
        executorId: attacker.id,
        auditEntryId,
        timestamp: now + 2
    });

    // Delivery 3: channelDelete listener
    const inc3 = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: 'antiChannelDelete',
        targetId: targetChannelId,
        executorId: attacker.id,
        auditEntryId,
        timestamp: now + 5
    });

    assert.equal(inc1, inc2);
    assert.equal(inc2, inc3);
    assert.equal(inc3.deliveries, 3);

    // Concurrent punishment calls across all 3 paths
    let recoveryCount = 0;
    const [p1, p2, p3] = await Promise.all([
        punishExecutor(guild, attacker, 'ban', 'Path 1', client, null, { incident: inc1, antinukeData, moduleKey: 'antiChannelDelete', targetId: targetChannelId }),
        punishExecutor(guild, attacker, 'ban', 'Path 2', client, null, { incident: inc2, antinukeData, moduleKey: 'antiChannelDelete', targetId: targetChannelId }),
        punishExecutor(guild, attacker, 'ban', 'Path 3', client, null, { incident: inc3, antinukeData, moduleKey: 'antiChannelDelete', targetId: targetChannelId })
    ]);

    assert.equal(p1, 'Banned');
    assert.equal(p2, 'Banned');
    assert.equal(p3, 'Banned');
    assert.equal(banCalls.length, 1, 'Expected guild.bans.create to be called exactly once for duplicate deliveries');

    // Concurrent recovery calls across paths
    const [r1, r2] = await Promise.all([
        coordinator.executeRecovery(inc1, async () => {
            recoveryCount += 1;
            return true;
        }),
        coordinator.executeRecovery(inc3, async () => {
            recoveryCount += 1;
            return true;
        })
    ]);

    assert.equal(r1, true);
    assert.equal(r2, true);
    assert.equal(recoveryCount, 1, 'Expected recovery to execute once for the deduplicated incident');

    // Circuit breaker claim
    assert.equal(coordinator.claimCircuitBreaker(inc1), true);
    assert.equal(coordinator.claimCircuitBreaker(inc2), false);
    assert.equal(coordinator.claimCircuitBreaker(inc3), false);
});

test('A4.2 — Two separate incidents with similar timestamps (different targets) remain distinct and each recovers its own resource', async () => {
    const { client, guild, antinukeData } = createMockEnvironment();
    const coordinator = client.incidentCoordinator;
    const now = Date.now();

    const incChannelA = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: 'antiChannelDelete',
        targetId: 'channel_101',
        executorId: '777222222222222222',
        auditEntryId: '96001',
        timestamp: now
    });

    const incChannelB = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: 'antiChannelDelete',
        targetId: 'channel_102',
        executorId: '777222222222222222',
        auditEntryId: '96002',
        timestamp: now + 1
    });

    assert.notEqual(incChannelA, incChannelB, 'Different targets at similar timestamps must not be merged');
    assert.notEqual(incChannelA.incidentId, incChannelB.incidentId);

    const recoveredTargets = [];
    await Promise.all([
        coordinator.executeRecovery(incChannelA, async () => {
            recoveredTargets.push('channel_101');
            return true;
        }),
        coordinator.executeRecovery(incChannelB, async () => {
            recoveredTargets.push('channel_102');
            return true;
        })
    ]);

    assert.deepEqual(recoveredTargets.sort(), ['channel_101', 'channel_102']);
    assert.equal(coordinator.claimCircuitBreaker(incChannelA), true);
    assert.equal(coordinator.claimCircuitBreaker(incChannelB), true);
});

test('A4.3 — Failed early punishment or recovery attempt does not permanently suppress a subsequent retry', async () => {
    const { client, guild, antinukeData } = createMockEnvironment();
    const coordinator = client.incidentCoordinator;
    const attacker = { id: '777333333333333333', tag: 'RetryTarget#0001' };

    let banAttempts = 0;
    guild.bans.create = async () => {
        banAttempts += 1;
        if (banAttempts === 1) {
            throw new Error('Simulated transient network failure on first attempt');
        }
        return { user: { id: attacker.id } };
    };

    const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: 'antiChannelDelete',
        targetId: 'channel_retry_1',
        executorId: attacker.id,
        auditEntryId: '97001'
    });

    // First attempt fails
    const firstOutcome = await punishExecutor(
        guild,
        attacker,
        'ban',
        'Attempt 1',
        client,
        null,
        { incident, antinukeData, moduleKey: 'antiChannelDelete', targetId: 'channel_retry_1' }
    );
    assert.equal(firstOutcome, 'No Action');
    assert.equal(incident.enforcement.status, 'failed');

    // Second attempt (retry by downstream handler) is NOT suppressed and succeeds
    const secondOutcome = await punishExecutor(
        guild,
        attacker,
        'ban',
        'Attempt 2',
        client,
        null,
        { incident, antinukeData, moduleKey: 'antiChannelDelete', targetId: 'channel_retry_1' }
    );
    assert.equal(secondOutcome, 'Banned');
    assert.equal(banAttempts, 2);
    assert.equal(incident.enforcement.status, 'succeeded');

    // Recovery retry after early failure
    let recAttempts = 0;
    const firstRec = await coordinator.executeRecovery(incident, async () => {
        recAttempts += 1;
        return false;
    });
    assert.equal(firstRec, false);
    assert.equal(incident.recovery.status, 'failed');

    const secondRec = await coordinator.executeRecovery(incident, async () => {
        recAttempts += 1;
        return true;
    });
    assert.equal(secondRec, true);
    assert.equal(recAttempts, 2);
    assert.equal(incident.recovery.status, 'succeeded');
});

test('A5.1 — All 22 AntiNuke module files (covering 24 event listeners) load cleanly and preserve registration contracts', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const antinukeDir = path.resolve('src/antinuke');
    const files = fs.readdirSync(antinukeDir).filter(f => f.endsWith('.js')).sort();
    assert.equal(files.length, 22, 'Expected all 22 AntiNuke module files to remain present');

    const registeredEvents = [];
    const mockClient = {
        on(event, handler) {
            registeredEvents.push({ event, handler });
        }
    };

    for (const file of files) {
        const mod = await import(`../src/antinuke/${file}`);
        assert.equal(typeof mod.data?.execute, 'function', `Module ${file} must export data.execute(client)`);
        await mod.data.execute(mockClient);
    }

    assert.equal(registeredEvents.length, 24, 'Expected all 24 event listeners across the 22 AntiNuke modules to register');
});

test('A5.2 — Modified event adapters (antiChannelDelete, antiRoleDelete, antiBan, antiKick, antiChannelCreate, antiRoleCreate, antiPrune, zeroTrustQuarantine) coordinate decisions and exempt Guild Owner', async () => {
    const { client, guild, antinukeData, banCalls } = createMockEnvironment();
    const listeners = new Map();
    client.on = (event, fn) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
    };

    const antiChannelCreate = await import('../src/antinuke/antiChannelCreate.js');
    const antiRoleCreate = await import('../src/antinuke/antiRoleCreate.js');
    const antiBan = await import('../src/antinuke/antiBan.js');
    const antiKick = await import('../src/antinuke/antiKick.js');
    const antiPrune = await import('../src/antinuke/antiPrune.js');
    const ztq = await import('../src/antinuke/zeroTrustQuarantine.js');

    await antiChannelCreate.data.execute(client);
    await antiRoleCreate.data.execute(client);
    await antiBan.data.execute(client);
    await antiKick.data.execute(client);
    await antiPrune.data.execute(client);
    await ztq.data.execute(client);

    // 1. Guild Owner creates a channel -> exempted, channel.delete NOT called
    let channelDeleted = false;
    const ownerChan = {
        id: '991001',
        name: 'owner-channel',
        guild,
        delete: async () => {
            channelDeleted = true;
            return true;
        }
    };
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.ChannelCreate}_${ownerChan.id}`, {
        guildId: guild.id,
        action: AuditLogEvent.ChannelCreate,
        targetId: ownerChan.id,
        auditEntryId: '88001',
        executor: { id: guild.ownerId, tag: 'GuildOwner#0001' },
        createdTimestamp: Date.now()
    });
    for (const fn of listeners.get('channelCreate') || []) {
        await fn(ownerChan);
    }
    assert.equal(channelDeleted, false, 'Guild Owner channel creation must not be deleted');
    assert.equal(banCalls.length, 0);

    // 2. Unauthorized user creates a channel -> banned once and channel deleted once
    const attacker = { id: '888111222333444555', tag: 'Attacker#9999' };
    const badChan = {
        id: '991002',
        name: 'nuke-channel',
        guild,
        delete: async () => {
            channelDeleted = true;
            return true;
        }
    };
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.ChannelCreate}_${badChan.id}`, {
        guildId: guild.id,
        action: AuditLogEvent.ChannelCreate,
        targetId: badChan.id,
        auditEntryId: '88002',
        executor: attacker,
        createdTimestamp: Date.now()
    });
    for (const fn of listeners.get('channelCreate') || []) {
        await fn(badChan);
    }
    assert.equal(channelDeleted, true, 'Unauthorized created channel must be deleted');
    assert.equal(banCalls.length, 1);

    // 3. antiPrune handles MemberPrune (21) and exempts Guild Owner while enforcing on untrusted actor
    const pruneListeners = (listeners.get('guildAuditLogEntryCreate') || []);
    await pruneListeners[0]({
        id: '88003',
        action: AuditLogEvent.MemberPrune,
        executor: { id: guild.ownerId, tag: 'GuildOwner#0001' },
        createdTimestamp: Date.now()
    }, guild);
    assert.equal(banCalls.length, 1, 'Guild Owner prune must not trigger ban');

    const pruneAttacker = { id: '888999000111222333', tag: 'Pruner#0001' };
    await pruneListeners[0]({
        id: '88004',
        action: AuditLogEvent.MemberPrune,
        executor: pruneAttacker,
        createdTimestamp: Date.now()
    }, guild);
    assert.equal(banCalls.length, 2, 'Unauthorized prune must trigger ban');
    assert.equal(banCalls[1].userId, pruneAttacker.id);
});

test('A5.3 — Slash and prefix /antinuke and !antinuke command contracts remain intact', async () => {
    const slashCmd = await import('../src/commands/slash/antinuke/antinuke.js');
    const prefixCmd = await import('../src/commands/prefix/antinuke/antinuke.js');

    assert.equal(slashCmd.data?.data?.name, 'antinuke');
    assert.equal(typeof slashCmd.data?.execute, 'function');
    assert.equal(prefixCmd.data?.name, 'antinuke');
    assert.equal(typeof prefixCmd.data?.execute, 'function');
});

// ============================================================================
// 6. PHASE A REVIEW GATE REMEDIATION TESTS (REV-A-01 THROUGH REV-A-07)
// ============================================================================

test('A6.1 [REV-A-01] — quarantineGuildBots never runs before attribution/trust or on voluntary member leave', async () => {
    const { client, guild, antinukeData } = createMockEnvironment();
    const { circuitBreaker } = await import('../src/utils/circuitBreaker.js');
    circuitBreaker.incidentTracker.delete(guild.id);
    circuitBreaker.lockdownState.delete(guild.id);

    const listeners = new Map();
    client.on = (event, fn) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
    };

    let botRoleRemovedCount = 0;
    const helperBotRole = {
        id: '8800001',
        name: 'HelperBotAdmin',
        managed: false,
        editable: true,
        permissions: {
            any: () => true,
            bitfield: PermissionFlagsBits.Administrator
        }
    };
    const helperBotMember = {
        id: '7700001',
        user: { id: '7700001', tag: 'HelperBot#0001', bot: true },
        roles: {
            cache: {
                values: () => [helperBotRole][Symbol.iterator](),
                filter: (fn) => [helperBotRole].filter(fn),
                delete: () => {}
            },
            remove: async () => {
                botRoleRemovedCount += 1;
                return true;
            }
        }
    };
    guild.members.cache.set(helperBotMember.id, helperBotMember);

    const antiChannelCreate = await import('../src/antinuke/antiChannelCreate.js');
    const antiKick = await import('../src/antinuke/antiKick.js');
    const antiBan = await import('../src/antinuke/antiBan.js');
    await antiChannelCreate.data.execute(client);
    await antiKick.data.execute(client);
    await antiBan.data.execute(client);

    // 1. Guild Owner creates a channel -> must NOT quarantine helper bots
    const ownerChan = { id: '992001', name: 'owner-ch', guild, delete: async () => true };
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.ChannelCreate}_${ownerChan.id}`, {
        guildId: guild.id,
        action: AuditLogEvent.ChannelCreate,
        targetId: ownerChan.id,
        auditEntryId: '99001',
        executor: { id: guild.ownerId, tag: 'Owner#0001' },
        createdTimestamp: Date.now()
    });
    for (const fn of listeners.get('channelCreate') || []) {
        await fn(ownerChan);
    }
    assert.equal(botRoleRemovedCount, 0, 'Trusted Guild Owner channel creation must not quarantine guild bots');

    // 2. Voluntary member departure (guildMemberRemove with no MemberKick audit entry) -> must NOT quarantine helper bots
    guild.fetchAuditLogs = async () => ({ entries: new Map() });
    for (const fn of listeners.get('guildMemberRemove') || []) {
        await fn({ id: '5500001', user: { id: '5500001', tag: 'LeavingUser#0001' }, guild });
    }
    assert.equal(botRoleRemovedCount, 0, 'Voluntary member leave (unattributed kick) must not quarantine guild bots');

    // 3. Confirmed untrusted ban -> MUST quarantine untrusted helper bots
    const badActor = { id: '6600001', tag: 'RogueMod#0001' };
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.MemberBanAdd}_5500002`, {
        guildId: guild.id,
        action: AuditLogEvent.MemberBanAdd,
        targetId: '5500002',
        auditEntryId: '99002',
        executor: badActor,
        createdTimestamp: Date.now()
    });
    for (const fn of listeners.get('guildBanAdd') || []) {
        await fn({ guild, user: { id: '5500002', tag: 'Victim#0001' } });
    }
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(botRoleRemovedCount, 1, 'Confirmed untrusted attack must trigger quarantineGuildBots after trust check');
    circuitBreaker.incidentTracker.delete(guild.id);
    circuitBreaker.lockdownState.delete(guild.id);
    void antinukeData;
});

test('A6.2 [REV-A-02] — Unattributed raid-lockdown and protection-role incidents still execute authorized recovery', async () => {
    const { client, guild, antinukeData } = createMockEnvironment({
        protectRole: '777000999'
    });
    const listeners = new Map();
    client.on = (event, fn) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
    };

    const { circuitBreaker } = await import('../src/utils/circuitBreaker.js');
    const { blueprintManager } = await import('../src/utils/blueprintManager.js');
    const antiChannelDelete = await import('../src/antinuke/antiChannelDelete.js');
    const antiRoleDelete = await import('../src/antinuke/antiRoleDelete.js');
    const antiRoleUpdate = await import('../src/antinuke/antiRoleUpdate.js');

    await antiChannelDelete.data.execute(client);
    await antiRoleDelete.data.execute(client);
    await antiRoleUpdate.data.execute(client);

    // No audit logs returned (unattributed / null executor)
    guild.fetchAuditLogs = async () => ({ entries: new Map() });

    // 1. Raid lockdown active + unattributed channelDelete -> must still recover channel
    circuitBreaker.lockdownState.set(guild.id, { active: true, until: Date.now() + 60000 });
    let channelRestored = false;
    const origRestoreChannel = blueprintManager.restoreChannelHierarchical.bind(blueprintManager);
    blueprintManager.restoreChannelHierarchical = async () => {
        channelRestored = true;
        return { id: 'restored_ch_1' };
    };

    try {
        for (const fn of listeners.get('channelDelete') || []) {
            await fn({ id: 'deleted_raid_ch_1', name: 'general', guild });
        }
        assert.equal(channelRestored, true, 'Raid incident channel deletion must recover even when executor is null');
    } finally {
        circuitBreaker.lockdownState.delete(guild.id);
        blueprintManager.restoreChannelHierarchical = origRestoreChannel;
    }

    // 2. Unattributed protection role deletion -> must still recreate protectRole
    let roleRestored = false;
    const origRestoreRole = blueprintManager.restoreRole.bind(blueprintManager);
    blueprintManager.restoreRole = async () => {
        roleRestored = true;
        blueprintManager.recreatedRoles.set('777000999', '777001000');
        return { id: '777001000' };
    };

    try {
        for (const fn of listeners.get('roleDelete') || []) {
            await fn({ id: '777000999', name: 'Roynix Protect', guild });
        }
        assert.equal(roleRestored, true, 'Protection role deletion must recover even when executor is null');
        assert.equal(antinukeData.protectRole, '777001000');
    } finally {
        blueprintManager.restoreRole = origRestoreRole;
    }

    // 3. Unattributed protection role tampering -> must still revert role edit
    antinukeData.protectRole = '777001000';
    guild.members.me.roles = {
        highest: { id: 'bot_high', position: 10 },
        cache: new Map([['777001000', {}]]),
        add: async () => true
    };
    let roleEditedPayload = null;
    const oldProtectRole = {
        id: '777001000',
        name: 'Roynix Protect',
        color: 0,
        hoist: false,
        mentionable: false,
        position: 9,
        permissions: { bitfield: 0n },
        guild
    };
    const tamperedProtectRole = {
        id: '777001000',
        name: 'Tampered Name',
        color: 0,
        hoist: false,
        mentionable: false,
        position: 9,
        editable: true,
        permissions: { bitfield: PermissionFlagsBits.Administrator },
        guild,
        edit: async (payload) => {
            roleEditedPayload = payload;
            return tamperedProtectRole;
        },
        setPosition: async () => tamperedProtectRole
    };

    for (const fn of listeners.get('roleUpdate') || []) {
        await fn(oldProtectRole, tamperedProtectRole);
    }
    assert.ok(roleEditedPayload, 'Protection role tampering must be reverted even when executor is null');
    assert.equal(roleEditedPayload.name, 'Roynix Protect');
    assert.equal(roleEditedPayload.permissions, 0n);
});

test('A6.3 [REV-A-03] — incident.key is defined and rapid distinct audit entries on the same target trip CircuitBreaker', async () => {
    const { client, guild, antinukeData } = createMockEnvironment();
    const { circuitBreaker } = await import('../src/utils/circuitBreaker.js');

    circuitBreaker.incidentTracker.delete(guild.id);
    circuitBreaker.lockdownState.delete(guild.id);

    const coordinator = client.incidentCoordinator;
    const attacker = { id: '444555666777888999', tag: 'RapidAttacker#0001' };

    // Interleaved deliveries of two rapid webhook updates on the same target with distinct auditEntryIds
    const inc1Fast = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.WebhookUpdate,
        moduleKey: 'antiWebhookUpdate',
        targetId: 'webhook_same_1',
        executorId: attacker.id,
        auditEntryId: 'audit_rapid_1'
    });
    assert.ok(inc1Fast.key, 'incident.key must be defined');
    assert.equal(inc1Fast.key, inc1Fast.incidentId);

    const inc2Fast = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.WebhookUpdate,
        moduleKey: 'antiWebhookUpdate',
        targetId: 'webhook_same_1',
        executorId: attacker.id,
        auditEntryId: 'audit_rapid_2'
    });
    assert.notEqual(inc1Fast.incidentId, inc2Fast.incidentId, 'Distinct auditEntryIds on same target must create distinct incidents');

    // Module listener delivery for audit_rapid_1 arriving after audit_rapid_2 was registered
    const inc1Module = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.WebhookUpdate,
        moduleKey: 'antiWebhookUpdate',
        targetId: 'webhook_same_1',
        executorId: attacker.id,
        auditEntryId: 'audit_rapid_1'
    });
    assert.equal(inc1Module.incidentId, inc1Fast.incidentId, 'Secondary auditEntryId index must match inc1 even after inc2 overwrote baseKey');

    // Claim and record both distinct incidents in circuitBreaker
    assert.equal(coordinator.claimCircuitBreaker(inc1Fast), true);
    assert.equal(coordinator.claimCircuitBreaker(inc1Module), false, 'Duplicate delivery of inc1 must not claim circuitBreaker twice');
    assert.equal(coordinator.claimCircuitBreaker(inc2Fast), true);

    await circuitBreaker.recordIncident(guild, client, 'antiWebhookUpdate', attacker, {
        incidentKey: inc1Fast.key,
        auditEntryId: 'audit_rapid_1',
        targetId: 'webhook_same_1',
        moduleKey: 'antiWebhookUpdate'
    });
    await circuitBreaker.recordIncident(guild, client, 'antiWebhookUpdate', attacker, {
        incidentKey: inc2Fast.key,
        auditEntryId: 'audit_rapid_2',
        targetId: 'webhook_same_1',
        moduleKey: 'antiWebhookUpdate'
    });

    assert.equal(circuitBreaker.isLockedDown(guild.id), true, 'Two distinct rapid incidents must trip CircuitBreaker threshold (2)');
    circuitBreaker.lockdownState.delete(guild.id);
    circuitBreaker.incidentTracker.delete(guild.id);
});

test('A6.4 [REV-A-04] — All 9 secondary modules coordinate through IncidentCoordinator, honor global whitelist, and respect autoRecovery', async () => {
    const globalWhitelistedId = '333444555666777888';
    const { client, guild, banCalls } = createMockEnvironment({
        whitelisted: {
            [globalWhitelistedId]: {
                whitelisted: true,
                events: []
            }
        },
        disabledEvents: ['autoRecovery']
    });

    const listeners = new Map();
    client.on = (event, fn) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
    };

    const secondaryModules = [
        'antiEmojiCreate.js',
        'antiEmojiDelete.js',
        'antiEmojiUpdate.js',
        'antiStickerCreate.js',
        'antiStickerDelete.js',
        'antiStickerUpdate.js',
        'antiGuildUpdate.js',
        'antiMemberUpdate.js',
        'antiUnban.js'
    ];
    for (const file of secondaryModules) {
        const mod = await import(`../src/antinuke/${file}`);
        await mod.data.execute(client);
    }

    // 1. Global whitelisted actor updates an emoji and a sticker -> must NOT be punished or reverted
    let emojiEdited = false;
    let stickerEdited = false;
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.EmojiUpdate}_em_1`, {
        guildId: guild.id,
        action: AuditLogEvent.EmojiUpdate,
        targetId: 'em_1',
        auditEntryId: 'sec_audit_1',
        executor: { id: globalWhitelistedId, tag: 'GlobalWL#0001' },
        createdTimestamp: Date.now()
    });
    for (const fn of listeners.get('emojiUpdate') || []) {
        await fn(
            { id: 'em_1', name: 'old_em', guild },
            { id: 'em_1', name: 'new_em', guild, edit: async () => { emojiEdited = true; } }
        );
    }
    assert.equal(banCalls.length, 0, 'Globally whitelisted user must be exempted in antiEmojiUpdate');
    assert.equal(emojiEdited, false, 'Globally whitelisted emoji update must not be reverted');

    // 2. Untrusted actor updates emoji & sticker while autoRecovery is disabled -> punished once, NOT reverted
    const untrustedActor = { id: '999888777666555444', tag: 'Rogue#0001' };
    client.auditLogCache.set(`${guild.id}_${AuditLogEvent.StickerUpdate}_st_1`, {
        guildId: guild.id,
        action: AuditLogEvent.StickerUpdate,
        targetId: 'st_1',
        auditEntryId: 'sec_audit_2',
        executor: untrustedActor,
        createdTimestamp: Date.now()
    });
    for (const fn of listeners.get('stickerUpdate') || []) {
        await fn(
            { id: 'st_1', name: 'old_st', description: 'a', guild },
            { id: 'st_1', name: 'new_st', description: 'b', guild, edit: async () => { stickerEdited = true; } }
        );
    }
    assert.equal(banCalls.length, 1, 'Untrusted actor must be banned in antiStickerUpdate');
    assert.equal(stickerEdited, false, 'Disabled autoRecovery must prevent revert in antiStickerUpdate');
});

test('A6.5 [REV-A-05] — Self-preservation routes through IncidentCoordinator and punishExecutor without raw roles.set([]) on managed roles', async () => {
    const { File } = await import('node:buffer');
    void File;
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { Roynix } = await import('../src/base/Roynix.js');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roynix-rev-a-05-'));
    const bot = new Roynix({ databasePath: tempDir });
    bot.user = { id: '100000000000000001', tag: 'RoynixShield#0001' };

    try {
        const guildId = '500000000000000005';
        await bot.setAntinukeData(guildId, {
            enabled: true,
            punishment: 'kick',
            disabledEvents: ['antiKick'], // Even with antiKick disabled, self-target kick must enforce ban
            extraOwners: [],
            whitelisted: {}
        });

        let rawRolesSetCalled = false;
        let managedPermZeroed = false;
        let banCount = 0;

        const managedRole = {
            id: 'role_managed_1',
            managed: true,
            editable: true,
            permissions: { bitfield: PermissionFlagsBits.Administrator, any: () => true },
            setPermissions: async (perms) => {
                if (perms === 0n) managedPermZeroed = true;
                return true;
            }
        };

        const rogueMember = {
            id: '666777888999000111',
            bannable: true,
            manageable: true,
            roles: {
                cache: new Map([[managedRole.id, managedRole]]),
                set: async () => {
                    rawRolesSetCalled = true;
                    throw new Error('50028 Invalid Role');
                },
                remove: async () => true
            }
        };

        const mockGuild = {
            id: guildId,
            ownerId: '111111111111111111',
            client: bot,
            members: {
                cache: new Map([[rogueMember.id, rogueMember]]),
                fetch: async (id) => mockGuild.members.cache.get(id) || null
            },
            bans: {
                create: async () => {
                    banCount += 1;
                    return true;
                }
            }
        };
        bot.guilds.cache.set(guildId, mockGuild);

        const auditId = '1357924680135792468';
        // Emit both raw and guildAuditLogEntryCreate for kicking the bot itself
        bot.emit('raw', {
            t: 'GUILD_AUDIT_LOG_ENTRY_CREATE',
            d: {
                id: auditId,
                guild_id: guildId,
                user_id: rogueMember.id,
                target_id: bot.user.id,
                action_type: AuditLogEvent.MemberKick
            }
        });
        bot.emit('guildAuditLogEntryCreate', {
            id: auditId,
            action: AuditLogEvent.MemberKick,
            targetId: bot.user.id,
            target: { id: bot.user.id },
            executorId: rogueMember.id,
            executor: { id: rogueMember.id, tag: 'RogueBot#0001' },
            createdTimestamp: Date.now()
        }, mockGuild);

        await new Promise((r) => setTimeout(r, 30));

        assert.equal(rawRolesSetCalled, false, 'Must not call raw roles.set([]) when member has a managed role');
        assert.equal(managedPermZeroed, true, 'Managed role permissions must be zeroed via stripMemberRolesAndManagedPerms');
        assert.equal(banCount, 1, 'Coordinated self-preservation must ban exactly once across raw and audit-log listeners');
    } finally {
        await bot.shutdown().catch(() => null);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('A6.6 [REV-A-06 & REV-A-07] — Global whitelist works with null/invalid moduleKey and strip punishment re-executes when new roles are granted', async () => {
    const globalWlId = '121212121212121212';
    const { client, guild, antinukeData } = createMockEnvironment({
        punishment: 'strip',
        whitelisted: {
            [globalWlId]: {
                whitelisted: true,
                events: []
            }
        }
    });

    // 1. REV-A-06: Global whitelist with moduleKey: null and non-standard trackingKey
    const trustNullModule = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: null,
        executorId: globalWlId
    });
    assert.equal(trustNullModule.trustState, 'trusted');
    assert.equal(trustNullModule.isExempt, true);

    const wlOutcome = await punishExecutor(
        guild,
        { id: globalWlId },
        'ban',
        'Test Global WL',
        client,
        `${guild.id}_customArbitrarySegment_${globalWlId}`,
        { antinukeData, moduleKey: null }
    );
    assert.equal(wlOutcome, 'No Action', 'Global whitelist must be honored even when moduleKey is null or trackingKey has arbitrary segment');

    // 2. REV-A-07: Re-strip when new roles are granted to a previously stripped attacker on a new incident
    const attackerId = '343434343434343434';
    let stripCallCount = 0;
    const role1 = { id: 'role_strip_1', managed: false, editable: true };
    const role2 = { id: 'role_strip_2', managed: false, editable: true };
    const roleCache = new Map([[role1.id, role1]]);

    guild.members.cache.set(attackerId, {
        id: attackerId,
        user: { id: attackerId, bot: false },
        manageable: true,
        moderatable: false,
        roles: {
            cache: roleCache,
            set: async () => {
                stripCallCount += 1;
                return true;
            },
            remove: async () => {
                stripCallCount += 1;
                return true;
            }
        }
    });

    const inc1 = client.incidentCoordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: 'antiChannelDelete',
        targetId: 'ch_strip_1',
        executorId: attackerId,
        auditEntryId: 'audit_strip_1'
    });

    const res1 = await punishExecutor(
        guild,
        { id: attackerId },
        'strip',
        'Incident 1 Strip',
        client,
        `${guild.id}_antiChannelDelete_ch_strip_1_${attackerId}`,
        { incident: inc1, antinukeData, moduleKey: 'antiChannelDelete', targetId: 'ch_strip_1' }
    );
    assert.equal(res1, 'Roles Stripped');
    assert.equal(stripCallCount, 1);
    assert.equal(roleCache.size, 0, 'Stripped role must be removed from in-memory role cache');

    // Duplicate delivery of Incident 1 must still deduplicate without re-calling Discord API
    const res1Dup = await punishExecutor(
        guild,
        { id: attackerId },
        'strip',
        'Incident 1 Duplicate',
        client,
        `${guild.id}_antiChannelDelete_ch_strip_1_${attackerId}`,
        { incident: inc1, antinukeData, moduleKey: 'antiChannelDelete', targetId: 'ch_strip_1' }
    );
    assert.equal(res1Dup, 'Roles Stripped');
    assert.equal(stripCallCount, 1);

    // Now an accomplice grants role2 to the attacker within the 12s window, and attacker triggers Incident 2
    roleCache.set(role2.id, role2);
    const inc2 = client.incidentCoordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType: AuditLogEvent.ChannelDelete,
        moduleKey: 'antiChannelDelete',
        targetId: 'ch_strip_2',
        executorId: attackerId,
        auditEntryId: 'audit_strip_2'
    });

    const res2 = await punishExecutor(
        guild,
        { id: attackerId },
        'strip',
        'Incident 2 Strip After Re-Role',
        client,
        `${guild.id}_antiChannelDelete_ch_strip_2_${attackerId}`,
        { incident: inc2, antinukeData, moduleKey: 'antiChannelDelete', targetId: 'ch_strip_2' }
    );
    assert.equal(res2, 'Roles Stripped');
    assert.equal(stripCallCount, 2, 'Must re-execute role strip on new incident when attacker holds newly granted removable roles');
    assert.equal(roleCache.size, 0);
});
