import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuditLogEvent } from 'discord.js';

import { FastDB } from '../src/utils/fastDb.js';
import { Roynix } from '../src/base/Roynix.js';
import { IncidentCoordinator } from '../src/utils/incidentCoordinator.js';
import { circuitBreaker } from '../src/utils/circuitBreaker.js';
import { blueprintManager } from '../src/utils/blueprintManager.js';
import { sweepTracker } from '../src/antinuke/antiPing.js';
import { redactSecrets } from '../src/utils/logger.js';
import { buildErrorEmbed, logError, formatAndRedactError } from '../src/handlers/anticrash.js';
import { data as antiRoleCreateModule } from '../src/antinuke/antiRoleCreate.js';

function createTempDir(prefix = 'roynix-phase-e-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dirPath) {
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {}
}

// ============================================================================
// E1.1 — FastDB Persistence, Dot-Path Consistency, Restart & Clean WAL Close
// ============================================================================
test('Phase E [DB-01]: FastDB dot-path mutations, restart persistence, and idempotent WAL close', async () => {
    const tempDir = createTempDir('roynix-fastdb-');
    const dbPath = path.join(tempDir, 'antinuke-test.db');

    try {
        const db1 = new FastDB({ filePath: dbPath, cacheTtlMs: 50 });
        assert.equal(FastDB.instances.has(db1), true);

        await db1.set('antinukeData_1001', {
            enabled: true,
            punishment: 'ban',
            extraOwners: ['2001'],
            whitelisted: {},
            disabledEvents: []
        });

        // Dot-path set, push, pull, delete
        await db1.set('antinukeData_1001.whitelisted.3001', { events: ['antiBan', 'antiKick'] });
        await db1.push('antinukeData_1001.extraOwners', '2002');
        await db1.push('antinukeData_1001.disabledEvents', 'antiPing');
        await db1.set('antinukeData_1001.protectRole', '9001');

        const inMemory = await db1.get('antinukeData_1001');
        assert.equal(inMemory.enabled, true);
        assert.equal(inMemory.protectRole, '9001');
        assert.deepEqual(inMemory.extraOwners, ['2001', '2002']);
        assert.deepEqual(inMemory.whitelisted['3001'], { events: ['antiBan', 'antiKick'] });
        assert.deepEqual(inMemory.disabledEvents, ['antiPing']);

        // Synchronous setSync + close() must flush uncommitted dirty entries before closing
        db1.setSync('antinukeData_1001.logsChannel', '8001');
        assert.equal(db1.close(), true);
        // Second close() is idempotent
        assert.equal(db1.close(), false);
        assert.equal(FastDB.instances.has(db1), false);

        // Reopen a fresh FastDB instance on the same SQLite file to verify restart persistence
        const db2 = new FastDB({ filePath: dbPath, cacheTtlMs: 50 });
        const persisted = await db2.get('antinukeData_1001');
        assert.equal(persisted.enabled, true);
        assert.equal(persisted.protectRole, '9001');
        assert.equal(persisted.logsChannel, '8001');
        assert.deepEqual(persisted.extraOwners, ['2001', '2002']);
        assert.deepEqual(persisted.whitelisted['3001'], { events: ['antiBan', 'antiKick'] });

        // Test dot-path delete and numeric add/sub
        await db2.delete('antinukeData_1001.whitelisted.3001');
        await db2.pull('antinukeData_1001.extraOwners', '2001');
        await db2.add('counter_test', 5);
        await db2.sub('counter_test', 2);

        assert.equal(await db2.get('antinukeData_1001.whitelisted.3001'), undefined);
        assert.deepEqual(await db2.get('antinukeData_1001.extraOwners'), ['2002']);
        assert.equal(await db2.get('counter_test'), 3);

        db2.close();
    } finally {
        cleanupTempDir(tempDir);
    }
});

