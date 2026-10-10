import { AuditLogEvent, EmbedBuilder, Routes } from 'discord.js';
import emojis from '../config/emojis.js';
import { getAuditExecutor } from '../utils/getExecutor.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { evaluateActorTrust } from '../utils/securityPolicy.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';

/**
 * Delete an offending webhook by ID using available Discord.js channel, guild, message, or REST methods.
 * @param {any} message
 * @param {import('discord.js').Guild} guild
 * @param {any} client
 * @param {string} webhookId
 * @param {string} reason
 * @returns {Promise<boolean>}
 */
async function deleteOffendingWebhook(message, guild, client, webhookId, reason) {
  if (!webhookId) return false;

  // 1. Direct message.fetchWebhook() or client.fetchWebhook(webhookId) if supported
  if (typeof message?.fetchWebhook === 'function') {
    const wh = await Promise.resolve(message.fetchWebhook()).catch(() => null);
    if (wh && typeof wh.delete === 'function') {
      const ok = await Promise.resolve(wh.delete(reason))
        .then((res) => res !== null && res !== false)
        .catch(() => false);
      if (ok) return true;
    }
  }

  if (typeof client?.fetchWebhook === 'function') {
    const wh = await Promise.resolve(client.fetchWebhook(webhookId)).catch(() => null);
    if (wh && typeof wh.delete === 'function') {
      const ok = await Promise.resolve(wh.delete(reason))
        .then((res) => res !== null && res !== false)
        .catch(() => false);
      if (ok) return true;
    }
  }

  // 2. Channel webhooks collection
  if (typeof message?.channel?.fetchWebhooks === 'function') {
    const hooks = await Promise.resolve(message.channel.fetchWebhooks()).catch(() => null);
    const hook = hooks?.get?.(webhookId) || (Array.isArray(hooks) ? hooks.find((h) => h?.id === webhookId) : null);
    if (hook && typeof hook.delete === 'function') {
      const ok = await Promise.resolve(hook.delete(reason))
        .then((res) => res !== null && res !== false)
        .catch(() => false);
      if (ok) return true;
    }
  }

  // 3. Guild webhooks collection
  if (typeof guild?.fetchWebhooks === 'function') {
    const hooks = await Promise.resolve(guild.fetchWebhooks()).catch(() => null);
    const hook = hooks?.get?.(webhookId) || (Array.isArray(hooks) ? hooks.find((h) => h?.id === webhookId) : null);
    if (hook && typeof hook.delete === 'function') {
      const ok = await Promise.resolve(hook.delete(reason))
        .then((res) => res !== null && res !== false)
        .catch(() => false);
      if (ok) return true;
    }
  }

  // 4. Direct REST webhook delete fallback
  if (typeof client?.rest?.delete === 'function') {
    const ok = await Promise.resolve(client.rest.delete(Routes.webhook(webhookId), { reason }))
      .then((res) => res !== null && res !== false)
      .catch(() => false);
    if (ok) return true;
  }

  return false;
}

/**
 * Bound in-memory tracker size and evict expired keys.
 * @param {Map<string, Array<any>>} tracker
 * @param {number} [now]
 * @param {number} [windowMs]
 * @param {number} [maxEntries]
 */
