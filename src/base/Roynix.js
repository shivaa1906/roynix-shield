import { Client, GatewayIntentBits, Partials, EmbedBuilder, AuditLogEvent, Routes } from "discord.js";
import { QuickDB } from "quick.db";
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
import https from "https";
dotenv.config();

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 100,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Roynix extends Client {
    constructor() {
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
                agent: httpsAgent,
                offset: 0,
                retries: 1,
                timeout: 8000,
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

        const databasePath = path.join(__dirname, "../../database");
        if (!fs.existsSync(databasePath)) {
            fs.mkdirSync(databasePath, { recursive: true });
        }

        this.noprefixDB = new FastDB(new QuickDB({ filePath: path.join(databasePath, "noprefix.db") }));
        this.prefixDB = new FastDB(new QuickDB({ filePath: path.join(databasePath, "prefix.db") }));
        this.tosDB = new QuickDB({ filePath: path.join(databasePath, "tos.db") });
        this.errorDB = new QuickDB({ filePath: path.join(databasePath, "error.db") });
        this.antinukeDB = new FastDB(new QuickDB({ filePath: path.join(databasePath, "antinuke.db") }));
        this.badgeDB = new QuickDB({ filePath: path.join(databasePath, 'badge.db') })
        this.premiumDB = new QuickDB({ filePath: path.join(databasePath, 'premium.db') })
        this.premiumGuildDB = new QuickDB({ filePath: path.join(databasePath, 'premiumGuild.db') })
        this.userDB = new QuickDB({ filePath: path.join(databasePath, 'user.db') })
        this.automodDB = new QuickDB({ filePath: path.join(databasePath, 'automod.db') })
        this.ticketDB = new QuickDB({ filePath: path.join(databasePath, 'ticket.db') })
        this.autoreactDB = new QuickDB({ filePath: path.join(databasePath, 'autoreact.db') })
        this.loggingDB = new QuickDB({ filePath: path.join(databasePath, 'logging.db') })
        this.welcomeDB = new QuickDB({ filePath: path.join(databasePath, 'welcome.db') })
        this.j2cDB = new QuickDB({ filePath: path.join(databasePath, 'j2c.db') })
        this.activeVcDB = new QuickDB({ filePath: path.join(databasePath, 'activevc.db') })
        this.giveawayDB = new QuickDB({ filePath: path.join(databasePath, 'giveaway.db') })
        this.ignoreDB = new QuickDB({ filePath: path.join(databasePath, 'ignore.db') })
        this.afkDB = new QuickDB({ filePath: path.join(databasePath, 'afk.db') })
        this.mediaDB = new QuickDB({ filePath: path.join(databasePath, 'media.db') })
        this.autoroleDB = new QuickDB({ filePath: path.join(databasePath, 'autorole.db') })
        this.autoresponderDB = new QuickDB({ filePath: path.join(databasePath, 'autoresponder.db') })
        this.activityroleDB = new QuickDB({ filePath: path.join(databasePath, 'activityrole.db') })

        // Ultra-low latency in-memory caches
        this.antinukeCache = new Map();
        this.auditLogCache = new Map();
        this.antinukeActionTracker = new Map();

        const AUDIT_EVENT_TO_MODULE = {
            [AuditLogEvent.ChannelDelete]: 'antiChannelDelete',
            [AuditLogEvent.ChannelCreate]: 'antiChannelCreate',
            [AuditLogEvent.ChannelUpdate]: 'antiChannelUpdate',
            [AuditLogEvent.RoleDelete]: 'antiRoleDelete',
            [AuditLogEvent.RoleCreate]: 'antiRoleCreate',
            [AuditLogEvent.RoleUpdate]: 'antiRoleUpdate',
            [AuditLogEvent.MemberBanAdd]: 'antiBan',
            [AuditLogEvent.MemberKick]: 'antiKick',
            [AuditLogEvent.MemberBanRemove]: 'antiUnban',
            [AuditLogEvent.BotAdd]: 'antiBot',
            [AuditLogEvent.EmojiCreate]: 'antiEmojiCreate',
            [AuditLogEvent.EmojiDelete]: 'antiEmojiDelete',
            [AuditLogEvent.EmojiUpdate]: 'antiEmojiUpdate',
            [AuditLogEvent.StickerCreate]: 'antiStickerCreate',
            [AuditLogEvent.StickerDelete]: 'antiStickerDelete',
            [AuditLogEvent.StickerUpdate]: 'antiStickerUpdate',
            [AuditLogEvent.GuildUpdate]: 'antiGuildUpdate',
            [AuditLogEvent.MemberRoleUpdate]: 'antiMemberUpdate',
            [AuditLogEvent.MemberUpdate]: 'antiMemberUpdate',
            [AuditLogEvent.WebhookCreate]: 'antiWebhookUpdate',
            [AuditLogEvent.WebhookDelete]: 'antiWebhookUpdate',
            [AuditLogEvent.WebhookUpdate]: 'antiWebhookUpdate',
            [AuditLogEvent.Prune]: 'antiPrune'
        };

        // Auto-sync in-memory cache whenever antinukeDB is updated anywhere in the bot
        const origAntinukeSet = this.antinukeDB.set.bind(this.antinukeDB);
        this.antinukeDB.set = async (key, value) => {
            const res = await origAntinukeSet(key, value);
            const match = key.match(/^antinukeData_(\d+)/);
            if (match) {
                const guildId = match[1];
                if (key === `antinukeData_${guildId}`) {
                    this.antinukeCache.set(guildId, value);
                } else {
                    const freshData = await this.antinukeDB.get(`antinukeData_${guildId}`);
                    this.antinukeCache.set(guildId, freshData || null);
                }
            }
            return res;
        };

        const origAntinukeDelete = this.antinukeDB.delete.bind(this.antinukeDB);
        this.antinukeDB.delete = async (key) => {
            const res = await origAntinukeDelete(key);
            const match = key.match(/^antinukeData_(\d+)/);
            if (match) {
                this.antinukeCache.delete(match[1]);
            }
            return res;
        };

        /**
         * Ultra-low latency antinuke config memory getter (0.001ms RAM lookup)
         * @param {string} guildId
         * @returns {Promise<any>}
         */
        this.getAntinukeData = async (guildId) => {
            if (this.antinukeCache.has(guildId)) {
                return this.antinukeCache.get(guildId);
            }
            const data = await this.antinukeDB.get(`antinukeData_${guildId}`);
            this.antinukeCache.set(guildId, data || null);
            return data;
        };

        /**
         * Write-through cache setter
         * @param {string} guildId
         * @param {any} data
         */
        this.setAntinukeData = async (guildId, data) => {
            this.antinukeCache.set(guildId, data);
            return await this.antinukeDB.set(`antinukeData_${guildId}`, data);
        };

        this.deleteAntinukeData = async (guildId) => {
            this.antinukeCache.delete(guildId);
            return await this.antinukeDB.delete(`antinukeData_${guildId}`);
        };

        this.prewarmAntinukeCache = async () => {
            try {
                const allEntries = await this.antinukeDB.all();
                if (Array.isArray(allEntries)) {
                    for (const item of allEntries) {
                        const match = item.id.match(/^antinukeData_(\d+)/);
                        if (match) {
                            this.antinukeCache.set(match[1], item.value);
                        }
                    }
                }
            } catch {}
        };

        // Stream audit logs directly from Discord WebSocket gateway for 0ms executor detection & instant fast-path action
        this.on('guildAuditLogEntryCreate', async (entry, guild) => {
            if (!guild || !entry) return;
            const targetId = entry.target?.id || entry.targetId || 'any';
            const key = `${guild.id}_${entry.action}_${targetId}`;
            const data = {
                guildId: guild.id,
                action: entry.action,
                targetId,
                executor: entry.executor,
                createdTimestamp: entry.createdTimestamp || Date.now(),
                entry
            };
            this.auditLogCache.set(key, data);
            const keyGeneral = `${guild.id}_${entry.action}_any`;
            this.auditLogCache.set(keyGeneral, data);

            // Instant event emission for any awaiting getAuditExecutor (resolves within 0-1ms)
            this.emit(`auditLog_${guild.id}_${entry.action}`, data);

            setTimeout(() => {
                this.auditLogCache.delete(key);
                this.auditLogCache.delete(keyGeneral);
            }, 8000).unref?.();

            // FAST-PATH ZERO-MS PUNISHMENT ENGINE
            const moduleName = AUDIT_EVENT_TO_MODULE[entry.action];
            const executorId = entry.executorId || entry.executor?.id || entry.user_id;
            const executor = entry.executor || (executorId ? (this.users.cache.get(executorId) || { id: executorId, tag: `User#${executorId.slice(-4)}` }) : null);
            if (executor) {
                const antinukeData = this.antinukeCache.get(guild.id) || await this.getAntinukeData(guild.id);
                if (antinukeData?.enabled) {
                    // Instant self-preservation fast-ban ONLY when antinuke is enabled
                    if ((entry.action === AuditLogEvent.MemberKick || entry.action === AuditLogEvent.MemberBanAdd) && 
                        targetId === this.user.id && executor.id !== guild.ownerId && !this.isBotOwner(executor.id)) {
                        const rogueMember = guild.members.cache.get(executor.id);
                        if (rogueMember?.manageable) rogueMember.roles.set([], 'Roynix Antinuke | Rogue Preserved Quarantine').catch(() => null);
                        guild.bans.create(executor.id, { reason: 'Roynix Antinuke | Rogue Kick Attack Detected', deleteMessageSeconds: 604800 }).catch(() => null);
                    }

                    if (moduleName && !antinukeData.disabledEvents?.includes(moduleName)) {
                    const extraOwners = antinukeData.extraOwners || [];
                    const whitelisted = antinukeData.whitelisted || {};
                    const punishment = antinukeData.punishment || 'ban';

                    if (
                        executor.id !== this.user.id &&
                        executor.id !== guild.ownerId &&
                        !this.isBotOwner(executor.id) &&
                        !extraOwners.includes(executor.id) &&
                        !whitelisted[executor.id]?.events?.includes(moduleName)
                    ) {
                        const trackingKey = `${guild.id}_${moduleName}_${targetId}_${executor.id}`;
                        if (!this.antinukeActionTracker.has(trackingKey)) {
                            this.antinukeActionTracker.set(trackingKey, { actionTaken: punishment === 'kick' ? 'Kicked' : 'Banned', timestamp: Date.now() });
                            setTimeout(() => this.antinukeActionTracker.delete(trackingKey), 8000).unref?.();

                            // Execute dual-action instant punishment with 0 delay (Emergency Role Strip + Ban)
                            (async () => {
                                try {
                                    const cachedMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
                                    if (cachedMember?.manageable) {
                                        cachedMember.roles.set([], `Roynix Fast-Path | Emergency Role Quarantine`).catch(() => null);
                                    }
                                    if (punishment === 'kick') {
                                        if (cachedMember?.kickable) await cachedMember.kick(`Roynix Fast-Path | ${moduleName}`).catch(() => null);
                                    } else {
                                        await guild.bans.create(executor.id, { reason: `Roynix Fast-Path | ${moduleName}`, deleteMessageSeconds: 604800 }).catch(() => null);
                                    }
                                } catch {}
                            })();
                            circuitBreaker.recordIncident(guild, this, moduleName, executor).catch(() => null);
                        }
                    }
                }
            }
        }
        });

        // Event-driven Blueprint delta listeners (keeps in-memory snapshot live with 0ms sync)
        this.on('channelCreate', (ch) => blueprintManager.recordChannel(ch));
        this.on('channelUpdate', (oldCh, newCh) => blueprintManager.recordChannel(newCh));
        this.on('guildCreate', (guild) => blueprintManager.captureGuild(guild));

        // PLAN 2: Raw WebSocket Gateway Packet Sniffer (Microsecond Gateway Fast-Path)
        this.on('raw', async (packet) => {
            if (packet.t !== 'GUILD_AUDIT_LOG_ENTRY_CREATE' || !packet.d) return;
            const d = packet.d;
            const guildId = d.guild_id;
            const executorId = d.user_id;
            const actionType = d.action_type;
            const targetId = d.target_id || 'any';

            if (!guildId || !executorId) return;

            // Instant in-memory audit log cache pre-population in 0 microseconds
            const now = Date.now();
            const user = this.users.cache.get(executorId) || { id: executorId, tag: `Executor#${executorId.slice(-4)}` };
            const cacheData = {
                guildId,
                action: actionType,
                targetId,
                executor: user,
                createdTimestamp: now
            };
            this.auditLogCache.set(`${guildId}_${actionType}_${targetId}`, cacheData);
            this.auditLogCache.set(`${guildId}_${actionType}_any`, cacheData);
            this.emit(`auditLog_${guildId}_${actionType}`, cacheData);

            const antinukeData = this.antinukeCache.get(guildId) || await this.getAntinukeData(guildId);
            if (!antinukeData?.enabled) return;

            const moduleName = AUDIT_EVENT_TO_MODULE[actionType];
            if (!moduleName || antinukeData.disabledEvents?.includes(moduleName)) return;

            const extraOwners = antinukeData.extraOwners || [];
            const whitelisted = antinukeData.whitelisted || {};
            const punishment = antinukeData.punishment || 'ban';

            if (
                executorId === this.user?.id ||
                isBotOwner(executorId) ||
                extraOwners.includes(executorId) ||
                whitelisted[executorId]?.events?.includes(moduleName)
            ) return;

            // Deduplicate actions by executor across burst window to conserve REST quota
            const executorKey = `${guildId}_raw_punished_${executorId}`;
            if (this.antinukeActionTracker.has(executorKey)) return;

            this.antinukeActionTracker.set(executorKey, { actionTaken: punishment === 'kick' ? 'Kicked' : 'Banned', timestamp: now });
            setTimeout(() => this.antinukeActionTracker.delete(executorKey), 8000).unref?.();

            // 1. Instant raw role quarantine if member is cached
            const guild = this.guilds.cache.get(guildId);
            if (guild) {
                const cachedMember = guild.members.cache.get(executorId);
                if (cachedMember?.manageable) {
                    cachedMember.roles.set([], `Roynix Raw Gateway FastPath | Role Quarantine`).catch(() => null);
                }
                circuitBreaker.recordIncident(guild, this, moduleName, cachedMember?.user || user).catch(() => null);
            }

            // 2. Direct microsecond REST API dispatch without event loop delay
            if (punishment === 'kick') {
                this.rest.delete(Routes.guildMember(guildId, executorId), {
                    reason: `Roynix Raw-Gateway FastPath | ${moduleName}`
                }).catch(() => null);
            } else {
                this.rest.put(Routes.guildBan(guildId, executorId), {
                    body: { delete_message_seconds: 604800 },
                    reason: `Roynix Raw-Gateway FastPath | ${moduleName}`
                }).catch(() => null);
            }
        });

        // Prewarm all guilds on ready with zero delay
        this.once('ready', () => {
            for (const [_, guild] of this.guilds.cache) {
                blueprintManager.captureGuild(guild);
                quarantineGuildBots(guild, this).catch(() => null);
            }
        });
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
