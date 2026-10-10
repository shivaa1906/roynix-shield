import {
  AuditLogEvent,
  EmbedBuilder,
  Routes,
} from 'discord.js';
import emojis from '../config/emojis.js';
import { punishExecutor } from '../utils/punishExecutor.js';
import { incidentCoordinator } from '../utils/incidentCoordinator.js';
import { decodeSnowflakeTimestamp } from '../utils/getExecutor.js';
import { circuitBreaker } from '../utils/circuitBreaker.js';

const WEBHOOK_AUDIT_ACTIONS = [
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookDelete,
  AuditLogEvent.WebhookUpdate,
];

function extractWebhookChannelId(entry) {
  if (!entry) return null;
  if (entry.target?.channelId) return String(entry.target.channelId);
  if (entry.target?.channel_id) return String(entry.target.channel_id);
  if (entry.extra?.channel?.id) return String(entry.extra.channel.id);
  if (Array.isArray(entry.changes)) {
    const chChange = entry.changes.find((c) => c?.key === 'channel_id');
    const val = chChange?.new ?? chChange?.old;
    if (val) return String(val);
  }
  return null;
}

function extractWebhookTargetId(entry, fallbackTargetId = null) {
  const id = entry?.target?.id ?? entry?.targetId ?? entry?.target_id ?? fallbackTargetId ?? null;
  return id && id !== 'targetless' && id !== 'any' ? String(id) : null;
}

function toEntriesList(collectionOrArray) {
  if (!collectionOrArray) return [];
  if (Array.isArray(collectionOrArray)) return collectionOrArray;
  if (typeof collectionOrArray.values === 'function') {
    return Array.from(collectionOrArray.values());
  }
  return [];
}

/**
 * Resolves the recent webhook audit log entry for a channel's `webhooksUpdate` event.
 */
async function resolveWebhookAuditEntry(guild, channel, client) {
  const now = Date.now();
  const channelId = String(channel.id);
  let fallbackChannellessCandidate = null;

  if (client?.auditLogCache) {
    const cacheItems = [];
    const legacyDirect = client.auditLogCache.get(guild.id);
    if (legacyDirect) cacheItems.push(legacyDirect);

    for (const item of client.auditLogCache.values()) {
      if (item && item.guildId === guild.id && !cacheItems.includes(item)) {
        cacheItems.push(item);
      }
    }

    const matchingCached = [];
    for (const cached of cacheItems) {
      if (!cached || !WEBHOOK_AUDIT_ACTIONS.includes(cached.action)) continue;
      const ts =
        cached.createdTimestamp ??
        cached.timestamp ??
        decodeSnowflakeTimestamp(cached.auditEntryId || cached.entry?.id) ??
        now;
      if (now - ts > 5000) continue;
      if (cached.ambiguous) {
        return { entry: null, ambiguous: true };
      }

      const rawEntry = cached.entry || {
        id: cached.auditEntryId || null,
        action: cached.action,
        executor: cached.executor,
        target: cached.targetId ? { id: cached.targetId } : null,
        createdTimestamp: ts,
      };
      if (!rawEntry.executor && cached.executor) {
        rawEntry.executor = cached.executor;
      }
      if (!rawEntry.action) {
        rawEntry.action = cached.action;
      }

      const entryChannelId = extractWebhookChannelId(rawEntry);
      if (entryChannelId && entryChannelId !== channelId) continue;

      matchingCached.push({
        entry: rawEntry,
        channelMatched: entryChannelId === channelId,
        targetId: extractWebhookTargetId(rawEntry, cached.targetId),
        createdTimestamp: ts,
      });
    }

    const exactChannelCached = matchingCached.filter((c) => c.channelMatched);
    if (exactChannelCached.length > 0) {
      const distinctExecutors = new Set(
        exactChannelCached.map((c) => c.entry?.executor?.id).filter(Boolean)
      );
      if (distinctExecutors.size > 1) {
        return { entry: null, ambiguous: true };
      }
      return {
        entry: exactChannelCached[0].entry,
        targetId: exactChannelCached[0].targetId,
        ambiguous: false,
      };
    }

    if (matchingCached.length === 1) {
      fallbackChannellessCandidate = matchingCached[0];
    } else if (matchingCached.length > 1) {
      const distinctExecutors = new Set(
        matchingCached.map((c) => c.entry?.executor?.id).filter(Boolean)
      );
      if (distinctExecutors.size > 1) {
        return { entry: null, ambiguous: true };
      }
      fallbackChannellessCandidate = matchingCached[0];
    }
  }

  if (typeof guild.fetchAuditLogs === 'function') {
    const logs = await guild.fetchAuditLogs({ limit: 5 }).catch(() => null);
    const entries = toEntriesList(logs?.entries).filter((e) => {
      if (!e || !WEBHOOK_AUDIT_ACTIONS.includes(e.action)) return false;
      const ts = e.createdTimestamp ?? decodeSnowflakeTimestamp(e.id);
      if (ts && now - ts > 10000) return false;
      return true;
    });

    const exactChannelEntries = entries.filter(
      (e) => extractWebhookChannelId(e) === channelId
    );
    if (exactChannelEntries.length > 0) {
      const distinctExecutors = new Set(
        exactChannelEntries.map((e) => e.executor?.id).filter(Boolean)
      );
      if (distinctExecutors.size > 1) {
        return { entry: null, ambiguous: true };
      }
      const chosen = exactChannelEntries[0];
      return {
        entry: chosen,
        targetId: extractWebhookTargetId(chosen),
        ambiguous: false,
      };
    }

    const channellessEntries = entries.filter(
      (e) => extractWebhookChannelId(e) === null
    );
    if (channellessEntries.length > 0) {
      const distinctExecutors = new Set(
        channellessEntries.map((e) => e.executor?.id).filter(Boolean)
      );
      if (distinctExecutors.size > 1) {
        return { entry: null, ambiguous: true };
      }
      const chosen = channellessEntries[0];
      return {
        entry: chosen,
        targetId: extractWebhookTargetId(chosen),
        ambiguous: false,
      };
    }
  }

  if (fallbackChannellessCandidate) {
    return {
      entry: fallbackChannellessCandidate.entry,
      targetId: fallbackChannellessCandidate.targetId,
      ambiguous: false,
    };
  }

  return { entry: null, targetId: null, ambiguous: false };
}

