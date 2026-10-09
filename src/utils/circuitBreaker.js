import { EmbedBuilder } from 'discord.js';
import { isBotOwner } from './isBotOwner.js';
import emojis from '../config/emojis.js';

class CircuitBreaker {
    constructor() {
        /** @type {Map<string, number[]>} guildId -> incident timestamps */
        this.incidentTracker = new Map();
        /** @type {Map<string, { active: boolean, until: number }>} guildId -> lockdown state */
        this.lockdownState = new Map();
    }

    /**
     * Check if guild is currently in emergency lockdown
     * @param {string} guildId 
     * @returns {boolean}
     */
    isLockedDown(guildId) {
        const state = this.lockdownState.get(guildId);
        if (!state || !state.active) return false;
        if (Date.now() > state.until) {
            this.lockdownState.delete(guildId);
            return false;
        }
        return true;
    }

    /**
     * Record a destructive incident and trip the circuit breaker if a burst attack is detected
     * @param {import('discord.js').Guild} guild 
     * @param {import('../base/Roynix.js').Roynix} client 
     * @param {string} actionName 
     * @param {import('discord.js').User} [executor] 
     */
    async recordIncident(guild, client, actionName, executor = null) {
        if (!guild) return;
        const guildId = guild.id;
        const now = Date.now();

        // 1. Fetch antinuke settings
        const antinukeData = await client.getAntinukeData(guildId);
        if (!antinukeData?.enabled || antinukeData?.disabledEvents?.includes('circuitBreaker')) return;

        // 2. Track incident timestamps in memory
        let timestamps = this.incidentTracker.get(guildId) || [];
        timestamps = timestamps.filter(t => now - t < 2000);
        timestamps.push(now);
        this.incidentTracker.set(guildId, timestamps);

        // Burst threshold: 2 or more destructive attacks within 2 seconds
        if (timestamps.length >= 2 && !this.isLockedDown(guildId)) {
            await this.tripBreaker(guild, client, antinukeData, actionName, executor);
        }
    }

    /**
     * Trip the circuit breaker: trigger emergency lockdown
     * @param {import('discord.js').Guild} guild 
     * @param {import('../base/Roynix.js').Roynix} client 
     * @param {object} antinukeData 
     * @param {string} triggerAction 
     * @param {import('discord.js').User} executor 
     */
    async tripBreaker(guild, client, antinukeData, triggerAction, executor) {
        const guildId = guild.id;
        const lockdownDuration = 60 * 1000; // 60s lockdown window
        this.lockdownState.set(guildId, { active: true, until: Date.now() + lockdownDuration });

        const extraOwners = antinukeData.extraOwners || [];
        const whitelisted = antinukeData.whitelisted || {};

        // Execute parallel containment actions
        const tasks = [];

        // 1. Multi-Bot Quarantine: Instantly strip all roles from all other non-whitelisted bots in parallel
        tasks.push((async () => {
            const botPromises = [];
            let quarantinedBots = 0;
            const bots = guild.members.cache.filter(m => m.user.bot && m.id !== client.user.id);
            for (const [_, botMember] of bots) {
                if (isBotOwner(botMember.id) || extraOwners.includes(botMember.id) || whitelisted[botMember.id]) continue;
                if (botMember.manageable && botMember.roles.cache.size > 1) {
                    quarantinedBots++;
                    botPromises.push(botMember.roles.set([], 'Roynix Circuit Breaker | Emergency Coordinated Raid Lockdown').catch(() => null));
                }
            }
            await Promise.all(botPromises);
            return quarantinedBots;
        })());

        // 2. Elevate verification level to VERY_HIGH to block alt accounts and automated raids
        tasks.push((async () => {
            try {
                if (guild.verificationLevel < 4) {
                    await guild.setVerificationLevel(4, 'Roynix Circuit Breaker | Raid Burst Lockdown').catch(() => null);
                    return true;
                }
            } catch {}
            return false;
        })());

        // 3. Purge recent webhooks (created in last 10 minutes) in parallel
        tasks.push((async () => {
            const whPromises = [];
            let purgedWebhooks = 0;
            try {
                const webhooks = await guild.fetchWebhooks().catch(() => null);
                if (webhooks) {
                    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
                    for (const [_, wh] of webhooks) {
                        if (wh.createdTimestamp > tenMinutesAgo) {
                            purgedWebhooks++;
                            whPromises.push(wh.delete('Roynix Circuit Breaker | Unauthorized Webhook Purge').catch(() => null));
                        }
                    }
                }
                await Promise.all(whPromises);
            } catch {}
            return purgedWebhooks;
        })());

        const [quarantinedBots, verificationElevated, purgedWebhooks] = await Promise.all(tasks);

        // 4. Send High-Priority Incident Notification
        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
            const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 CIRCUIT BREAKER TRIPPED: EMERGENCY SERVER LOCKDOWN')
                    .setDescription(
                        `**Rapid Coordinated Raid Detected!**\n` +
                        `Multiple destructive moderation actions occurred within 1 second.\n\n` +
                        `__**Emergency Containment Measures Engaged:**__\n` +
                        `> ${emojis.shield} **Trigger Event**: \`${triggerAction}\`\n` +
                        `> ${emojis.user} **Attacker**: ${executor ? `<@${executor.id}> (${executor.tag})` : 'Unknown Entity'}\n` +
                        `> ${emojis.bot || '🤖'} **Unwhitelisted Bots Quarantined**: \`${quarantinedBots}\`\n` +
                        `> ${emojis.tick} **Verification Level**: \`VERY HIGH\` (Anti-Alt Raid Shield)\n` +
                        `> ${emojis.trash} **Rogue Webhooks Purged**: \`${purgedWebhooks}\`\n\n` +
                        `*The server is currently protected under lockdown. All attacker attempts are quarantined.*`
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] }).catch(() => null);
            }
        }
    }
}

export const circuitBreaker = new CircuitBreaker();
