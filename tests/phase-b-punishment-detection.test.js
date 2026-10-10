import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AuditLogEvent, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { IncidentCoordinator } from '../src/utils/incidentCoordinator.js';
import { punishExecutor } from '../src/utils/punishExecutor.js';
import { quarantineGuildBots, data as zeroTrustModule } from '../src/antinuke/zeroTrustQuarantine.js';
import { data as antiPingModule } from '../src/antinuke/antiPing.js';
import { data as antiWebhookUpdateModule, deleteUnauthorizedWebhook } from '../src/antinuke/antiWebhookUpdate.js';

function createRoleCollection(rolesArray) {
    const map = new Map(rolesArray.map((r) => [r.id, r]));
    return {
        cache: {
            get: (id) => map.get(id),
            has: (id) => map.has(id),
            values: () => map.values(),
            filter: (fn) => {
                const filtered = rolesArray.filter(fn);
                const subMap = new Map(filtered.map((r) => [r.id, r]));
                subMap.size = filtered.length;
                return subMap;
            },
            some: (fn) => rolesArray.some(fn),
            size: rolesArray.length
        }
    };
}

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
                events: ['antiPing', 'antiWebhookUpdate']
            }
        },
        punishment: 'ban',
        disabledEvents: [],
        logsChannel: '666666666666666666',
        ...antinukeOverrides
    };

    const guildId = '500000000000000005';
    client.antinukeCache.set(guildId, antinukeData);
    client.getAntinukeData = async (id) => client.antinukeCache.get(id);

    const banCalls = [];
    const kickCalls = [];
    const roleRemoveCalls = [];
    const roleSetCalls = [];
    const rolePermZeroCalls = [];
    const timeoutCalls = [];
    const logMessages = [];
    const restDeleteCalls = [];

    const logChannel = {
        id: '666666666666666666',
        send: async (payload) => {
            logMessages.push(payload);
            return payload;
        }
    };

    client.rest = {
        delete: async (route, opts) => {
            restDeleteCalls.push({ route, opts });
            return {};
        }
    };

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
            cache: new Map([['666666666666666666', logChannel]]),
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
        roleRemoveCalls,
        roleSetCalls,
        rolePermZeroCalls,
        timeoutCalls,
        logMessages,
        restDeleteCalls
    };
}

// ============================================================================
// 1. TRUTHFUL PUNISHMENT RESULTS & FALLBACK CONTAINMENT (CONT-01 & CONT-03)
// ============================================================================

test('Phase B [CONT-01]: punishExecutor returns No Action when ban, role strip, and timeout all fail', async () => {
    const { client, guild } = createMockEnvironment();
    const attacker = { id: '777777777777777771', tag: 'HigherRoleAdmin#0001', bot: false };

    // Attacker is above bot in role hierarchy: not bannable, not manageable, not moderatable
    guild.members.cache.set(attacker.id, {
        id: attacker.id,
        user: attacker,
        bannable: false,
        kickable: false,
        manageable: false,
        moderatable: false,
        roles: {
            ...createRoleCollection([{ id: guild.id, managed: false, editable: false }]),
            remove: async () => {
                throw new Error('50013 Missing Permissions');
            },
            set: async () => {
                throw new Error('50013 Missing Permissions');
            }
        },
        timeout: async () => {
            throw new Error('50013 Missing Permissions');
        }
    });

    guild.bans.create = async () => {
        throw new Error('DiscordAPIError[50013]: Missing Permissions');
    };

    const outcome = await punishExecutor(
        guild,
        attacker,
        'ban',
        'Test Hierarchy Failure',
        client,
        null,
        { antinukeData: client.antinukeCache.get(guild.id), moduleKey: 'antiChannelDelete', targetId: '9001' }
    );

    assert.equal(outcome, 'No Action', 'Must truthfully report No Action when all containment paths fail');
});

