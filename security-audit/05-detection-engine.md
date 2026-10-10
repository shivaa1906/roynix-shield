# Phase 5 — Rate Limits, Thresholds, and Suspicious Behavior Detection Audit (`outh#6496`)

**Audit Date:** 2026-10-10  
**Target Repository:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Audit Mode:** Strict Read-Only Static Analysis  

---

## 1. Inventory of Detection Trackers & Rate-Limit State

The bot maintains **five distinct in-memory state trackers** across its AntiNuke and defense engines:

| Tracker Name | Location | Key Format | Threshold / Window | Eviction / Cleanup Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **`Single-Event Zero-Tolerance`** | All `src/antinuke/anti*.js` & `Roynix.js` | N/A (Stateless) | **1 event** = immediate containment (`ban`/`kick`) | Stateless (checks `antinukeDB` L1 cache in `0.001ms`). |
| **`circuitBreaker.incidentTracker`** | [`src/utils/circuitBreaker.js#L26`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/circuitBreaker.js#L26) | `guild.id` | **2 destructive events within `2,000ms`** across the guild ([`#L50-L60`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/circuitBreaker.js#L50-L60)) | Filters timestamps `< 2000ms` on write; locks guild in `activeLockdowns` for `300,000ms` (5 min). |
| **`client.antinukeActionTracker`** | [`src/base/Roynix.js#L130`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L130), [`src/antinuke/autoRecovery.js#L22-L38`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/autoRecovery.js#L22-L38) | `${guildId}_${executorId}` | **1 delete** = single recovery; **>= 2 deletes within `15,000ms`** = full snapshot restoration ([`autoRecovery.js#L93`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/autoRecovery.js#L93)) | Swept every `60,000ms` in [`Roynix.js#L211-L221`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L211-L221) (evicts entries older than `60s`). |
| **`botMessageSpamTracker`** | [`src/antinuke/antiPing.js#L41-L65`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L41-L65) | `${guild.id}_${author.id}` | **>= 5 messages within `4,000ms`** (Bots & Webhooks only) | **No periodic sweep** — old keys remain in `Map` if the bot/webhook stops sending messages (see Finding DET-03). |
| **`Mass-Mention Detector`** | [`src/antinuke/antiPing.js#L92-L100`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L92-L100) | Stateless per message | `@everyone` / `@here` OR **`>= 4` combined user + role mentions** in a single message | Stateless per `messageCreate` event. |

---

## 2. Confirmed Detection Engine Vulnerabilities & False-Positive Risks

### [DET-01] High: False-Positive Permanent Ban of Regular Members via `antiPing.js` (`>= 4` Mentions or `@everyone` Attempt)
- **Severity:** **High (P1)**
- **Location:** [`src/antinuke/antiPing.js#L92-L148`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L92-L148)
- **Evidence:**
  ```javascript
  // Lines 92-100
  const hasEveryoneOrHere = message.mentions.everyone ||
      message.content.includes('@everyone') ||
      message.content.includes('@here');

  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  const isMassMention = mentionCount >= 4;

  if (!hasEveryoneOrHere && !isMassMention) return;
  ...
  // Line 122: Punishes ANY non-whitelisted member with guild's default antinuke punishment ('ban')!
  const actionTaken = await punishExecutor(guild, author.id, `Roynix Antinuke: Mass Mention / @everyone Raid (${reasonType})`, punishment);
  ```
- **Vulnerability Analysis:**
  1. **Raw String Check (`message.content.includes('@everyone')`)**: Even if a regular, non-privileged member **does not have the `MentionEveryone` permission** (so Discord does not actually ping anyone and `message.mentions.everyone` is `false`), simply typing the literal text `@everyone` or `@here` in chat (or inside a code block `` `@everyone` ``) triggers `hasEveryoneOrHere === true` and **permanently bans** the member!
  2. **Low Single-Message Mention Threshold (`>= 4`)**: Any regular user who replies to a message thread or tags 4 friends in a single message (`mentionCount >= 4`) is immediately **banned** by `punishExecutor` with the guild's AntiNuke punishment (`ban`).
- **Remediation:**
  - For `@everyone`/`@here`, either check `message.mentions.everyone` (actual ping) or verify whether the author/webhook actually had permission or sent repeated attempts (e.g. `>= 3` messages containing `@everyone` in 5s).
  - For regular members without dangerous permissions, delete the message and apply a short timeout (or defer to `automod`), reserving AntiNuke `ban`/`kick` for bots, webhooks, or mass-ping raids (`>= 10` mentions or `>= 3` mass-ping messages in 5s).

---

### [DET-02] High: Webhook Mass-Ping / Spam Bypass in `antiPing.js`
- **Severity:** **High (P1)**
- **Location:** [`src/antinuke/antiPing.js#L69-L72`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L69-L72) and [`#L121-L122`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L121-L122)
- **Evidence:**
  ```javascript
  // Line 40: Includes message.webhookId
  if (author.bot || message.webhookId) {
      ...
      if (recentTimestamps.length >= 5) {
          ...
          await punishExecutor(guild, author.id, 'Roynix Antinuke: Bot / Webhook Message Spam Raid', punishment);
  ```
- **Vulnerability Analysis:**
  When a webhook spams messages or `@everyone` pings, `message.author.id` is the **Webhook's snowflake ID**, not a GuildMember ID.
  - Calling `punishExecutor(guild, author.id, ...)` calls `guild.bans.create(webhookId)` or `guild.members.kick(webhookId)`, which **fails with `10007 Unknown Member` / `10013 Unknown User`** and does **not** delete the webhook!
  - The webhook remains alive and continues spamming `@everyone` messages indefinitely (until `circuitBreaker` happens to trip from another event).
- **Remediation:**
  In `antiPing.js`, when `message.webhookId` is truthy:
  1. Delete the offending webhook immediately via `client.rest.delete(Routes.webhook(message.webhookId))` or `message.channel.fetchWebhooks().then(hooks => hooks.get(message.webhookId)?.delete())`.
  2. Query `getAuditExecutor(guild, AuditLogEvent.WebhookCreate, message.webhookId)` to identify and punish the member who created the webhook.

---

### [DET-03] Medium: Unbounded Memory Growth in `botMessageSpamTracker` (`antiPing.js`)
- **Severity:** **Medium (P2)**
- **Location:** [`src/antinuke/antiPing.js#L15`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L15) and [`#L41-L65`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L41-L65)
- **Evidence:**
  ```javascript
  const botMessageSpamTracker = new Map();
  ```
- **Vulnerability Analysis:**
  Unlike `client.antinukeActionTracker` (which is swept every 60s in `Roynix.js#L211`), `botMessageSpamTracker` is a module-scoped `Map` with **no periodic cleanup interval** and no `.delete(spamKey)` when `recentTimestamps` empties. Every unique bot or webhook that sends even 1 message in any guild creates a permanent entry in `botMessageSpamTracker`.
- **Remediation:** Add a periodic cleanup or delete keys when `recentTimestamps.length === 0`, and cap `botMessageSpamTracker.size` (e.g. clear oldest entries if `size > 5000`).

---

### [DET-04] Medium: Double-Counting of Single Incident in `circuitBreaker.recordIncident`
- **Severity:** **Medium (P2)**
- **Location:**
  - [`src/base/Roynix.js#L266-L268`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L266-L268) (`guildAuditLogEntryCreate` listener)
  - [`src/base/Roynix.js#L360-L362`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L360-L362) (`raw` `GUILD_AUDIT_LOG_ENTRY_CREATE` listener)
- **Evidence:**
  Both the `raw` WebSocket listener (`#L360`) and the Discord.js `guildAuditLogEntryCreate` listener (`#L266`) call `this.circuitBreaker.recordIncident(guild, executorId, ...)` for the **exact same audit log packet**!
- **Vulnerability Analysis:**
  Because `circuitBreaker.recordIncident` triggers a full server lockdown at `recent.length >= 2` within `2,000ms` ([`src/utils/circuitBreaker.js#L58`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/circuitBreaker.js#L58)), a **single** unauthorized action (e.g., 1 channel delete or 1 role delete) is recorded **twice** within 5 milliseconds (once by `raw`, once by `guildAuditLogEntryCreate`), immediately reaching `recent.length === 2` and triggering a **Full Server Circuit Breaker Lockdown** (stripping `Administrator`/`ManageGuild`/`ManageRoles`/`ManageChannels`/`BanMembers`/`KickMembers`/`ManageWebhooks` from all roles in the server and deleting all webhooks) on just **1** incident!
- **Remediation:**
  - Deduplicate incidents in `circuitBreaker.recordIncident` using the audit log entry ID (`packet.d.id` / `auditLogEntry.id`), or only call `recordIncident` from one listener (`raw` sniffer).