// ============================================================================
// E1.2 — Cross-Shard SQLite Consistency & Roynix antinukeCache Coherence
// ============================================================================
test('Phase E [DB-02]: Roynix antinukeCache coherence across local dot-path mutations and cross-shard updates', async () => {
    const tempDir = createTempDir('roynix-shards-');
    let shard0 = null;
    let shard1 = null;

    try {
        shard0 = new Roynix({
            databasePath: tempDir,
            antinukeCacheTtlMs: 25,
            dbCacheTtlMs: 15,
            maxCacheEntries: 50
        });
        shard1 = new Roynix({
            databasePath: tempDir,
            antinukeCacheTtlMs: 25,
            dbCacheTtlMs: 15,
            maxCacheEntries: 50
        });

        const guildId = '555000111';

        // 1. Shard 0 enables AntiNuke via setAntinukeData
        await shard0.setAntinukeData(guildId, {
            enabled: true,
            punishment: 'ban',
            extraOwners: ['111'],
            whitelisted: {},
            disabledEvents: [],
            protectRole: '700'
        });

        // Shard 0 immediately sees the cached config
        const s0Initial = await shard0.getAntinukeData(guildId);
        assert.equal(s0Initial.enabled, true);
        assert.equal(s0Initial.protectRole, '700');

        // 2. Shard 0 performs dot-path mutations directly via antinukeDB.set and antinukeDB.push
        await shard0.antinukeDB.set(`antinukeData_${guildId}.whitelisted.222`, { events: ['antiChannelDelete'] });
        await shard0.antinukeDB.push(`antinukeData_${guildId}.extraOwners`, '333');
        await shard0.antinukeDB.set(`antinukeData_${guildId}.protectRole`, '701');

        // Shard 0 cache must be immediately coherent without waiting for TTL
        const s0Updated = await shard0.getAntinukeData(guildId);
        assert.equal(s0Updated.protectRole, '701');
        assert.deepEqual(s0Updated.extraOwners, ['111', '333']);
        assert.deepEqual(s0Updated.whitelisted['222'], { events: ['antiChannelDelete'] });

        // 3. Shard 1 reads after cross-shard TTL window (35ms) and sees Shard 0's committed SQLite updates
        await new Promise((r) => setTimeout(r, 35));
        const s1Read = await shard1.getAntinukeData(guildId);
        assert.equal(s1Read.enabled, true);
        assert.equal(s1Read.protectRole, '701');
        assert.deepEqual(s1Read.extraOwners, ['111', '333']);
        assert.deepEqual(s1Read.whitelisted['222'], { events: ['antiChannelDelete'] });

        // 4. Shard 1 updates punishment to 'kick'
        await shard1.antinukeDB.set(`antinukeData_${guildId}.punishment`, 'kick');
        await new Promise((r) => setTimeout(r, 35));
        const s0AfterS1Write = await shard0.getAntinukeData(guildId);
        assert.equal(s0AfterS1Write.punishment, 'kick');

        // 5. Graceful idempotent shutdown on both shards
        assert.equal(await shard0.shutdown('SIGTERM'), true);
        assert.equal(await shard0.shutdown('SIGTERM'), false);
        assert.equal(await shard1.shutdown('SIGINT'), true);
        assert.equal(shard0.antinukeDB.closed, true);
        assert.equal(shard1.antinukeDB.closed, true);
    } finally {
        if (shard0) await shard0.shutdown().catch(() => null);
        if (shard1) await shard1.shutdown().catch(() => null);
        cleanupTempDir(tempDir);
    }
});