/**
 * Deletes an unauthorized webhook created or modified by an untrusted actor.
 */
export async function deleteUnauthorizedWebhook(
  guild,
  channel,
  webhookId,
  entry,
  executorId,
  client,
  reason
) {
  if (entry?.target && typeof entry.target.delete === 'function') {
    const deleted = await entry.target
      .delete(reason)
      .then(() => true)
      .catch(() => false);
    if (deleted) return true;
  }

  if (webhookId && typeof client?.fetchWebhook === 'function') {
    const webhook = await client.fetchWebhook(webhookId).catch(() => null);
    if (webhook && typeof webhook.delete === 'function') {
      const deleted = await webhook
        .delete(reason)
        .then(() => true)
        .catch(() => false);
      if (deleted) return true;
    }
  }

  if (typeof channel?.fetchWebhooks === 'function') {
    const webhooks = await channel.fetchWebhooks().catch(() => null);
    const list = toEntriesList(webhooks);
    if (webhookId) {
      const targetWebhook =
        webhooks?.get?.(webhookId) || list.find((w) => w?.id === webhookId);
      if (targetWebhook && typeof targetWebhook.delete === 'function') {
        const deleted = await targetWebhook
          .delete(reason)
          .then(() => true)
          .catch(() => false);
        if (deleted) return true;
      }
    } else if (executorId) {
      const executorWebhooks = list.filter(
        (w) => (w?.owner?.id || w?.user?.id) === String(executorId)
      );
      let anyDeleted = false;
      for (const wh of executorWebhooks) {
        if (typeof wh.delete === 'function') {
          const ok = await wh
            .delete(reason)
            .then(() => true)
            .catch(() => false);
          if (ok) anyDeleted = true;
        }
      }
      if (anyDeleted) return true;
    }
  }

  if (webhookId && typeof guild?.fetchWebhooks === 'function') {
    const webhooks = await guild.fetchWebhooks().catch(() => null);
    const list = toEntriesList(webhooks);
    const targetWebhook =
      webhooks?.get?.(webhookId) || list.find((w) => w?.id === webhookId);
    if (targetWebhook && typeof targetWebhook.delete === 'function') {
      const deleted = await targetWebhook
        .delete(reason)
        .then(() => true)
        .catch(() => false);
      if (deleted) return true;
    }
  }

  if (webhookId && typeof client?.rest?.delete === 'function') {
    const deleted = await client.rest
      .delete(Routes.webhook(webhookId), { reason })
      .then(() => true)
      .catch(() => false);
    if (deleted) return true;
  }

  return false;
}

