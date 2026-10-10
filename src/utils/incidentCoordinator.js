import { evaluateActorTrust } from './securityPolicy.js';
import { redactSecrets } from './logger.js';

const POSITIVE_ENFORCEMENT_OUTCOMES = new Set([
    'Banned',
    'Kicked',
    'Roles Stripped',
    'Roles Stripped (Fallback)',
    'Roles Stripped & Timed Out (Fallback)',
    'Timed Out (Fallback)',
    'Bot Banned',
    'Bot Kicked',
    'Webhook Deleted'
]);

/**
 * Determine whether an enforcement outcome represents a verified completed action.
 * @param {string | null | undefined} outcome
 * @returns {boolean}
 */
export function isVerifiedEnforcementOutcome(outcome) {
    if (!outcome || typeof outcome !== 'string') return false;
    if (POSITIVE_ENFORCEMENT_OUTCOMES.has(outcome)) return true;
    return (
        outcome.includes('Banned') ||
        outcome.includes('Kicked') ||
        outcome.includes('Roles Stripped') ||
        outcome.includes('Timed Out') ||
        outcome.includes('Webhook Deleted')
    );
}

export class IncidentCoordinator {
    /**
     * @param {{ dedupeWindowMs?: number, executorWindowMs?: number, maxIncidents?: number, maxExecutorStates?: number, maxHistory?: number }} [options]
     */
    constructor(options = {}) {
        this.dedupeWindowMs = options.dedupeWindowMs ?? 8000;
        this.executorWindowMs = options.executorWindowMs ?? 12000;
        this.maxIncidents = options.maxIncidents ?? 1000;
        this.maxExecutorStates = options.maxExecutorStates ?? 1000;
        this.maxHistory = options.maxHistory ?? 200;
        /** @type {Map<string, object>} */
        this.incidents = new Map();
        /** @type {Map<string, object>} */
        this.incidentsByAudit = new Map();
        /** @type {Map<string, { status: 'idle'|'in_progress'|'succeeded'|'failed', actionTaken: string|null, promise: Promise<string>|null, updatedAt: number, attempts: number }>} */
        this.executorStates = new Map();
        /** @type {Map<string, object>} */
        this.incidentHistory = new Map();
    }

    /**
     * Record a structured, secret-redacted observability snapshot for an incident.
     * @param {object} incident
     */
    _recordHistory(incident) {
        if (!incident?.incidentId) return;
        const record = {
            incidentId: redactSecrets(incident.incidentId),
            key: redactSecrets(incident.key || incident.incidentId),
            baseKey: redactSecrets(incident.baseKey),
            guildId: String(incident.guildId || 'unknown_guild'),
            moduleKey: String(incident.moduleKey || 'unknown_module'),
            actionType: incident.actionType ?? null,
            targetId: incident.targetId ? String(incident.targetId) : null,
            executorId: incident.executorId ? redactSecrets(String(incident.executorId)) : null,
            auditEntryId: incident.auditEntryId ? String(incident.auditEntryId) : null,
            trustState: incident.trustState,
            trustReason: incident.trustReason,
            decision: incident.decision,
            deliveries: incident.deliveries,
            enforcement: {
                status: incident.enforcement?.status || 'idle',
                actionTaken: incident.enforcement?.actionTaken
                    ? redactSecrets(incident.enforcement.actionTaken)
                    : null,
                attempts: incident.enforcement?.attempts || 0
            },
            recovery: {
                status: incident.recovery?.status || 'idle',
                attempts: incident.recovery?.attempts || 0
            },
            circuitBreakerRecorded: Boolean(incident.circuitBreakerRecorded),
            createdAt: incident.createdAt,
            updatedAt: incident.updatedAt
        };

        if (this.incidentHistory.has(record.incidentId)) {
            this.incidentHistory.delete(record.incidentId);
        }
        this.incidentHistory.set(record.incidentId, record);

        while (this.incidentHistory.size > this.maxHistory) {
            const oldestKey = this.incidentHistory.keys().next().value;
            if (oldestKey === undefined) break;
            this.incidentHistory.delete(oldestKey);
        }
    }

