/**
 * Ultra-low latency executor punishment resolver (0ms in-memory cache check & action)
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').User} executor 
 * @param {'ban'|'kick'} punishment 
 * @param {string} reason 
 * @param {import('../base/Roynix.js').Roynix} client 
 * @param {string} [trackingKey] 
 * @returns {Promise<string>}
 */
export async function punishExecutor(guild, executor, punishment = 'ban', reason = 'Roynix Antinuke System', client = null, trackingKey = null) {
    if (!guild || !executor) return 'No Action';

    // 1. Check if already punished by 0ms WebSocket fast-path engine
    if (trackingKey && client?.antinukeActionTracker?.has(trackingKey)) {
        const tracked = client.antinukeActionTracker.get(trackingKey);
        return tracked?.actionTaken || (punishment === 'kick' ? 'Kicked' : 'Banned');
    }

    if (trackingKey && client?.antinukeActionTracker) {
        client.antinukeActionTracker.set(trackingKey, {
            actionTaken: punishment === 'kick' ? 'Kicked' : 'Banned',
            timestamp: Date.now()
        });
        setTimeout(() => client.antinukeActionTracker.delete(trackingKey), 8000).unref?.();
    }

    let actionTaken = '';
    try {
        const executorMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);

        // Emergency role quarantine in parallel: immediately strip dangerous permissions so in-flight attacks get 403 Forbidden
        const stripPromise = (executorMember && executorMember.manageable)
            ? executorMember.roles.set([], `${reason} | Role Quarantine`).catch(() => null)
            : Promise.resolve();

        if (punishment === 'kick') {
            const kickPromise = (executorMember && executorMember.kickable)
                ? executorMember.kick(reason).catch(() => null)
                : Promise.resolve();
            await Promise.allSettled([stripPromise, kickPromise]);
            actionTaken = executorMember?.kickable ? 'Kicked' : 'Roles Stripped';
        } else {
            // Ban mode: Dual-Action (Emergency Role Strip + Direct Ban Dispatch with message purge)
            const banPromise = guild.bans.create(executor.id, { reason, deleteMessageSeconds: 604800 }).catch(() => null);
            await Promise.allSettled([stripPromise, banPromise]);
            actionTaken = 'Banned';
        }
    } catch {}

    return actionTaken || 'No Action';
}