// ============================================================================
// E2.1 — Bounded Tracker State Across All Security Components
// ============================================================================
test('Phase E [DET-03 & STATE-01]: All in-memory trackers enforce TTL eviction and hard upper bounds', async () => {
    const tempDir = createTempDir('roynix-bounds-');
    let client = null;

    try {
        // 1. IncidentCoordinator bounds (maxIncidents, maxExecutorStates, maxHistory)
        const coordinator = new IncidentCoordinator({
            dedupeWindowMs: 50,
            executorWindowMs: 50,
            maxIncidents: 10,
            maxExecutorStates: 10,
            maxHistory: 15
        });

        const mockGuild = { id: '999', ownerId: '1' };
        const antinukeData = { enabled: true, extraOwners: [], whitelisted: {}, disabledEvents: [] };
        const baseNow = Date.now();

        for (let i = 0; i < 30; i++) {
            const inc = coordinator.coordinateIncident({
                guild: mockGuild,
                client: { user: { id: '2' }, isBotOwner: () => false },
                antinukeData,
                actionType: AuditLogEvent.ChannelDelete,
                moduleKey: 'antiChannelDelete',
                targetId: `ch_${i}`,
                executorId: `attacker_${i}`,
                auditEntryId: `audit_${i}`,
                timestamp: baseNow + i
            });
            await coordinator.executePunishment({
                guildId: '999',
                executorId: `attacker_${i}`,
                incident: inc,
                executeFn: async () => 'Banned'
            });
        }

        const statsAfterBurst = coordinator.getStats();
        assert.ok(statsAfterBurst.activeIncidents <= 10, `Expected activeIncidents <= 10, got ${statsAfterBurst.activeIncidents}`);
        assert.ok(statsAfterBurst.activeExecutorStates <= 10, `Expected activeExecutorStates <= 10, got ${statsAfterBurst.activeExecutorStates}`);
        assert.equal(statsAfterBurst.historyRecords, 15);

        // After TTL expiry, sweep evicts all settled incidents and executor states
        coordinator.sweep(baseNow + 500);
        assert.equal(coordinator.incidents.size, 0);
        assert.equal(coordinator.executorStates.size, 0);

        // 2. AntiPing sweepTracker bounds (TTL eviction + FIFO cap)
        const spamTracker = new Map();
        for (let i = 0; i < 25; i++) {
            spamTracker.set(`g_${i}`, [baseNow - (i < 10 ? 5000 : 100)]);
        }
        sweepTracker(spamTracker, baseNow, 1000, 8);
        assert.equal(spamTracker.size, 8);
        // Remaining keys must only be from the fresh set (g_17..g_24)
        assert.equal(spamTracker.has('g_0'), false);
        assert.equal(spamTracker.has('g_24'), true);

        // 3. CircuitBreaker sweep bounds
        for (let i = 0; i < 20; i++) {
            circuitBreaker.seenIncidents.set(`test_seen_${i}`, baseNow - 20000);
            circuitBreaker.incidentTracker.set(`test_guild_${i}`, [baseNow - 5000]);
        }
        circuitBreaker.sweep(baseNow);
        assert.equal(circuitBreaker.seenIncidents.has('test_seen_0'), false);
        assert.equal(circuitBreaker.incidentTracker.has('test_guild_0'), false);

        // 4. BlueprintManager sweep and removeGuildBlueprint
        for (let i = 0; i < 25; i++) {
            blueprintManager.recreatedChannels.set(`old_ch_${i}`, `new_ch_${i}`);
            blueprintManager.channelParentOrigin.set(`child_${i}`, `cat_${i}`);
        }
        blueprintManager.sweep(10);
        assert.equal(blueprintManager.recreatedChannels.size, 10);
        assert.equal(blueprintManager.channelParentOrigin.size, 10);

        // 5. Roynix.sweepTrackers() and guildDelete cleanup
        client = new Roynix({
            databasePath: tempDir,
            maxCacheEntries: 10
        });
        for (let i = 0; i < 25; i++) {
            client.auditLogCache.set(`audit_key_${i}`, { createdTimestamp: baseNow - (i < 10 ? 20000 : 100) });
            client.antinukeActionTracker.set(`act_key_${i}`, { timestamp: baseNow - (i < 10 ? 20000 : 100), actionTaken: 'Banned' });
            client.antinukeCache.set(`guild_${i}`, { enabled: true });
            client.antinukeCacheTimestamps.set(`guild_${i}`, baseNow);
        }

        client.sweepTrackers(baseNow);
        assert.ok(client.auditLogCache.size <= 10);
        assert.ok(client.antinukeActionTracker.size <= 10);
        assert.ok(client.antinukeCache.size <= 10);

        // Verify guildDelete listener removes blueprint and antinukeCache entry
        const testGuildId = 'guild_24';
        blueprintManager._getGuildBlueprint(testGuildId).channels.set('ch_1', { id: 'ch_1', name: 'general' });
        client.emit('guildDelete', { id: testGuildId });
        assert.equal(blueprintManager.guildBlueprints.has(testGuildId), false);
        assert.equal(client.antinukeCache.has(testGuildId), false);
    } finally {
        if (client) await client.shutdown().catch(() => null);
        cleanupTempDir(tempDir);
    }
});