test('Phase B [CONT-03]: punishExecutor falls back to stripping removable roles and 28-day timeout when ban is blocked by hierarchy', async () => {
    const { client, guild, roleRemoveCalls, timeoutCalls } = createMockEnvironment();
    const attacker = { id: '777777777777777772', tag: 'PartialHierarchyAttacker#0002', bot: false };

    const removableRole = {
        id: '800000000000000001',
        managed: false,
        editable: true,
        permissions: new PermissionsBitField([PermissionFlagsBits.ManageChannels])
    };

    guild.members.cache.set(attacker.id, {
        id: attacker.id,
        user: attacker,
        bannable: false,
        kickable: false,
        manageable: false,
        moderatable: true,
        roles: {
            ...createRoleCollection([{ id: guild.id, managed: false, editable: false }, removableRole]),
            remove: async (rolesToRemove, reason) => {
                roleRemoveCalls.push({ rolesToRemove, reason });
            },
            set: async () => {}
        },
        timeout: async (durationMs, reason) => {
            timeoutCalls.push({ durationMs, reason });
        }
    });

    guild.bans.create = async () => {
        throw new Error('DiscordAPIError[50013]: Missing Permissions');
    };

    const outcome = await punishExecutor(
        guild,
        attacker,
        'ban',
        'Test Fallback Containment',
        client,
        null,
        { antinukeData: client.antinukeCache.get(guild.id), moduleKey: 'antiChannelDelete', targetId: '9002' }
    );

    assert.equal(outcome, 'Roles Stripped & Timed Out (Fallback)');
    assert.equal(roleRemoveCalls.length, 1, 'Removable roles must be stripped on fallback');
    assert.equal(timeoutCalls.length, 1, '28-day timeout must be applied on fallback');
    assert.equal(timeoutCalls[0].durationMs, 28 * 24 * 60 * 60 * 1000);
});

test('Phase B [CONT-03]: punishExecutor supports strip mode and falls back to timeout if role removal is unavailable', async () => {
    const { client, guild, timeoutCalls } = createMockEnvironment({ punishment: 'strip' });
    const attacker = { id: '777777777777777773', tag: 'UnstripableMember#0003', bot: false };

    // Member has only @everyone role (nothing removable), but is moderatable
    guild.members.cache.set(attacker.id, {
        id: attacker.id,
        user: attacker,
        bannable: false,
        kickable: false,
        manageable: false,
        moderatable: true,
        roles: {
            ...createRoleCollection([{ id: guild.id, managed: false, editable: false }]),
            remove: async () => {
                throw new Error('50013 Missing Permissions');
            },
            set: async () => {
                throw new Error('50013 Missing Permissions');
            }
        },
        timeout: async (durationMs, reason) => {
            timeoutCalls.push({ durationMs, reason });
        }
    });

    const outcome = await punishExecutor(
        guild,
        attacker,
        'strip',
        'Test Strip Fallback to Timeout',
        client,
        null,
        { antinukeData: client.antinukeCache.get(guild.id), moduleKey: 'antiRoleDelete', targetId: '9003' }
    );

    assert.equal(outcome, 'Timed Out (Fallback)');
    assert.equal(timeoutCalls.length, 1);
});

// ============================================================================
// 2. MANAGED ROLE RESTRICTIONS (CONT-02)
// ============================================================================