export function sweepTracker(tracker, now = Date.now(), windowMs = 10000, maxEntries = 1000) {
  if (!tracker) return;
  const shouldSweepAll = tracker.size > maxEntries || tracker.size > 250 || (now - (tracker._lastSweepAt || 0)) >= windowMs;
  if (!shouldSweepAll) return;
  tracker._lastSweepAt = now;

  for (const [key, list] of tracker.entries()) {
    if (!Array.isArray(list)) {
      tracker.delete(key);
      continue;
    }
    const filtered = list.filter((item) => {
      const ts = typeof item === 'number' ? item : item?.ts;
      return typeof ts === 'number' && (now - ts) < windowMs;
    });
    if (filtered.length === 0) {
      tracker.delete(key);
    } else {
      tracker.set(key, filtered);
    }
  }

  while (tracker.size > maxEntries) {
    const oldestKey = tracker.keys().next().value;
    if (oldestKey === undefined) break;
    tracker.delete(oldestKey);
  }
}

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client
   */
  async execute(client) {
    client.on('messageCreate', async (message) => {
      if (!message?.guild || !message?.author) return;
      const guild = message.guild;
      const event = 'antiPing';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const punishment = antinukeData?.punishment || 'ban';
      const now = Date.now();
      const mentionCount = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0);
      const isEveryonePing = Boolean(message.mentions?.everyone);
      const webhookId = message.webhookId ? String(message.webhookId) : null;

      // =========================================================================
      // PATH 1: Webhook Message Handling (never treat webhookId as a GuildMember)
      // =========================================================================
      if (webhookId) {
        if (!client.botMessageSpamTracker) client.botMessageSpamTracker = new Map();
        sweepTracker(client.botMessageSpamTracker, now, 3000);

        const spamKey = `${guild.id}_webhook_${webhookId}`;
        let timestamps = (client.botMessageSpamTracker.get(spamKey) || []).filter((t) => now - t < 3000);
        timestamps.push(now);
        client.botMessageSpamTracker.set(spamKey, timestamps);

        const isWebhookSpamBurst = timestamps.length >= 4;
        const isWebhookMassPing = isEveryonePing || mentionCount >= 4;

        if (!isWebhookMassPing && !isWebhookSpamBurst) return;

        // Attribute the webhook to its creator/updater if available
        const creator = await getAuditExecutor(guild, AuditLogEvent.WebhookCreate, webhookId, client, { retries: 1, retryDelayMs: 50, wsWaitMs: 10 })
          || await getAuditExecutor(guild, AuditLogEvent.WebhookUpdate, webhookId, client, { retries: 0, wsWaitMs: 10 });

        const creatorTrust = evaluateActorTrust({
          guild,
          client,
          antinukeData,
          moduleKey: event,
          executorId: creator?.id || null
        });
        const webhookModuleTrust = evaluateActorTrust({
          guild,
          client,
          antinukeData,
          moduleKey: 'antiWebhookUpdate',
          executorId: creator?.id || null
        });

        // If the webhook was created by a trusted owner/whitelisted actor and is not flooding, allow it
        if ((creatorTrust.isExempt || webhookModuleTrust.isExempt) && !isWebhookSpamBurst) {
          return;
        }

        const reason = isWebhookSpamBurst
          ? 'Roynix Antinuke System | Webhook Message Spam Raid'
          : 'Roynix Antinuke System | Unauthorized Webhook Mass Mention';

        const coordinator = client.incidentCoordinator || incidentCoordinator;
        const incident = coordinator.coordinateIncident({
          guild,
          client,
          antinukeData,
          actionType: AuditLogEvent.WebhookCreate,
          moduleKey: event,
          targetId: webhookId,
          executorId: creator?.id || `webhook:${webhookId}`,
          timestamp: now
        });

        const deleteWebhookPromise = coordinator.executeRecovery(incident, () =>
          deleteOffendingWebhook(message, guild, client, webhookId, reason)
        );
        const deleteMsgPromise = Promise.resolve(message.delete?.()).catch(() => null);

        const punishCreatorPromise = (creator?.id && creatorTrust.trustState === 'untrusted' && !webhookModuleTrust.isExempt)
          ? punishExecutor(
              guild,
              creator,
              punishment,
              reason,
              client,
              `${guild.id}_antiPing_whcreator_${creator.id}`,
              { antinukeData, moduleKey: event, targetId: webhookId }
            )
          : Promise.resolve(null);

        const [webhookDeleted, , creatorAction] = await Promise.all([
          deleteWebhookPromise,
          deleteMsgPromise,
          punishCreatorPromise
        ]);

        if (isWebhookSpamBurst && message.channel && typeof message.channel.bulkDelete === 'function') {
          message.channel.bulkDelete(6).catch(() => null);
        }

        const webhookStatus = webhookDeleted ? 'Webhook Deleted' : 'Webhook Delete Failed';
        const actionTaken = creatorAction && creatorAction !== 'No Action'
          ? `${webhookStatus}, Inviter ${creatorAction}`
          : webhookStatus;

        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle('Anti-Ping Webhook Shield Triggered')
              .setDescription(
                `${emojis.user} **Webhook**: \`${message.author.username || webhookId}\` (${webhookId})\n` +
                `${emojis.user} **Creator**: ${creator?.id ? `<@${creator.id}> (${creator.tag || creator.id})` : 'Unknown (Unresolved)'}\n` +
                `${emojis.action} **Violation**: ${isWebhookSpamBurst ? 'Rapid Webhook Flooding (Raid)' : 'Webhook Mass Mention / @everyone'}\n` +
                `${emojis.action} **Action Taken**: ${actionTaken}`
              )
              .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
        return;
      }

      // =========================================================================
      // PATH 2: Guild Member / Bot Message Handling
      // =========================================================================
      const executor = message.author;
      const trust = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: event,
        executorId: executor.id
      });
      if (trust.isExempt) return;

      let isBotSpamBurst = false;
      let isMassPing = false;

      if (executor.bot) {
        if (!client.botMessageSpamTracker) client.botMessageSpamTracker = new Map();
        sweepTracker(client.botMessageSpamTracker, now, 3000);

        const spamKey = `${guild.id}_${executor.id}`;
        let timestamps = (client.botMessageSpamTracker.get(spamKey) || []).filter((t) => now - t < 3000);
        timestamps.push(now);
        client.botMessageSpamTracker.set(spamKey, timestamps);

        if (timestamps.length >= 4) {
          isBotSpamBurst = true;
        }
        isMassPing = isEveryonePing || mentionCount >= 5;
      } else {
        // Human member: prevent false-positive permanent bans on single normal messages with 4-9 mentions
        // Trigger immediately on actual @everyone/@here ping or extreme single-message mention bomb (>= 10),
        // or on a repeated mass-mention burst (>= 3 messages with >= 4 mentions or >= 12 mentions within 10s).
        if (isEveryonePing || mentionCount >= 10) {
          isMassPing = true;
        } else if (mentionCount >= 4) {
          if (!client.memberPingTracker) client.memberPingTracker = new Map();
          sweepTracker(client.memberPingTracker, now, 10000);

          const memberKey = `${guild.id}_${executor.id}`;
          const recent = (client.memberPingTracker.get(memberKey) || []).filter((item) => now - item.ts < 10000);
          recent.push({ ts: now, count: mentionCount });
          client.memberPingTracker.set(memberKey, recent);

          const totalMentionsInWindow = recent.reduce((sum, item) => sum + item.count, 0);
          if (recent.length >= 3 || totalMentionsInWindow >= 12) {
            isMassPing = true;
          }
        }
      }

      if (isMassPing || isBotSpamBurst) {
        const reason = isBotSpamBurst
          ? 'Roynix Antinuke System | Rogue Bot Message Spam Raid'
          : 'Roynix Antinuke System | Unauthorized Mass Mention';

        const trackingKey = `${guild.id}_antiPing_${executor.id}_${Math.floor(now / 5000)}`;
        const [actionTaken] = await Promise.all([
          punishExecutor(guild, executor, punishment, reason, client, trackingKey, {
            antinukeData,
            moduleKey: event,
            targetId: message.channel?.id || null
          }),
          Promise.resolve(message.delete?.()).catch(() => null)
        ]);

        if (isBotSpamBurst && message.channel && typeof message.channel.bulkDelete === 'function') {
          message.channel.bulkDelete(6).catch(() => null);
        }

        const logChannelId = antinukeData.logsChannel;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(client.color)
              .setTitle(isBotSpamBurst ? 'Anti-Bot Spam Shield Triggered' : 'Anti-Ping Triggered')
              .setDescription(
                `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.username || executor.id})\n` +
                `${emojis.action} **Violation**: ${isBotSpamBurst ? 'Rapid Message Flooding (Raid)' : 'Mass Mention / @everyone'}\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}`
              )
              .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      }
    });
  }
};
