import { PermissionFlagsBits } from 'discord.js';
import { evaluateActorTrust, isValidModuleKey } from './securityPolicy.js';
import { incidentCoordinator, isVerifiedEnforcementOutcome } from './incidentCoordinator.js';

const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;

const ROLE_CONTAINMENT_OUTCOMES = new Set([
    'Roles Stripped',
    'Roles Stripped (Fallback)',
    'Roles Stripped & Timed Out (Fallback)',
    'Timed Out (Fallback)'
]);

const DANGEROUS_PERMISSIONS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.MentionEveryone
];

/**
 * Normalize a role collection/map/array into an array of role objects.
 * @param {any} cache
 * @returns {Array<any>}
 */
function getRoleList(cache) {
    if (!cache) return [];
    if (Array.isArray(cache)) return cache;
    if (typeof cache.values === 'function') return Array.from(cache.values());
    return [];
}

/**
 * Check whether a role has any dangerous permissions or non-zero bitfield.
 * @param {any} role
 * @returns {boolean}
 */
function roleHasPermissionsToClear(role) {
    if (!role?.permissions) return true;
    if (typeof role.permissions.any === 'function') {
        return role.permissions.any(DANGEROUS_PERMISSIONS) || role.permissions.bitfield !== 0n;
    }
    if (typeof role.permissions.has === 'function') {
        return DANGEROUS_PERMISSIONS.some((perm) => role.permissions.has(perm));
    }
    if (typeof role.permissions.bitfield === 'bigint') {
        return role.permissions.bitfield !== 0n;
    }
    return true;
}

/**
 * Determine whether a cached member currently holds removable non-managed roles
 * or un-zeroed editable managed roles that require fresh role containment.
 * @param {import('discord.js').Guild} guild
 * @param {string} executorId
 * @returns {boolean}
 */
export function memberNeedsRoleContainment(guild, executorId) {
    const cachedMember = guild?.members?.cache?.get?.(String(executorId)) || null;
    if (!cachedMember) return false;
    const allRoles = getRoleList(cachedMember.roles?.cache).filter((r) => r && r.id !== guild?.id);
    const hasMutatingCache = typeof cachedMember.roles?.cache?.delete === 'function';
    const strippedSet = cachedMember._strippedRoleRefs;

    const hasEditableNonManaged = allRoles.some(
        (r) => !r.managed && r.editable !== false && (hasMutatingCache || !strippedSet?.has?.(r))
    );
    const hasUnzeroedEditableManaged = allRoles.some(
        (r) => r.managed === true && r.editable !== false && typeof r.setPermissions === 'function' && roleHasPermissionsToClear(r)
    );
    return hasEditableNonManaged || hasUnzeroedEditableManaged;
}

/**
 * Strip removable non-managed roles and zero permissions on editable managed roles
 * according to actual Discord API restrictions.
 *
 * @param {import('discord.js').Guild} guild
 * @param {any} member
 * @param {string} reason
 * @returns {Promise<{ rolesStripped: boolean, managedZeroed: boolean }>}
 */
