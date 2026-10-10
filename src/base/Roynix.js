import { Client, GatewayIntentBits, Partials, EmbedBuilder, AuditLogEvent, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config/config.js";
import dotenv from "dotenv";
import { isBotOwner } from '../utils/isBotOwner.js';
import { FastDB } from '../utils/fastDb.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';
import { blueprintManager } from '../utils/blueprintManager.js';
import { quarantineGuildBots } from '../antinuke/zeroTrustQuarantine.js';
import { AUDIT_EVENT_TO_MODULE, evaluateActorTrust } from '../utils/securityPolicy.js';
import { IncidentCoordinator } from '../utils/incidentCoordinator.js';
import { decodeSnowflakeTimestamp } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { deleteUnauthorizedWebhook } from '../antinuke/antiWebhookUpdate.js';
import { sweepTracker } from '../antinuke/antiPing.js';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Roynix extends Client {
    /**
     * @param {{ databasePath?: string, antinukeCacheTtlMs?: number, maxCacheEntries?: number, dbCacheTtlMs?: number }} [options]
     */
    constructor(options = {}) {
        super({
            allowedMentions: {
                parse: ["roles", "users", "everyone"],
                repliedUser: false,
            },
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildExpressions,
                GatewayIntentBits.GuildWebhooks,
                GatewayIntentBits.GuildInvites,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildScheduledEvents,
                GatewayIntentBits.AutoModerationConfiguration,
                GatewayIntentBits.AutoModerationExecution,
                GatewayIntentBits.GuildModeration,
            ],
            partials: [
                Partials.GuildMember,
                Partials.User,
                Partials.Message,
                Partials.Channel,
                Partials.Reaction,
                Partials.GuildScheduledEvent,
            ],
            rest: {
                offset: 0,
                retries: 2,
                timeout: 10000,
            },
            ws: {
                properties: {
                    os: 'linux',
                    browser: 'Discord Client',
                    device: 'Discord Client',
                },
            },
        });

        const Nodes = [
            {
                name: config.lavalink?.name || 'Roynix',
                url: config.lavalink?.url || 'new-york-node-1.vortexcloud.xyz:5002',
                auth: config.lavalink?.auth || 'Npgontop',
                secure: config.lavalink?.secure || false
            },
        ];


        this.config = config;
        this.cooldowns = new Map();
        this.color = config.color
        this.isBotOwner = isBotOwner
        this.setMaxListeners(0);

        this.once('shardReady', (shardId) => {
            console.log(`Shard ${shardId} is ready!`);
        })

        this.on('shardDisconnect', (event, shardId) => {
            console.log(`Shard ${shardId} disconnected. Event: ${event}`);
        })

        this.on('shardReconnecting', (shardId) => {
            console.log(`Shard ${shardId} is reconnecting...`);
        })

        this.on('shardError', (error, shardId) => {
            console.error(`Shard ${shardId} encountered an error: ${error}`);
        })

        this.on('shardResume', (id, replayedEvents) => {
            console.log(`Shard ${id} resumed. Replayed events: ${replayedEvents}`);
        })

        const databasePath = options.databasePath || process.env.ROYNIX_DB_DIR || path.join(__dirname, "../../database");
        if (!fs.existsSync(databasePath)) {
            fs.mkdirSync(databasePath, { recursive: true });
        }

        const dbCacheTtlMs = typeof options.dbCacheTtlMs === 'number' ? options.dbCacheTtlMs : 1000;
        const openDb = (filename) => new FastDB({ filePath: path.join(databasePath, filename), cacheTtlMs: dbCacheTtlMs });

        this.noprefixDB = openDb("noprefix.db");
        this.prefixDB = openDb("prefix.db");
        this.tosDB = openDb("tos.db");
        this.errorDB = openDb("error.db");
        this.antinukeDB = openDb("antinuke.db");
        this.badgeDB = openDb('badge.db');
        this.premiumDB = openDb('premium.db');
        this.premiumGuildDB = openDb('premiumGuild.db');
        this.userDB = openDb('user.db');
        this.automodDB = openDb('automod.db');
        this.ticketDB = openDb('ticket.db');
        this.autoreactDB = openDb('autoreact.db');
        this.loggingDB = openDb('logging.db');
        this.welcomeDB = openDb('welcome.db');
        this.j2cDB = openDb('j2c.db');
        this.activeVcDB = openDb('activevc.db');
        this.giveawayDB = openDb('giveaway.db');
        this.ignoreDB = openDb('ignore.db');
        this.afkDB = openDb('afk.db');
        this.mediaDB = openDb('media.db');
        this.autoroleDB = openDb('autorole.db');
        this.autoresponderDB = openDb('autoresponder.db');
        this.activityroleDB = openDb('activityrole.db');

        // Ultra-low latency in-memory caches with bounded size & cross-shard TTL
        this.antinukeCache = new Map();
        this.antinukeCacheTimestamps = new Map();
        this.antinukeCacheTtlMs = options.antinukeCacheTtlMs ?? 2000;
        this.maxCacheEntries = options.maxCacheEntries ?? 2000;
        this.auditLogCache = new Map();
        this.antinukeActionTracker = new Map();
        this.incidentCoordinator = new IncidentCoordinator();
        this._isShuttingDown = false;

        const updateAntinukeCacheEntry = (guildId, val) => {
            if (!guildId) return;
            if (this.antinukeCache.has(guildId)) {
                this.antinukeCache.delete(guildId);
            }
            this.antinukeCache.set(guildId, val ?? null);
            this.antinukeCacheTimestamps.set(guildId, Date.now());
            while (this.antinukeCache.size > this.maxCacheEntries) {
                const oldestGuild = this.antinukeCache.keys().next().value;
                if (oldestGuild === undefined) break;
                this.antinukeCache.delete(oldestGuild);
                this.antinukeCacheTimestamps.delete(oldestGuild);
            }
        };

        // Subscribe directly to FastDB write events so set/setSync/delete/push/pull on antinukeData_<guildId>* stay coherent
        this.antinukeDB.onWrite((rootKey, rootValue, operation) => {
            const match = typeof rootKey === 'string' ? rootKey.match(/^antinukeData_(\d+)$/) : null;
            if (!match) return;
            const guildId = match[1];
            if (operation === 'delete') {
                this.antinukeCache.delete(guildId);
                this.antinukeCacheTimestamps.delete(guildId);
            } else {
                updateAntinukeCacheEntry(guildId, rootValue);
            }
        });

        // Preserve explicit async wrappers on antinukeDB.set and antinukeDB.delete
        const origAntinukeSet = this.antinukeDB.set.bind(this.antinukeDB);
        this.antinukeDB.set = async (key, value) => {
            const res = await origAntinukeSet(key, value);
            const match = typeof key === 'string' ? key.match(/^antinukeData_(\d+)/) : null;
            if (match) {
                const guildId = match[1];
                if (key === `antinukeData_${guildId}`) {
                    updateAntinukeCacheEntry(guildId, value);
                } else {
                    const freshData = await this.antinukeDB.get(`antinukeData_${guildId}`);
                    updateAntinukeCacheEntry(guildId, freshData || null);
                }
            }
            return res;
        };

        const origAntinukeDelete = this.antinukeDB.delete.bind(this.antinukeDB);
        this.antinukeDB.delete = async (key) => {
            const res = await origAntinukeDelete(key);
            const match = typeof key === 'string' ? key.match(/^antinukeData_(\d+)/) : null;
            if (match) {
                const guildId = match[1];
                if (key === `antinukeData_${guildId}`) {
                    this.antinukeCache.delete(guildId);
                    this.antinukeCacheTimestamps.delete(guildId);
                } else {
                    const freshData = await this.antinukeDB.get(`antinukeData_${guildId}`);
                    updateAntinukeCacheEntry(guildId, freshData || null);
                }
            }
            return res;
        };

        /**
         * Ultra-low latency antinuke config memory getter with bounded cross-shard TTL refresh
         * @param {string} guildId
         * @returns {Promise<any>}
         */
        this.getAntinukeData = async (guildId) => {
            if (!guildId) return null;
            const now = Date.now();
            if (this.antinukeCache.has(guildId)) {
                const cachedAt = this.antinukeCacheTimestamps.get(guildId) || 0;
                if ((now - cachedAt) < this.antinukeCacheTtlMs) {
                    return this.antinukeCache.get(guildId);
                }
            }
            const data = await this.antinukeDB.get(`antinukeData_${guildId}`);
            updateAntinukeCacheEntry(guildId, data || null);
            return data;
        };

        /**
         * Write-through cache setter
         * @param {string} guildId
         * @param {any} data
         */
        this.setAntinukeData = async (guildId, data) => {
            updateAntinukeCacheEntry(guildId, data);
            return await this.antinukeDB.set(`antinukeData_${guildId}`, data);
        };

        this.deleteAntinukeData = async (guildId) => {
            this.antinukeCache.delete(guildId);
            this.antinukeCacheTimestamps.delete(guildId);
            return await this.antinukeDB.delete(`antinukeData_${guildId}`);
        };

        this.prewarmAntinukeCache = async () => {
            try {
                const allEntries = await this.antinukeDB.all();
                if (Array.isArray(allEntries)) {
                    for (const item of allEntries) {
                        const match = item.id.match(/^antinukeData_(\d+)/);
                        if (match) {
                            updateAntinukeCacheEntry(match[1], item.value);
                        }
                    }
                }
            } catch {}
        };

        const storeAuditCacheEntry = (guildId, actionType, rawTargetId, executor, auditEntryId, createdTimestamp, rawEntry = null) => {
            const targetKey = rawTargetId != null && rawTargetId !== 'any' ? String(rawTargetId) : 'targetless';
            const key = `${guildId}_${actionType}_${targetKey}`;
            const existing = this.auditLogCache.get(key);
            const isAmbiguous = Boolean(
                existing &&
                existing.executor?.id &&
                executor?.id &&
                existing.executor.id !== executor.id &&
                Math.abs((existing.createdTimestamp || createdTimestamp) - createdTimestamp) <= 1000
            );

            const data = {
                guildId,
                action: actionType,
                targetId: targetKey,
                auditEntryId: auditEntryId ? String(auditEntryId) : null,
                executor: isAmbiguous ? null : executor,
                ambiguous: isAmbiguous,
                createdTimestamp,
                entry: rawEntry
            };

            if (this.auditLogCache.has(key)) {
                this.auditLogCache.delete(key);
            }
            this.auditLogCache.set(key, data);
            while (this.auditLogCache.size > this.maxCacheEntries) {
                const oldestKey = this.auditLogCache.keys().next().value;
                if (oldestKey === undefined) break;
                this.auditLogCache.delete(oldestKey);
            }

            this.emit(`auditLog_${guildId}_${actionType}`, data);
            setTimeout(() => {
                if (this.auditLogCache.get(key) === data) {
                    this.auditLogCache.delete(key);
                }
            }, 10000).unref?.();

            return data;
        };

        this._trackerSweepTimer = setInterval(() => {
            this.sweepTrackers();
        }, 30000);
        this._trackerSweepTimer.unref?.();

        // Stream audit logs directly from Discord WebSocket gateway for 0ms executor detection & coordinated fast-path action
        this.on('guildAuditLogEntryCreate', async (entry, guild) => {
            if (!guild || !entry) return;
            const rawTargetId = entry.target?.id ?? entry.targetId ?? null;
            const executorId = entry.executorId || entry.executor?.id || entry.user_id || null;
            const executor = entry.executor || (executorId ? (this.users.cache.get(executorId) || { id: String(executorId), tag: `User#${String(executorId).slice(-4)}` }) : null);
            const createdTimestamp = entry.createdTimestamp ?? decodeSnowflakeTimestamp(entry.id) ?? Date.now();

            const cacheData = storeAuditCacheEntry(
                guild.id,
                entry.action,
                rawTargetId,
                executor,
                entry.id || null,
                createdTimestamp,
                entry
            );

            if (cacheData.ambiguous || !executor?.id) return;

            const antinukeData = await this.getAntinukeData(guild.id);
            if (!antinukeData?.enabled) return;

            const moduleName = AUDIT_EVENT_TO_MODULE[entry.action];
            const isBotSelfTarget = Boolean(
                (entry.action === AuditLogEvent.MemberKick || entry.action === AuditLogEvent.MemberBanAdd) &&
                rawTargetId &&
                rawTargetId === this.user?.id
            );
            const isProtectRoleTarget = Boolean(
                antinukeData.protectRole &&
                rawTargetId &&
                rawTargetId === String(antinukeData.protectRole) &&
                (entry.action === AuditLogEvent.RoleUpdate || entry.action === AuditLogEvent.RoleDelete)
            );
            if (!moduleName || (!isBotSelfTarget && !isProtectRoleTarget && antinukeData.disabledEvents?.includes(moduleName))) return;

            const incident = this.incidentCoordinator.coordinateIncident({
                guild,
                client: this,
                antinukeData,
                actionType: entry.action,
                moduleKey: moduleName,
                targetId: rawTargetId,
                executorId: executor.id,
                auditEntryId: entry.id || null,
                isProtectRole: isProtectRoleTarget,
                timestamp: createdTimestamp
            });

            if (incident.decision === 'allow') {
                if (entry.action === AuditLogEvent.ChannelDelete && rawTargetId) {
                    blueprintManager.removeChannelSnapshot(guild.id, rawTargetId);
                } else if (entry.action === AuditLogEvent.RoleDelete && rawTargetId) {
                    blueprintManager.removeRoleSnapshot(guild.id, rawTargetId);
                } else if (entry.action === AuditLogEvent.ChannelUpdate && rawTargetId) {
                    const ch = guild.channels?.cache?.get?.(rawTargetId);
                    if (ch) blueprintManager.recordChannel(ch, null, { trusted: true });
                } else if (entry.action === AuditLogEvent.RoleUpdate && rawTargetId) {
                    const role = guild.roles?.cache?.get?.(rawTargetId);
                    if (role) blueprintManager.recordRole(role, { trusted: true });
                }
                return;
            }

            if (incident.decision !== 'enforce') return;

            const punishment = isBotSelfTarget ? 'ban' : (antinukeData.punishment || 'ban');
            const reason = isBotSelfTarget
                ? 'Roynix Antinuke | Rogue Kick Attack Detected'
                : `Roynix Fast-Path | ${moduleName}`;
            const trackingKey = `${guild.id}_${moduleName}_${rawTargetId ?? 'targetless'}_${executor.id}`;

            await punishExecutor(
                guild,
                executor,
                punishment,
                reason,
                this,
                trackingKey,
                { incident, antinukeData, moduleKey: moduleName, targetId: rawTargetId }
            );

            if (
                rawTargetId &&
                (entry.action === AuditLogEvent.WebhookCreate || entry.action === AuditLogEvent.WebhookUpdate)
            ) {
                this.incidentCoordinator.executeRecovery(incident, () =>
                    deleteUnauthorizedWebhook(
                        guild,
                        null,
                        rawTargetId,
                        entry,
                        executor.id,
                        this,
                        'Roynix Fast-Path | Unauthorized Webhook Removed'
                    )
                ).catch(() => null);
            }

            if (this.incidentCoordinator.claimCircuitBreaker(incident)) {
                circuitBreaker.recordIncident(guild, this, moduleName, executor, {
                    incidentKey: incident.incidentId,
                    auditEntryId: entry.id || null,
                    targetId: rawTargetId,
                    moduleKey: moduleName
                }).catch(() => null);
            }
        });

        // Event-driven Blueprint delta listeners with anti-poisoning guards
        this.on('channelCreate', (ch) => blueprintManager.seedChannelIfMissing(ch));
        this.on('channelUpdate', async (oldCh, newCh) => {
            if (oldCh) blueprintManager.seedChannelIfMissing(oldCh);
            const guildId = newCh?.guild?.id;
            if (!guildId) return;
            const antinukeData = await this.getAntinukeData(guildId);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('antiChannelUpdate')) {
                blueprintManager.recordChannel(newCh);
            }
        });
        this.on('roleCreate', (role) => blueprintManager.seedRoleIfMissing(role));
        this.on('roleUpdate', async (oldR, newR) => {
            if (oldR) blueprintManager.seedRoleIfMissing(oldR);
            const guildId = newR?.guild?.id;
            if (!guildId) return;
            const antinukeData = await this.getAntinukeData(guildId);
            if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('antiRoleUpdate')) {
                blueprintManager.recordRole(newR);
            }
        });
        this.on('guildCreate', (guild) => blueprintManager.captureGuild(guild));
        this.on('guildDelete', (guild) => {
            if (guild?.id) {
                blueprintManager.removeGuildBlueprint(guild.id);
                this.antinukeCache.delete(guild.id);
                this.antinukeCacheTimestamps.delete(guild.id);
            }
        });

        // PLAN 2: Raw WebSocket Gateway Packet Sniffer (Microsecond Gateway Fast-Path)
        this.on('raw', async (packet) => {
            if (packet?.t !== 'GUILD_AUDIT_LOG_ENTRY_CREATE' || !packet.d) return;
            const d = packet.d;
            const guildId = d.guild_id;
            const executorId = d.user_id;
            const actionType = d.action_type;
            const rawTargetId = d.target_id ?? null;

            if (!guildId || !executorId) return;

            const createdTimestamp = decodeSnowflakeTimestamp(d.id) ?? Date.now();
            const user = this.users.cache.get(executorId) || { id: String(executorId), tag: `Executor#${String(executorId).slice(-4)}` };

            const cacheData = storeAuditCacheEntry(
                guildId,
                actionType,
                rawTargetId,
                user,
                d.id || null,
                createdTimestamp,
                d
            );

            if (cacheData.ambiguous) return;

            // Require guild object in cache so guild.ownerId trust check is always authoritative
            const guild = this.guilds.cache.get(guildId);
            if (!guild) return;

            const antinukeData = await this.getAntinukeData(guildId);
            if (!antinukeData?.enabled) return;

            const moduleName = AUDIT_EVENT_TO_MODULE[actionType];
            const isBotSelfTarget = Boolean(
                (actionType === AuditLogEvent.MemberKick || actionType === AuditLogEvent.MemberBanAdd) &&
                rawTargetId &&
                rawTargetId === this.user?.id
            );
            const isProtectRoleTarget = Boolean(
                antinukeData.protectRole &&
                rawTargetId &&
                rawTargetId === String(antinukeData.protectRole) &&
                (actionType === AuditLogEvent.RoleUpdate || actionType === AuditLogEvent.RoleDelete)
            );
            if (!moduleName || (!isBotSelfTarget && !isProtectRoleTarget && antinukeData.disabledEvents?.includes(moduleName))) return;

            const incident = this.incidentCoordinator.coordinateIncident({
                guild,
                client: this,
                antinukeData,
                actionType,
                moduleKey: moduleName,
                targetId: rawTargetId,
                executorId: String(executorId),
                auditEntryId: d.id || null,
                isProtectRole: isProtectRoleTarget,
                timestamp: createdTimestamp
            });

            if (incident.decision === 'allow') {
                if (actionType === AuditLogEvent.ChannelDelete && rawTargetId) {
                    blueprintManager.removeChannelSnapshot(guildId, rawTargetId);
                } else if (actionType === AuditLogEvent.RoleDelete && rawTargetId) {
                    blueprintManager.removeRoleSnapshot(guildId, rawTargetId);
                } else if (actionType === AuditLogEvent.ChannelUpdate && rawTargetId) {
                    const ch = guild.channels?.cache?.get?.(rawTargetId);
                    if (ch) blueprintManager.recordChannel(ch, null, { trusted: true });
                } else if (actionType === AuditLogEvent.RoleUpdate && rawTargetId) {
                    const role = guild.roles?.cache?.get?.(rawTargetId);
                    if (role) blueprintManager.recordRole(role, { trusted: true });
                }
                return;
            }

            if (incident.decision !== 'enforce') return;

            const punishment = isBotSelfTarget ? 'ban' : (antinukeData.punishment || 'ban');
            const reason = isBotSelfTarget
                ? 'Roynix Antinuke | Rogue Kick Attack Detected'
                : `Roynix Raw-Gateway FastPath | ${moduleName}`;
            const trackingKey = `${guildId}_${moduleName}_${rawTargetId ?? 'targetless'}_${executorId}`;

            // 1. Coordinated single-decision punishment (shares promise with guildAuditLogEntryCreate & module listeners)
            await punishExecutor(
                guild,
                user,
                punishment,
                reason,
                this,
                trackingKey,
                { incident, antinukeData, moduleKey: moduleName, targetId: rawTargetId }
            );

            if (
                rawTargetId &&
                (actionType === AuditLogEvent.WebhookCreate || actionType === AuditLogEvent.WebhookUpdate)
            ) {
                this.incidentCoordinator.executeRecovery(incident, () =>
                    deleteUnauthorizedWebhook(
                        guild,
                        null,
                        rawTargetId,
                        d,
                        executorId,
                        this,
                        'Roynix Raw-Gateway FastPath | Unauthorized Webhook Removed'
                    )
                ).catch(() => null);
            }

            // 2. Claim Circuit Breaker recording once per distinct incident
            if (this.incidentCoordinator.claimCircuitBreaker(incident)) {
                const cachedMember = guild.members?.cache?.get?.(executorId);
                circuitBreaker.recordIncident(guild, this, moduleName, cachedMember?.user || user, {
                    incidentKey: incident.incidentId,
                    auditEntryId: d.id || null,
                    targetId: rawTargetId,
                    moduleKey: moduleName
                }).catch(() => null);
            }

            // 3. Coordinated Gateway-Level Auto-Recovery for destroyed channels and roles
            if (!antinukeData.disabledEvents?.includes('autoRecovery') && rawTargetId) {
                if (actionType === AuditLogEvent.ChannelDelete) {
                    const fallbackChannel = guild.channels?.cache?.get?.(rawTargetId) || blueprintManager.getChannelSnapshot(guildId, rawTargetId);
                    if (fallbackChannel) {
                        this.incidentCoordinator.executeRecovery(incident, () =>
                            blueprintManager.restoreChannelHierarchical(guild, fallbackChannel)
                        ).catch(() => null);
                    }
                } else if (actionType === AuditLogEvent.RoleDelete) {
                    this.incidentCoordinator.executeRecovery(incident, () =>
                        blueprintManager.restoreRole(guild, rawTargetId)
                    ).catch(() => null);
                }
            }
        });

        // Prewarm all guilds on ready with zero delay
        this.once('ready', () => {
            for (const [_, guild] of this.guilds.cache) {
                blueprintManager.captureGuild(guild);
            }
        });
    }

    /**
     * Sweep all in-memory security caches and trackers to enforce TTL expiry and bounded RAM usage.
     * @param {number} [now]
     */
    sweepTrackers(now = Date.now()) {
        // 1. Audit log cache (10s freshness TTL + maxCacheEntries cap)
        for (const [key, entry] of this.auditLogCache.entries()) {
            const ts = entry?.createdTimestamp ?? 0;
            if ((now - ts) > 10000) {
                this.auditLogCache.delete(key);
            }
        }
        while (this.auditLogCache.size > this.maxCacheEntries) {
            const oldestKey = this.auditLogCache.keys().next().value;
            if (oldestKey === undefined) break;
            this.auditLogCache.delete(oldestKey);
        }

        // 2. Antinuke action tracker (15s TTL + maxCacheEntries cap)
        for (const [key, record] of this.antinukeActionTracker.entries()) {
            const ts = record?.timestamp ?? 0;
            if ((now - ts) > 15000) {
                this.antinukeActionTracker.delete(key);
            }
        }
        while (this.antinukeActionTracker.size > this.maxCacheEntries) {
            const oldestKey = this.antinukeActionTracker.keys().next().value;
            if (oldestKey === undefined) break;
            this.antinukeActionTracker.delete(oldestKey);
        }

        // 3. Antinuke config cache cap
        while (this.antinukeCache.size > this.maxCacheEntries) {
            const oldestGuild = this.antinukeCache.keys().next().value;
            if (oldestGuild === undefined) break;
            this.antinukeCache.delete(oldestGuild);
            this.antinukeCacheTimestamps.delete(oldestGuild);
        }

        // 4. AntiPing trackers (if initialized)
        if (this.botMessageSpamTracker) {
            sweepTracker(this.botMessageSpamTracker, now, 3000, 1000);
        }
        if (this.memberPingTracker) {
            sweepTracker(this.memberPingTracker, now, 10000, 1000);
        }

        // 5. IncidentCoordinator, CircuitBreaker, and BlueprintManager
        this.incidentCoordinator?.sweep?.(now);
        circuitBreaker.sweep(now);
        blueprintManager.sweep();
    }

    /**
     * Gracefully flush and close all FastDB SQLite connections, clear background timers, and destroy the Discord client.
     * Safe and idempotent across SIGINT/SIGTERM and test teardown.
     * @param {string} [signal]
     */
    async shutdown(signal = 'SIGTERM') {
        if (this._isShuttingDown) return false;
        this._isShuttingDown = true;

        if (this._trackerSweepTimer) {
            clearInterval(this._trackerSweepTimer);
            this._trackerSweepTimer = null;
        }

        const dbKeys = [
            'noprefixDB', 'prefixDB', 'tosDB', 'errorDB', 'antinukeDB',
            'badgeDB', 'premiumDB', 'premiumGuildDB', 'userDB', 'automodDB',
            'ticketDB', 'autoreactDB', 'loggingDB', 'welcomeDB', 'j2cDB',
            'activeVcDB', 'giveawayDB', 'ignoreDB', 'afkDB', 'mediaDB',
            'autoroleDB', 'autoresponderDB', 'activityroleDB'
        ];
        for (const prop of dbKeys) {
            try {
                this[prop]?.close?.();
            } catch {}
        }

        try {
            this.destroy();
        } catch {}

        return true;
    }

    async start() {
        await Promise.all([
            this.noprefixDB.init(),
            this.prefixDB.init(),
            this.antinukeDB.init()
        ]).catch(() => null);
        await this.loadHandlers();
        await this.prewarmAntinukeCache();
        if (!config.token) {
            console.error("Missing TOKEN");
            process.exit(1);
        }
        this.login(config.token);
    }

    async loadHandlers() {
        const commandHandler = (await import("../handlers/commandHandler.js")).default;
        const eventHandler = (await import("../handlers/eventHandler.js")).default;
        const anticrash = (await import('../handlers/anticrash.js')).default;
        const antinuke = (await import('../handlers/antinuke.js')).default;
        const logging = (await import('../handlers/logging.js')).default;

        commandHandler(this).catch((err) => console.error(`An error occurred while loading command handler: ` + err));
        eventHandler(this).catch((err) => console.error(`An error occurred while loading event handler: ` + err));
        await anticrash(this).catch((err) => console.error(`An error occurred while loading anticrash handler: ` + err));
        await antinuke(this).catch((err) => console.error(`An error occurred while loading antinuke handler: ` + err));
        await logging(this).catch((err) => console.error(`An error occured while loading logging handler: ` + err));

    }
}

export { Roynix, Roynix as Cryptora };
export default Roynix;