// ============================================================================
// E3.1 — Incident Observability & AntiCrash Hardening (OBS-01)
// ============================================================================
test('Phase E [OBS-01]: anticrash handles >4000 char stack traces & null errors without CombinedPropertyError and redacts secrets', async () => {
    const tempDir = createTempDir('roynix-anticrash-');
    const tempLogFile = path.join(tempDir, 'errors.log');

    try {
        const fakeBotToken = ['MTIzNDU2Nzg5MDEyMzQ1Njc4OQ', 'GhIjkL', 'abcdefghijklmnopqrstuvwxyz0123456789AB'].join('.');
        const fakeWebhookUrl = ['https://discord.com/api/webhooks', '123456789012345678', 'secretWebhookToken_abc123XYZ'].join('/');
        const longFrame = '    at Object.execute (/app/src/antinuke/someDeepModuleHandlerFile.js:123:45)\n';
        const hugeStackError = new Error(
            `Failed request with token ${fakeBotToken} and webhook ${fakeWebhookUrl} Authorization: Bot ${fakeBotToken}`
        );
        hugeStackError.stack = `${hugeStackError.message}\n${longFrame.repeat(80)}`;
        assert.ok(hugeStackError.stack.length > 4500, 'Precondition: stack trace must exceed 4500 chars');

        // 1. buildErrorEmbed must NOT throw CombinedPropertyError and all fields must be <= 1024 chars
        const embed = buildErrorEmbed('Unhandled Rejection', hugeStackError);
        const embedJson = embed.toJSON();
        assert.equal(embedJson.title, 'Anti-Crash Error Detected');
        for (const field of embedJson.fields) {
            assert.ok(
                field.value.length <= 1024,
                `Field "${field.name}" value length (${field.value.length}) exceeded Discord's 1024-char limit`
            );
            assert.equal(field.value.includes(fakeBotToken), false, 'Bot token must be redacted from embed');
            assert.equal(field.value.includes('secretWebhookToken_abc123XYZ'), false, 'Webhook token must be redacted from embed');
        }

        // 2. logError writes redacted output to isolated log file and handles null/undefined errors safely
        const loggedEmbed = logError('Unhandled Rejection', hugeStackError, {
            logFilePath: tempLogFile,
            disableWebhook: true,
            silentConsole: true
        });
        assert.ok(loggedEmbed);

        const nullEmbed = logError('Unhandled Rejection', null, {
            logFilePath: tempLogFile,
            disableWebhook: true,
            silentConsole: true
        });
        assert.ok(nullEmbed);

        const fileContents = fs.readFileSync(tempLogFile, 'utf8');
        assert.equal(fileContents.includes(fakeBotToken), false, 'Bot token must not appear in errors.log');
        assert.equal(fileContents.includes('secretWebhookToken_abc123XYZ'), false, 'Webhook secret must not appear in errors.log');
        assert.equal(fileContents.includes('[REDACTED_TOKEN]'), true);
        assert.equal(fileContents.includes('[REDACTED_WEBHOOK]'), true);

        // 3. Structured incident observability in IncidentCoordinator
        const coordinator = new IncidentCoordinator();
        const guild = { id: '12345', ownerId: '99999' };
        const antinukeData = { enabled: true, extraOwners: [], whitelisted: {}, disabledEvents: [] };
        const incident = coordinator.coordinateIncident({
            guild,
            client: { user: { id: '11111' }, isBotOwner: () => false },
            antinukeData,
            actionType: AuditLogEvent.ChannelDelete,
            moduleKey: 'antiChannelDelete',
            targetId: '54321',
            executorId: '66666',
            auditEntryId: '77777'
        });

        await coordinator.executePunishment({
            guildId: guild.id,
            executorId: '66666',
            incident,
            executeFn: async () => 'Banned'
        });
        await coordinator.executeRecovery(incident, async () => true);
        coordinator.claimCircuitBreaker(incident);

        const recent = coordinator.getRecentIncidents(5);
        assert.equal(recent.length, 1);
        assert.equal(recent[0].guildId, '12345');
        assert.equal(recent[0].moduleKey, 'antiChannelDelete');
        assert.equal(recent[0].decision, 'enforce');
        assert.equal(recent[0].enforcement.status, 'succeeded');
        assert.equal(recent[0].enforcement.actionTaken, 'Banned');
        assert.equal(recent[0].recovery.status, 'succeeded');
        assert.equal(recent[0].circuitBreakerRecorded, true);
    } finally {
        cleanupTempDir(tempDir);
    }
});