test('Phase B [CONT-02]: punishExecutor zeroes permissions on editable managed roles instead of calling roles.remove on them', async () => {
    const { client, guild, roleRemoveCalls, rolePermZeroCalls } = createMockEnvironment({ punishment: 'strip' });
    const botAttacker = { id: '777777777777777774', tag: 'RogueBot#0004', bot: true };

    const managedBotRole = {
        id: '800000000000000010',
        name: 'RogueBot Integration Role',
        managed: true,
        editable: true,
        permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
        setPermissions: async (perms, reason) => {
            rolePermZeroCalls.push({ roleId: '800000000000000010', perms, reason });
        }
    };

    const normalRole = {
        id: '800000000000000011',
        name: 'Normal Staff Role',
        managed: false,
        editable: true,
        permissions: new PermissionsBitField([PermissionFlagsBits.ManageRoles])
    };

    guild.members.cache.set(botAttacker.id, {
        id: botAttacker.id,
        user: botAttacker,
        bannable: false,
        kickable: false,
        manageable: true,
        moderatable: false,
        roles: {
            ...createRoleCollection([
                { id: guild.id, managed: false, editable: false, permissions: new PermissionsBitField(0n) },
                managedBotRole,
                normalRole
            ]),
            remove: async (rolesArg, reason) => {
                const items = Array.isArray(rolesArg) ? rolesArg : Array.from(rolesArg.values());
                for (const r of items) {
                    if (r?.managed || r === managedBotRole.id) {
                        throw new Error('DiscordAPIError[50028]: Invalid Role (cannot remove managed role)');
                    }
                }
                roleRemoveCalls.push({
                    roleIds: items.map((r) => (typeof r === 'string' ? r : r.id)),
                    reason
                });
            }
        }
    });

    const outcome = await punishExecutor(
        guild,
        botAttacker,
        'strip',
        'Test Managed Role Containment',
        client,
        null,
        { antinukeData: client.antinukeCache.get(guild.id), moduleKey: 'antiChannelDelete', targetId: '9004' }
    );

    assert.equal(outcome, 'Roles Stripped');
    assert.equal(roleRemoveCalls.length, 1, 'Should remove normal non-managed role');
    assert.deepEqual(roleRemoveCalls[0].roleIds, ['800000000000000011']);
    assert.equal(rolePermZeroCalls.length, 1, 'Should zero permissions on editable managed role');
    assert.equal(rolePermZeroCalls[0].roleId, '800000000000000010');
    assert.equal(rolePermZeroCalls[0].perms, 0n);
});

test('Phase B [CONT-02]: zeroTrustQuarantine neutralizes managed integration roles via setPermissions(0n) and removes non-managed dangerous roles', async () => {
    const { client, guild, roleRemoveCalls, rolePermZeroCalls, logMessages } = createMockEnvironment();

    const managedBotRole = {
        id: '800000000000000020',
        name: 'OAuth2 Managed Role',
        managed: true,
        editable: true,
        permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
        setPermissions: async (perms, reason) => {
            rolePermZeroCalls.push({ roleId: '800000000000000020', perms, reason });
        }
    };

    const normalDangerousRole = {
        id: '800000000000000021',
        name: 'Dangerous Bot Role',
        managed: false,
        editable: true,
        permissions: new PermissionsBitField([PermissionFlagsBits.BanMembers])
    };

    const botMember = {
        id: '777777777777777775',
        user: { id: '777777777777777775', tag: 'UntrustedBot#0005', bot: true },
        roles: {
            ...createRoleCollection([managedBotRole, normalDangerousRole]),
            remove: async (rolesToStrip, reason) => {
                const items = Array.isArray(rolesToStrip) ? rolesToStrip : Array.from(rolesToStrip.values());
                for (const r of items) {
                    if (r?.managed || r === managedBotRole.id) {
                        throw new Error('DiscordAPIError[50028]: Invalid Role');
                    }
                }
                roleRemoveCalls.push({
                    roleIds: items.map((r) => (typeof r === 'string' ? r : r.id)),
                    reason
                });
            }
        }
    };

    guild.members.cache.set(botMember.id, botMember);

    const strippedCount = await quarantineGuildBots(guild, client);
    assert.equal(strippedCount, 1, 'Bot must be counted as quarantined once verified');
    assert.equal(rolePermZeroCalls.length, 1, 'Managed bot role permissions must be zeroed');
    assert.equal(rolePermZeroCalls[0].perms, 0n);
    assert.equal(roleRemoveCalls.length, 1, 'Non-managed dangerous role must be removed');
    assert.deepEqual(roleRemoveCalls[0].roleIds, ['800000000000000021']);

    // Also test real-time guildMemberUpdate listener in zeroTrustQuarantine
    await zeroTrustModule.execute(client);
    const oldMember = {
        id: botMember.id,
        guild,
        user: botMember.user,
        roles: createRoleCollection([])
    };
    const newMember = {
        id: botMember.id,
        guild,
        user: botMember.user,
        roles: botMember.roles
    };

    client.emit('guildMemberUpdate', oldMember, newMember);
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(rolePermZeroCalls.length, 2, 'Real-time guildMemberUpdate must also zero managed role permissions');
    assert.equal(logMessages.length, 1, 'Should log quarantine action');
});

// ============================================================================
// 3. ANTIPING FALSE POSITIVES & WEBHOOK HANDLING (DET-01 & DET-02)
// ============================================================================