    /**
     * Retrieve recent structured incident records (newest first), guaranteed free of secrets.
     * @param {number} [limit=50]
     * @returns {Array<object>}
     */
    getRecentIncidents(limit = 50) {
        const all = Array.from(this.incidentHistory.values());
        return all.slice(-Math.max(1, limit)).reverse();
    }

    /**
     * Return bounded tracker statistics for health and observability checks.
     */
    getStats() {
        return {
            activeIncidents: this.incidents.size,
            activeExecutorStates: this.executorStates.size,
            historyRecords: this.incidentHistory.size,
            maxIncidents: this.maxIncidents,
            maxExecutorStates: this.maxExecutorStates,
            maxHistory: this.maxHistory
        };
    }

    /**
     * Evict expired incident and executor records and enforce hard upper bounds to keep memory bounded.
     * @param {number} [now]
     */
    sweep(now = Date.now()) {
        for (const [key, incident] of this.incidents.entries()) {
            if (now - incident.updatedAt > this.dedupeWindowMs && incident.enforcement.status !== 'in_progress' && incident.recovery.status !== 'in_progress') {
                this.incidents.delete(key);
            }
        }
        if (this.incidents.size > this.maxIncidents) {
            for (const [key, incident] of this.incidents.entries()) {
                if (this.incidents.size <= this.maxIncidents) break;
                if (incident.enforcement.status !== 'in_progress' && incident.recovery.status !== 'in_progress') {
                    this.incidents.delete(key);
                }
            }
        }

        for (const [key, incident] of this.incidentsByAudit.entries()) {
            if (now - incident.updatedAt > this.dedupeWindowMs && incident.enforcement.status !== 'in_progress' && incident.recovery.status !== 'in_progress') {
                this.incidentsByAudit.delete(key);
            }
        }
        if (this.incidentsByAudit.size > this.maxIncidents) {
            for (const [key, incident] of this.incidentsByAudit.entries()) {
                if (this.incidentsByAudit.size <= this.maxIncidents) break;
                if (incident.enforcement.status !== 'in_progress' && incident.recovery.status !== 'in_progress') {
                    this.incidentsByAudit.delete(key);
                }
            }
        }

        for (const [key, state] of this.executorStates.entries()) {
            if (now - state.updatedAt > this.executorWindowMs && state.status !== 'in_progress') {
                this.executorStates.delete(key);
            }
        }
        if (this.executorStates.size > this.maxExecutorStates) {
            for (const [key, state] of this.executorStates.entries()) {
                if (this.executorStates.size <= this.maxExecutorStates) break;
                if (state.status !== 'in_progress') {
                    this.executorStates.delete(key);
                }
            }
        }
    }