export const data = {
  /**
   * @param {import('../base/Roynix').Roynix} client
   */
  async execute(client) {
    client.on('webhooksUpdate', async (channel) => {
      if (!channel?.guild) return;
      const guild = channel.guild;
      const event = 'antiWebhookUpdate';

      const antinukeData = await client.getAntinukeData(guild.id);
      if (!antinukeData?.enabled) return;
      if (antinukeData?.disabledEvents?.includes(event)) return;

      const punishment = antinukeData.punishment || 'ban';

      const resolved = await resolveWebhookAuditEntry(guild, channel, client);
      if (resolved.ambiguous || !resolved.entry) return;

      const entry = resolved.entry;
      const executor = entry.executor;
      if (!executor?.id) return;

      const actionType = entry.action;
      const webhookId = resolved.targetId || extractWebhookTargetId(entry);
      const targetId = webhookId || String(channel.id);
      const createdTimestamp =
        entry.createdTimestamp ?? decodeSnowflakeTimestamp(entry.id) ?? Date.now();

      const coordinator = client.incidentCoordinator || incidentCoordinator;
      const incident = coordinator.coordinateIncident({
        guild,
        client,
        antinukeData,
        actionType,
        moduleKey: event,
        targetId,
        executorId: executor.id,
        auditEntryId: entry.id || null,
        timestamp: createdTimestamp,
      });

      if (incident.decision !== 'enforce') return;

      const trackingKey = `${guild.id}_antiWebhookUpdate_${targetId}_${executor.id}`;
      const actionTaken = await punishExecutor(
        guild,
        executor,
        punishment,
        'Roynix Antinuke System | Anti Webhook Update',
        client,
        trackingKey,
        { incident, antinukeData, moduleKey: event, targetId }
      );

      let webhookDeleted = false;
      if (
        actionType === AuditLogEvent.WebhookCreate ||
        actionType === AuditLogEvent.WebhookUpdate
      ) {
        webhookDeleted = Boolean(
          await coordinator.executeRecovery(incident, () =>
            deleteUnauthorizedWebhook(
              guild,
              channel,
              webhookId,
              entry,
              executor.id,
              client,
              'Roynix Antinuke System | Unauthorized Webhook Removed'
            )
          )
        );
      }

      if (coordinator.claimCircuitBreaker(incident)) {
        await circuitBreaker
          .recordIncident(guild, client, event, executor, {
            incidentKey: incident.incidentId,
            auditEntryId: entry.id || null,
            targetId,
            moduleKey: event
          })
          .catch(() => null);
      }

      const logChannelId = antinukeData.logsChannel;
      if (logChannelId) {
        const logChannel =
          guild.channels.cache.get(logChannelId) ||
          (await guild.channels.fetch(logChannelId).catch(() => null));
        if (logChannel) {
          const actionLabel =
            actionType === AuditLogEvent.WebhookCreate
              ? 'Create'
              : actionType === AuditLogEvent.WebhookUpdate
                ? 'Update'
                : actionType === AuditLogEvent.WebhookDelete
                  ? 'Delete'
                  : String(actionType).replace('Webhook', '');

          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setTitle('Anti-Webhook Update Triggered')
            .setDescription(
              `${emojis.user} **Executor**: <@${executor.id}> (${executor.tag || executor.id})\n` +
                `${emojis.action} **Action Type**: ${actionLabel}\n` +
                `${emojis.action} **Action Taken**: ${actionTaken || 'No Action'}` +
                (webhookDeleted ? `\n${emojis.enable} **Webhook Remediation**: Unauthorized Webhook Deleted` : '')
            )
            .setTimestamp();

          logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    });
  },
};