test('Phase B [DET-01]: antiPing does NOT ban a regular member for 4 mentions or literal @everyone text without mentions.everyone', async () => {
    const { client, guild, banCalls } = createMockEnvironment();
    await antiPingModule.execute(client);

    const regularUser = { id: '777777777777777776', tag: 'NormalChatter#0006', bot: false };
    let messageDeleted = false;

    // 1. Single message with 4 user mentions (below single-message bomb threshold of 10 and burst of 3 msgs)
    const normalGroupReply = {
        id: '1900000000000000001',
        guild,
        author: regularUser,
        webhookId: null,
        content: 'GG <@1> <@2> <@3> <@4> great match! Also typing @everyone without permissions does not ping',
        mentions: {
            everyone: false,
            users: new Map([['1', {}], ['2', {}], ['3', {}], ['4', {}]]),
            roles: new Map()
        },
        delete: async () => {
            messageDeleted = true;
        }
    };

    client.emit('messageCreate', normalGroupReply);
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(banCalls.length, 0, 'Regular user must NOT be banned for 4 user mentions or unparsed @everyone text');
    assert.equal(messageDeleted, false, 'Normal message must NOT be deleted');
});

test('Phase B [DET-01]: antiPing enforces on actual mentions.everyone === true and on repeated mass-mention bursts', async () => {
    const { client, guild, banCalls } = createMockEnvironment();
    await antiPingModule.execute(client);

    // Case A: Actual @everyone ping (mentions.everyone === true)
    const everyoneRaider = { id: '777777777777777777', tag: 'EveryoneRaider#0007', bot: false };
    let deletedEveryoneMsg = false;
    client.emit('messageCreate', {
        id: '1900000000000000002',
        guild,
        author: everyoneRaider,
        webhookId: null,
        content: '@everyone join my server',
        mentions: {
            everyone: true,
            users: new Map(),
            roles: new Map()
        },
        delete: async () => {
            deletedEveryoneMsg = true;
        }
    });
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(banCalls.length, 1, 'Must ban untrusted user who triggers actual mentions.everyone === true');
    assert.equal(banCalls[0].userId, everyoneRaider.id);
    assert.equal(deletedEveryoneMsg, true);

    // Case B: Repeated mass-mention burst (3 messages with 4 mentions each within 10s = 12 mentions across 3 messages)
    const burstRaider = { id: '777777777777777778', tag: 'BurstMentionRaider#0008', bot: false };
    for (let i = 1; i <= 3; i++) {
        client.emit('messageCreate', {
            id: `190000000000000001${i}`,
            guild,
            author: burstRaider,
            webhookId: null,
            content: 'spam mentions',
            mentions: {
                everyone: false,
                users: new Map([['1', {}], ['2', {}], ['3', {}], ['4', {}]]),
                roles: new Map()
            },
            delete: async () => {}
        });
    }
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(banCalls.length, 2, 'Must ban untrusted user after repeated mass-mention burst');
    assert.equal(banCalls[1].userId, burstRaider.id);
});

test('Phase B [DET-02]: antiPing deletes offending webhook and bans untrusted webhook creator without calling guild.bans.create(webhookId)', async () => {
    const { client, guild, banCalls } = createMockEnvironment();
    await antiPingModule.execute(client);

    const webhookId = '999888777666555444';
    const webhookCreator = { id: '777777777777777779', tag: 'WebhookRaider#0009', bot: false };
    let webhookDeleted = false;
    let messageDeleted = false;

    client.fetchWebhook = async (id) => {
        if (id === webhookId) {
            return {
                id: webhookId,
                delete: async () => {
                    webhookDeleted = true;
                }
            };
        }
        return null;
    };

    guild.fetchAuditLogs = async ({ type }) => {
        if (type === AuditLogEvent.WebhookCreate) {
            return {
                entries: new Map([
                    [
                        '1800000000000000001',
                        {
                            id: '1800000000000000001',
                            action: AuditLogEvent.WebhookCreate,
                            target: { id: webhookId },
                            executor: webhookCreator,
                            createdTimestamp: Date.now()
                        }
                    ]
                ])
            };
        }
        return { entries: new Map() };
    };

    client.emit('messageCreate', {
        id: '1900000000000000099',
        guild,
        channel: { id: '555555555555555555' },
        webhookId,
        author: { id: webhookId, tag: 'Captain Hook#0000', bot: true },
        content: '@everyone raided by webhook',
        mentions: {
            everyone: true,
            users: new Map(),
            roles: new Map()
        },
        delete: async () => {
            messageDeleted = true;
        }
    });

    await new Promise((r) => setTimeout(r, 40));

    assert.equal(webhookDeleted, true, 'Offending webhook must be deleted');
    assert.equal(messageDeleted, true, 'Offending webhook message must be deleted');
    assert.equal(
        banCalls.some((b) => b.userId === webhookId),
        false,
        'Must NEVER call guild.bans.create with webhookId'
    );
    assert.equal(banCalls.length, 1, 'Must ban the untrusted webhook creator');
    assert.equal(banCalls[0].userId, webhookCreator.id);
});