    /**
     * Normalize, deduplicate, and evaluate policy for a security event across raw, audit-log, and Discord.js listeners.
     *
     * @param {object} params
     * @param {import('discord.js').Guild | { id: string, ownerId?: string, client?: any }} params.guild
     * @param {any} [params.client]
     * @param {object | null} [params.antinukeData]
     * @param {number | string | null} [params.actionType]
     * @param {string} params.moduleKey
     * @param {string | null} [params.targetId]
     * @param {string | null} [params.executorId]
     * @param {string | null} [params.auditEntryId]
     * @param {boolean} [params.isRaidIncident]
     * @param {boolean} [params.isProtectRole]
     * @param {number} [params.timestamp]
     */
    coordinateIncident({
        guild,
        client = null,
        antinukeData = null,
        actionType = null,
        moduleKey,
        targetId = null,
        executorId = null,
        auditEntryId = null,
        isRaidIncident = false,
        isProtectRole = false,
        timestamp = Date.now()
    }) {
        const now = timestamp || Date.now();
        if (this.incidents.size >= this.maxIncidents || this.executorStates.size >= this.maxExecutorStates || this.incidents.size > 500 || this.executorStates.size > 500) {
            this.sweep(now);
        }

        const guildId = guild?.id || 'unknown_guild';
        const normalizedTargetId = targetId != null && targetId !== 'any' ? String(targetId) : null;
        const normalizedExecutorId = executorId != null ? String(executorId) : null;
        const normalizedAuditId = auditEntryId != null ? String(auditEntryId) : null;

        const baseKey = `${guildId}:${moduleKey}:${normalizedTargetId ?? 'targetless'}`;
        const auditIndexKey = normalizedAuditId ? `${guildId}:${moduleKey}:audit:${normalizedAuditId}` : null;

        let existing = null;
        if (auditIndexKey && this.incidentsByAudit.has(auditIndexKey)) {
            const byAudit = this.incidentsByAudit.get(auditIndexKey);
            if (byAudit && (now - byAudit.createdAt) <= this.dedupeWindowMs) {
                existing = byAudit;
            }
        }

        if (!existing) {
            existing = this.incidents.get(baseKey) || null;
            if (existing) {
                const isExpired = (now - existing.createdAt) > this.dedupeWindowMs;
                const hasConflictingAuditId = Boolean(
                    existing.auditEntryId &&
                    normalizedAuditId &&
                    existing.auditEntryId !== normalizedAuditId
                );
                const hasConflictingExecutorId = Boolean(
                    existing.executorId &&
                    normalizedExecutorId &&
                    existing.executorId !== normalizedExecutorId
                );

                if (isExpired || hasConflictingAuditId || hasConflictingExecutorId) {
                    existing = null;
                }
            }
        }

        const botClient = client || guild?.client || null;
        const botUserId = botClient?.user?.id || null;

        const trust = evaluateActorTrust({
            guild,
            client: botClient,
            antinukeData,
            moduleKey,
            executorId: normalizedExecutorId || existing?.executorId || null,
            targetId: normalizedTargetId
        });

        const isProtectRoleTarget = Boolean(
            isProtectRole ||
            (
                antinukeData?.protectRole &&
                normalizedTargetId &&
                normalizedTargetId === String(antinukeData.protectRole) &&
                (moduleKey === 'antiRoleUpdate' || moduleKey === 'antiRoleDelete')
            )
        );

        const isBotSelfTarget = Boolean(
            botUserId &&
            normalizedTargetId &&
            normalizedTargetId === String(botUserId) &&
            (moduleKey === 'antiKick' || moduleKey === 'antiBan')
        );

        const allowUnattributedRecovery = Boolean(isProtectRoleTarget || isRaidIncident);

        const isModuleEnabled = Boolean(
            antinukeData?.enabled &&
            moduleKey &&
            (isProtectRoleTarget || isBotSelfTarget || !antinukeData?.disabledEvents?.includes(moduleKey))
        );

        let decision = 'defer_unknown';
        if (!isModuleEnabled) {
            decision = 'disabled';
        } else if (trust.trustState === 'trusted') {
            decision = 'allow';
        } else if (trust.trustState === 'untrusted') {
            decision = 'enforce';
        } else {
            decision = 'defer_unknown';
        }

        if (existing) {
            existing.deliveries += 1;
            existing.updatedAt = now;
            if (!existing.actionType && actionType != null) existing.actionType = actionType;
            if (!existing.executorId && normalizedExecutorId) existing.executorId = normalizedExecutorId;
            if (!existing.auditEntryId && normalizedAuditId) {
                existing.auditEntryId = normalizedAuditId;
            }
            if (allowUnattributedRecovery) {
                existing.allowUnattributedRecovery = true;
            }
            existing.trustState = trust.trustState;
            existing.trustReason = trust.reason;
            existing.decision = decision;
            if (auditIndexKey) {
                this.incidentsByAudit.set(auditIndexKey, existing);
            }
            this._recordHistory(existing);
            return existing;
        }

        const incidentId = `${baseKey}:${normalizedAuditId || now}`;
        const incident = {
            incidentId,
            key: incidentId,
            baseKey,
            guildId,
            actionType,
            moduleKey,
            targetId: normalizedTargetId,
            executorId: normalizedExecutorId,
            auditEntryId: normalizedAuditId,
            trustState: trust.trustState,
            trustReason: trust.reason,
            decision,
            allowUnattributedRecovery,
            createdAt: now,
            updatedAt: now,
            deliveries: 1,
            enforcement: {
                status: 'idle',
                actionTaken: null,
                promise: null,
                attempts: 0
            },
            recovery: {
                status: 'idle',
                result: null,
                promise: null,
                attempts: 0
            },
            circuitBreakerRecorded: false
        };

        this.incidents.set(baseKey, incident);
        if (auditIndexKey) {
            this.incidentsByAudit.set(auditIndexKey, incident);
        }
        this.sweep(now);
        this._recordHistory(incident);
        return incident;
    }