// ============================================================================
// E4.1 — Release-Readiness: Managed Role Guard in antiRoleCreate & 24 Protections
// ============================================================================
test('Phase E [Release Readiness]: antiRoleCreate ignores managed integration roles and enforces on untrusted non-managed roles', async () => {
    const listeners = new Map();
    let deleteCalls = 0;
    let banCalls = 0;

    const guild = {
        id: '100',
        ownerId: '1',
        channels: { cache: new Map(), fetch: async () => null },
        members: {
            me: { permissions: { has: () => true } },
            cache: new Map([['666', { id: '666', bannable: true, roles: { cache: new Map(), set: async () => true } }]])
        },
        bans: {
            create: async () => {
                banCalls += 1;
                return true;
            }
        }
    };

    const client = {
        user: { id: '2' },
        color: 0xff0000,
        isBotOwner: () => false,
        auditLogCache: new Map([
            [
                `100_${AuditLogEvent.RoleCreate}_role_unmanaged`,
                {
                    guildId: '100',
                    action: AuditLogEvent.RoleCreate,
                    targetId: 'role_unmanaged',
                    auditEntryId: 'aud_1',
                    executor: { id: '666', tag: 'Attacker#0001' },
                    createdTimestamp: Date.now()
                }
            ]
        ]),
        incidentCoordinator: new IncidentCoordinator(),
        antinukeActionTracker: new Map(),
        getAntinukeData: async () => ({
            enabled: true,
            punishment: 'ban',
            extraOwners: [],
            whitelisted: {},
            disabledEvents: []
        }),
        on(event, fn) {
            listeners.set(event, fn);
        }
    };

    await antiRoleCreateModule.execute(client);
    const handler = listeners.get('roleCreate');
    assert.equal(typeof handler, 'function');

    // 1. Managed integration role (e.g. OAuth2 bot role) must be ignored without calling role.delete()
    await handler({
        id: 'role_managed',
        name: 'BotManagedRole',
        managed: true,
        guild,
        delete: async () => {
            deleteCalls += 1;
            return true;
        }
    });
    assert.equal(deleteCalls, 0);
    assert.equal(banCalls, 0);

    // 2. Unauthorized non-managed role creation is deleted and attacker is banned
    await handler({
        id: 'role_unmanaged',
        name: 'RaidRole',
        managed: false,
        guild,
        delete: async () => {
            deleteCalls += 1;
            return true;
        }
    });
    assert.equal(deleteCalls, 1);
    assert.equal(banCalls, 1);
});