// ============================================================================
// 4. WEBHOOK DETECTION & REMEDIATION (ATTR-03 & DET-02)
// ============================================================================

test('Phase B [ATTR-03 & DET-02]: antiWebhookUpdate listens to webhooksUpdate, correlates channel webhook audit entry, bans untrusted executor once, and deletes unauthorized webhook', async () => {
    const { client, guild, banCalls, logMessages } = createMockEnvironment();
    await antiWebhookUpdateModule.execute(client);

    assert.equal(
        client.listenerCount('webhooksUpdate'),
        1,
        'antiWebhookUpdate must register on Discord.js v14 webhooksUpdate event'
    );
    assert.equal(
        client.listenerCount('webhooksUpdates'),
        0,
        'antiWebhookUpdate must NOT register on misspelled webhooksUpdates event'
    );

    const channelId = '555555555555555551';
    const webhookId = '999888777666555111';
    const attacker = { id: '777777777777777780', tag: 'RogueWebhookCreator#0010', bot: false };
    let deletedWebhookCount = 0;

    const channel = {
        id: channelId,
        guild,
        fetchWebhooks: async () =>
            new Map([
                [
                    webhookId,
                    {
                        id: webhookId,
                        owner: attacker,
                        delete: async () => {
                            deletedWebhookCount += 1;
                        }
                    }
                ]
            ])
    };

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            [
                '1800000000000000010',
                {
                    id: '1800000000000000010',
                    action: AuditLogEvent.WebhookCreate,
                    target: { id: webhookId, channelId },
                    executor: attacker,
                    createdTimestamp: Date.now()
                }
            ]
        ])
    });

    client.emit('webhooksUpdate', channel);
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(banCalls.length, 1, 'Untrusted webhook creator must be banned once');
    assert.equal(banCalls[0].userId, attacker.id);
    assert.equal(deletedWebhookCount, 1, 'Unauthorized created webhook must be deleted once');
    assert.equal(logMessages.length, 1, 'Incident log must be emitted once');
});

test('Phase B [ATTR-03]: antiWebhookUpdate exempts whitelisted and guild-owner webhook updates without deleting webhook', async () => {
    const { client, guild, banCalls } = createMockEnvironment();
    await antiWebhookUpdateModule.execute(client);

    const channelId = '555555555555555552';
    const webhookId = '999888777666555222';
    const whitelistedUser = { id: '300000000000000003', tag: 'WhitelistedWebhookDev#0003', bot: false };
    let webhookDeleted = false;

    const channel = {
        id: channelId,
        guild,
        fetchWebhooks: async () =>
            new Map([
                [
                    webhookId,
                    {
                        id: webhookId,
                        owner: whitelistedUser,
                        delete: async () => {
                            webhookDeleted = true;
                        }
                    }
                ]
            ])
    };

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            [
                '1800000000000000020',
                {
                    id: '1800000000000000020',
                    action: AuditLogEvent.WebhookCreate,
                    target: { id: webhookId, channelId },
                    executor: whitelistedUser,
                    createdTimestamp: Date.now()
                }
            ]
        ])
    });

    client.emit('webhooksUpdate', channel);
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(banCalls.length, 0, 'Whitelisted user must not be punished');
    assert.equal(webhookDeleted, false, 'Authorized webhook must not be deleted');
});