    /**
     * Coordinate punishment execution for a given guild & executor, shared across duplicate deliveries
     * and concurrent burst incidents, without suppressing retries when an early attempt fails.
     *
     * @param {object} params
     * @param {string} params.guildId
     * @param {string} params.executorId
     * @param {object | null} [params.incident]
     * @param {boolean} [params.forceReexecute]
     * @param {() => Promise<string>} params.executeFn
     * @returns {Promise<string>}
     */
    async executePunishment({ guildId, executorId, incident = null, forceReexecute = false, executeFn }) {
        if (!guildId || !executorId || typeof executeFn !== 'function') {
            return 'No Action';
        }

        if (incident && incident.decision !== 'enforce') {
            return 'No Action';
        }

        // 1. Check incident-level enforcement state first
        if (incident) {
            if (incident.enforcement.status === 'in_progress' && incident.enforcement.promise) {
                return await incident.enforcement.promise;
            }
            if (incident.enforcement.status === 'succeeded' && incident.enforcement.actionTaken) {
                return incident.enforcement.actionTaken;
            }
        }

        // 2. Check guild+executor level state across burst incidents
        const now = Date.now();
        const execKey = `${guildId}:executor:${executorId}`;
        let execState = this.executorStates.get(execKey);

        if (execState && (now - execState.updatedAt) <= this.executorWindowMs) {
            if (execState.status === 'in_progress' && execState.promise) {
                const sharedOutcome = await execState.promise;
                if (incident && isVerifiedEnforcementOutcome(sharedOutcome)) {
                    incident.enforcement.status = 'succeeded';
                    incident.enforcement.actionTaken = sharedOutcome;
                    this._recordHistory(incident);
                }
                return sharedOutcome;
            }
            if (!forceReexecute && execState.status === 'succeeded' && execState.actionTaken) {
                if (incident) {
                    incident.enforcement.status = 'succeeded';
                    incident.enforcement.actionTaken = execState.actionTaken;
                    this._recordHistory(incident);
                }
                return execState.actionTaken;
            }
        }

        // 3. Execute punishment and record verified outcome (allowing retry if it fails)
        if (!execState) {
            execState = {
                status: 'idle',
                actionTaken: null,
                promise: null,
                updatedAt: now,
                attempts: 0
            };
            this.executorStates.set(execKey, execState);
        }

        execState.status = 'in_progress';
        execState.attempts += 1;
        execState.updatedAt = now;

        if (incident) {
            incident.enforcement.status = 'in_progress';
            incident.enforcement.attempts += 1;
            incident.updatedAt = now;
        }

        const runPromise = (async () => {
            try {
                const outcome = await executeFn();
                const verified = isVerifiedEnforcementOutcome(outcome);
                execState.updatedAt = Date.now();

                if (verified) {
                    execState.status = 'succeeded';
                    execState.actionTaken = outcome;
                    if (incident) {
                        incident.enforcement.status = 'succeeded';
                        incident.enforcement.actionTaken = outcome;
                        incident.updatedAt = execState.updatedAt;
                        this._recordHistory(incident);
                    }
                    return outcome;
                } else {
                    // Failed or no-op early attempt must NOT suppress a subsequent retry or fallback
                    execState.status = 'failed';
                    execState.actionTaken = null;
                    this.executorStates.delete(execKey);
                    if (incident) {
                        incident.enforcement.status = 'failed';
                        incident.enforcement.actionTaken = null;
                        incident.updatedAt = execState.updatedAt;
                        this._recordHistory(incident);
                    }
                    return outcome || 'No Action';
                }
            } catch {
                execState.status = 'failed';
                execState.actionTaken = null;
                this.executorStates.delete(execKey);
                if (incident) {
                    incident.enforcement.status = 'failed';
                    incident.enforcement.actionTaken = null;
                    incident.updatedAt = Date.now();
                    this._recordHistory(incident);
                }
                return 'No Action';
            } finally {
                execState.promise = null;
                if (incident) {
                    incident.enforcement.promise = null;
                }
                if (this.executorStates.size > this.maxExecutorStates) {
                    this.sweep(Date.now());
                }
            }
        })();

        execState.promise = runPromise;
        if (incident) {
            incident.enforcement.promise = runPromise;
        }

        return await runPromise;
    }

