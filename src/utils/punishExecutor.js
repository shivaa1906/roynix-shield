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
        // 2. 0ms in-memory member lookup (skips slow HTTP fetch if already in Gateway cache)
        const executorMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);

        if (executorMember) {
            switch (punishment) {
                case 'kick':
                    if (executorMember.kickable) {
                        await executorMember.kick(reason);
                        actionTaken = 'Kicked';
                    }
                    break;
                case 'ban':
                default:
                    if (executorMember.bannable) {
                        await executorMember.ban({ reason });
                        actionTaken = 'Banned';
                    } else if (executorMember.manageable) {
                        await executorMember.roles.set([]);
                        await executorMember.timeout(1000 * 60 * 60 * 24 * 26, reason);
                        actionTaken = 'Roles Removed (Fallback)';
                    }
                    break;
            }
        } else if (punishment === 'ban') {
            // Member left server after rogue action; ban User ID directly via REST ban
            await guild.bans.create(executor.id, { reason }).catch(() => null);
            actionTaken = 'Banned';
        }
    } catch {}

    return actionTaken || 'No Action';
}