export async function stripMemberRolesAndManagedPerms(guild, member, reason) {
    let rolesStripped = false;
    let managedZeroed = false;
    if (!member) return { rolesStripped, managedZeroed };

    const allRoles = getRoleList(member.roles?.cache).filter((r) => r && r.id !== guild?.id);
    const managedRoles = allRoles.filter((r) => r.managed === true);
    const nonManagedRoles = allRoles.filter((r) => !r.managed);
    const editableNonManaged = nonManagedRoles.filter((r) => r.editable !== false);

    // 1. Handle non-managed roles
    if (managedRoles.length === 0 && member.manageable && typeof member.roles?.set === 'function') {
        await member.roles.set([], `${reason} | Emergency Role Strip`)
            .then((res) => {
                if (res !== null && res !== false) rolesStripped = true;
            })
            .catch(() => null);
    } else if (editableNonManaged.length > 0 && typeof member.roles?.remove === 'function') {
        await member.roles.remove(
            editableNonManaged.map((r) => r.id || r),
            `${reason} | Emergency Role Strip`
        )
            .then((res) => {
                if (res !== null && res !== false) rolesStripped = true;
            })
            .catch(() => null);
    } else if (editableNonManaged.length > 0 && member.manageable && typeof member.roles?.set === 'function') {
        const keepIds = allRoles
            .filter((r) => r.managed === true || r.editable === false)
            .map((r) => r.id);
        await member.roles.set(keepIds, `${reason} | Emergency Role Strip`)
            .then((res) => {
                if (res !== null && res !== false) rolesStripped = true;
            })
            .catch(() => null);
    }

    if (rolesStripped) {
        if (typeof member.roles?.cache?.delete === 'function') {
            for (const r of editableNonManaged) {
                if (r?.id) member.roles.cache.delete(r.id);
            }
        } else {
            if (!member._strippedRoleRefs) member._strippedRoleRefs = new WeakSet();
            for (const r of editableNonManaged) {
                if (r && typeof r === 'object') member._strippedRoleRefs.add(r);
            }
        }
    }

    // 2. Handle managed integration roles (Discord forbids removing managed roles; zero their permissions instead)
    const editableManaged = managedRoles.filter(
        (r) => r.editable !== false && typeof r.setPermissions === 'function' && roleHasPermissionsToClear(r)
    );
    if (editableManaged.length > 0) {
        const zeroResults = await Promise.all(
            editableManaged.map((role) =>
                Promise.resolve(role.setPermissions(0n, `${reason} | Managed Role Permission Zeroing`))
                    .then((res) => {
                        const ok = res !== null && res !== false;
                        if (ok && role.permissions && typeof role.permissions === 'object' && 'bitfield' in role.permissions) {
                            try {
                                role.permissions.bitfield = 0n;
                            } catch {}
                        }
                        return ok;
                    })
                    .catch(() => false)
            )
        );
        if (zeroResults.some(Boolean)) {
            managedZeroed = true;
        }
    }

    return { rolesStripped, managedZeroed };
}

/**
 * Apply a 28-day fallback timeout if the member is eligible for communication timeout.
 * @param {any} member
 * @param {string} reason
 * @returns {Promise<boolean>}
 */
async function applyFallbackTimeout(member, reason) {
    if (!member || member.user?.bot) return false;
    if (member.moderatable === false) return false;
    if (typeof member.timeout !== 'function') return false;

    return await Promise.resolve(member.timeout(TWENTY_EIGHT_DAYS_MS, `${reason} | Fallback Quarantine Timeout`))
        .then((res) => res !== null && res !== false)
        .catch(() => false);
}

/**
 * Coordinated executor punishment resolver with shared trust-policy enforcement,
 * eligibility-aware fallback containment, managed-role permission zeroing,
 * and verified outcome tracking (failed early attempts never suppress retries).
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User | { id: string, auditEntryId?: string }} executor
 * @param {'ban'|'kick'|'strip'} [punishment='ban']
 * @param {string} [reason='Roynix Antinuke System']
 * @param {import('../base/Roynix.js').Roynix} [client=null]
 * @param {string | null} [trackingKey=null]
 * @param {{ incident?: object | null, antinukeData?: object | null, moduleKey?: string | null, targetId?: string | null }} [options={}]
 * @returns {Promise<string>}
 */