    /**
     * Coordinate resource recovery for an incident so raw and standard handlers do not duplicate recovery,
     * while allowing retry if an early recovery attempt fails.
     *
     * @template T
     * @param {object | null} incident
     * @param {() => Promise<T>} recoveryFn
     * @param {{ allowAuthorizedUnattributed?: boolean }} [options={}]
     * @returns {Promise<T | boolean>}
     */
    async executeRecovery(incident, recoveryFn, options = {}) {
        if (typeof recoveryFn !== 'function') return false;
        if (!incident) return await recoveryFn();
        if (incident.decision === 'allow' || incident.decision === 'disabled' || incident.trustState === 'trusted') {
            return false;
        }
        const canRecover = incident.decision === 'enforce' || (
            incident.decision === 'defer_unknown' &&
            Boolean(options?.allowAuthorizedUnattributed || incident.allowUnattributedRecovery)
        );
        if (!canRecover) return false;

        if (incident.recovery.status === 'in_progress' && incident.recovery.promise) {
            return await incident.recovery.promise;
        }
        if (incident.recovery.status === 'succeeded') {
            return incident.recovery.result;
        }

        incident.recovery.status = 'in_progress';
        incident.recovery.attempts += 1;
        incident.updatedAt = Date.now();

        const recPromise = (async () => {
            try {
                const result = await recoveryFn();
                if (result) {
                    incident.recovery.status = 'succeeded';
                    incident.recovery.result = result;
                    incident.updatedAt = Date.now();
                    this._recordHistory(incident);
                    return result;
                } else {
                    incident.recovery.status = 'failed';
                    incident.recovery.result = false;
                    incident.updatedAt = Date.now();
                    this._recordHistory(incident);
                    return false;
                }
            } catch {
                incident.recovery.status = 'failed';
                incident.recovery.result = false;
                incident.updatedAt = Date.now();
                this._recordHistory(incident);
                return false;
            } finally {
                incident.recovery.promise = null;
            }
        })();

        incident.recovery.promise = recPromise;
        return await recPromise;
    }

    /**
     * Claim Circuit Breaker recording once per distinct incident.
     * @param {object | null} incident
     * @returns {boolean} True if this caller should record the incident in circuitBreaker
     */
    claimCircuitBreaker(incident) {
        if (!incident || incident.decision !== 'enforce') return false;
        if (incident.circuitBreakerRecorded) return false;
        incident.circuitBreakerRecorded = true;
        incident.updatedAt = Date.now();
        this._recordHistory(incident);
        return true;
    }
}

export const incidentCoordinator = new IncidentCoordinator();