export async function punishExecutor(
    guild,
    executor,
    punishment = 'ban',
    reason = 'Roynix Antinuke System',
    client = null,
    trackingKey = null,
    options = {}
) {
    if (!guild || !executor?.id) return 'No Action';

    const botClient = client || guild.client || null;
    let antinukeData = options.antinukeData || botClient?.antinukeCache?.get?.(guild.id) || null;
    if (!antinukeData && typeof botClient?.getAntinukeData === 'function') {
        try {
            antinukeData = await botClient.getAntinukeData(guild.id);
        } catch {
            antinukeData = null;
        }
    }

    let resolvedModuleKey = isValidModuleKey(options.moduleKey) ? options.moduleKey : null;
    if (!resolvedModuleKey && typeof trackingKey === 'string' && guild.id && trackingKey.startsWith(`${guild.id}_`)) {
        const suffix = trackingKey.slice(String(guild.id).length + 1);
        const firstSegment = suffix.split('_')[0];
        if (isValidModuleKey(firstSegment)) {
            resolvedModuleKey = firstSegment;
        }
    }

    // 1. Authoritative trust-policy check before any punishment
    const trust = evaluateActorTrust({
        guild,
        client: botClient,
        antinukeData,
        moduleKey: resolvedModuleKey,
        executorId: String(executor.id),
        targetId: options.targetId || null
    });

    if (trust.trustState !== 'untrusted') {
        return 'No Action';
    }

    const coordinator = botClient?.incidentCoordinator || incidentCoordinator;
    const executorKey = `${guild.id}_punished_${executor.id}`;
    const isSameIncidentAlreadySucceeded = Boolean(
        options.incident?.enforcement?.status === 'succeeded' &&
        options.incident?.enforcement?.actionTaken
    );

    let forceReexecute = false;
    if (!isSameIncidentAlreadySucceeded) {
        const execState = coordinator?.executorStates?.get?.(`${guild.id}:executor:${executor.id}`);
        if (execState?.status === 'succeeded' && ROLE_CONTAINMENT_OUTCOMES.has(execState.actionTaken)) {
            if (memberNeedsRoleContainment(guild, String(executor.id))) {
                forceReexecute = true;
            }
        }
    }

    // Check legacy antinukeActionTracker only if it holds a verified outcome
    if (botClient?.antinukeActionTracker) {
        if (trackingKey && botClient.antinukeActionTracker.has(trackingKey)) {
            const tracked = botClient.antinukeActionTracker.get(trackingKey);
            if (isVerifiedEnforcementOutcome(tracked?.actionTaken)) {
                return tracked.actionTaken;
            }
            botClient.antinukeActionTracker.delete(trackingKey);
        }
        if (botClient.antinukeActionTracker.has(executorKey)) {
            const tracked = botClient.antinukeActionTracker.get(executorKey);
            if (isVerifiedEnforcementOutcome(tracked?.actionTaken)) {
                const needsFreshStrip = ROLE_CONTAINMENT_OUTCOMES.has(tracked.actionTaken) &&
                    !isSameIncidentAlreadySucceeded &&
                    memberNeedsRoleContainment(guild, String(executor.id));
                if (!needsFreshStrip) {
                    return tracked.actionTaken;
                }
                forceReexecute = true;
            }
            botClient.antinukeActionTracker.delete(executorKey);
        }
    }

    const outcome = await coordinator.executePunishment({
        guildId: guild.id,
        executorId: String(executor.id),
        incident: options.incident || null,
        forceReexecute,
        executeFn: async () => {
            let actionTaken = '';
            try {
                if (punishment === 'ban') {
                    let banSucceeded = false;
                    let cachedMember = guild.members?.cache?.get?.(executor.id) || null;
                    const canAttemptBan = (!cachedMember || cachedMember.bannable !== false) && typeof guild.bans?.create === 'function';

                    const banPromise = canAttemptBan
                        ? Promise.resolve(guild.bans.create(executor.id, { reason, deleteMessageSeconds: 604800 }))
                            .then((res) => {
                                if (res !== null && res !== false) banSucceeded = true;
                            })
                            .catch(() => null)
                        : Promise.resolve();

                    const initialStripPromise = cachedMember
                        ? stripMemberRolesAndManagedPerms(guild, cachedMember, reason)
                        : Promise.resolve({ rolesStripped: false, managedZeroed: false });

                    const [, initialStrip] = await Promise.all([banPromise, initialStripPromise]);

                    if (banSucceeded) {
                        actionTaken = 'Banned';
                    } else {
                        // Primary ban failed or was blocked by role hierarchy: execute eligibility-aware fallback containment
                        if (!cachedMember && typeof guild.members?.fetch === 'function') {
                            cachedMember = await guild.members.fetch(executor.id).catch(() => null);
                        }
                        const finalStrip = cachedMember && !initialStrip.rolesStripped && !initialStrip.managedZeroed
                            ? await stripMemberRolesAndManagedPerms(guild, cachedMember, reason)
                            : initialStrip;

                        const stripOrZeroSucceeded = Boolean(finalStrip.rolesStripped || finalStrip.managedZeroed);
                        const timedOut = cachedMember ? await applyFallbackTimeout(cachedMember, reason) : false;

                        if (stripOrZeroSucceeded && timedOut) {
                            actionTaken = 'Roles Stripped & Timed Out (Fallback)';
                        } else if (stripOrZeroSucceeded) {
                            actionTaken = 'Roles Stripped';
                        } else if (timedOut) {
                            actionTaken = 'Timed Out (Fallback)';
                        }
                    }
                } else if (punishment === 'strip') {
                    const executorMember = guild.members?.cache?.get?.(executor.id)
                        || await guild.members?.fetch?.(executor.id)?.catch(() => null);
                    if (executorMember) {
                        const { rolesStripped, managedZeroed } = await stripMemberRolesAndManagedPerms(guild, executorMember, reason);
                        if (rolesStripped || managedZeroed) {
                            actionTaken = 'Roles Stripped';
                        } else {
                            const timedOut = await applyFallbackTimeout(executorMember, reason);
                            if (timedOut) {
                                actionTaken = 'Timed Out (Fallback)';
                            }
                        }
                    }
                } else {
                    // Kick mode
                    const executorMember = guild.members?.cache?.get?.(executor.id)
                        || await guild.members?.fetch?.(executor.id)?.catch(() => null);
                    if (executorMember) {
                        let kickSucceeded = false;
                        const stripPromise = stripMemberRolesAndManagedPerms(guild, executorMember, reason);

                        const kickPromise = (executorMember.kickable !== false && typeof executorMember.kick === 'function')
                            ? Promise.resolve(executorMember.kick(reason))
                                .then((res) => {
                                    if (res !== null && res !== false) kickSucceeded = true;
                                })
                                .catch(() => null)
                            : Promise.resolve();

                        const [stripRes] = await Promise.all([stripPromise, kickPromise]);
                        const stripOrZeroSucceeded = Boolean(stripRes.rolesStripped || stripRes.managedZeroed);

                        if (kickSucceeded) {
                            actionTaken = 'Kicked';
                        } else {
                            const timedOut = await applyFallbackTimeout(executorMember, reason);
                            if (stripOrZeroSucceeded && timedOut) {
                                actionTaken = 'Roles Stripped & Timed Out (Fallback)';
                            } else if (stripOrZeroSucceeded) {
                                actionTaken = 'Roles Stripped';
                            } else if (timedOut) {
                                actionTaken = 'Timed Out (Fallback)';
                            }
                        }
                    }
                }
            } catch {}

            return actionTaken || 'No Action';
        }
    });

    if (isVerifiedEnforcementOutcome(outcome) && botClient?.antinukeActionTracker) {
        const record = {
            actionTaken: outcome,
            timestamp: Date.now()
        };
        botClient.antinukeActionTracker.set(executorKey, record);
        setTimeout(() => botClient.antinukeActionTracker.delete(executorKey), 12000).unref?.();
        if (trackingKey) {
            botClient.antinukeActionTracker.set(trackingKey, record);
            setTimeout(() => botClient.antinukeActionTracker.delete(trackingKey), 8000).unref?.();
        }
    }

    return outcome || 'No Action';
}
