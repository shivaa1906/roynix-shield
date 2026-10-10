# Phase 6 — Punishment and Containment Audit (`outh#6496`)

**Audit Date:** 2026-10-10  
**Target Repository:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Audit Mode:** Strict Read-Only Static Analysis  

---

## 1. Containment Architecture Overview

When an unauthorized security event is detected, containment executes across up to three layers:

1. **Zero-Latency Raw Sniffer Containment ([`src/base/Roynix.js#L368-L374`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L368-L374))**:
   - Directly calls `guild.bans.create(executorId)` (or `guild.members.kick(executorId)` if `antinukeData.punishment === 'kick'`).
2. **Primary Containment Utility ([`src/utils/punishExecutor.js#L16-L99`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L16-L99))**:
   - Called by `Roynix.js` (`guildAuditLogEntryCreate`) and all 24 `src/antinuke/*.js` handlers.
   - Uses an in-memory `punishLock` (`Set` with 8s TTL per `${guild.id}_${executorId}`) to deduplicate concurrent punishment requests.
   - Supports three modes: `'ban'` (default), `'kick'`, and `'strip'` (plus fallback role-stripping + 28-day timeout if kick/ban fails due to role hierarchy).
3. **Server-Wide Circuit Breaker Lockdown ([`src/utils/circuitBreaker.js#L68-L162`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/circuitBreaker.js#L68-L162))**:
   - Strips dangerous permissions (`Administrator`, `ManageGuild`, `ManageRoles`, `ManageChannels`, `BanMembers`, `KickMembers`, `ManageWebhooks`) from all editable roles below the bot, bans the executor, and deletes all guild webhooks.

---

## 2. Confirmed Containment Vulnerabilities

### [CONT-01] High: False-Positive `"Banned"` Return Value When `guild.bans.create` Fails (`punishExecutor.js`)
- **Severity:** **High (P1)**
- **Location:** [`src/utils/punishExecutor.js#L43-L51`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L43-L51)
- **Evidence:**
  ```javascript
  try {
      if (punishment === 'ban') {
          await guild.bans.create(executorId, {
              reason,
              deleteMessageSeconds: 604800
          }).catch(() => null);
          return 'Banned';
      }
  ```
- **Vulnerability Analysis:**
  1. Because `.catch(() => null)` is chained directly onto `guild.bans.create(...)` *inside* the `try` block, a rejected Discord API call (e.g., `50013 Missing Permissions` when the attacker's highest role is above the bot's highest role, or when the bot lacks `BanMembers`) resolves to `null` instead of throwing into the `catch (err)` fallback block at [`#L72-L95`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L72-L95)!
  2. As a result:
     - **The fallback role-strip + 28-day timeout block at lines 72–95 is NEVER reached when `punishment === 'ban'`!**
     - `punishExecutor` unconditionally returns `'Banned'`, and `sendLogEmbed` reports `- **Action Taken:** Banned` in the security log channel even though the attacker was **not banned, not role-stripped, and not timed out**!
- **Remediation:**
  Remove `.catch(() => null)` from `guild.bans.create(...)` at [`src/utils/punishExecutor.js#L48`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L48) (or check the result and `throw` on failure) so that when `guild.bans.create` fails due to role hierarchy, execution enters `catch (err)` at line 72 to strip the attacker's lower dangerous roles, neuter managed roles, and apply a 28-day communication timeout.

---

### [CONT-02] High: Managed Bot Role (`role.managed`) Bypass During Quarantine & Fallback Strip
- **Severity:** **High (P1)**
- **Location:**
  - [`src/utils/zeroTrustQuarantine.js#L43-L45`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/zeroTrustQuarantine.js#L43-L45)
  - [`src/utils/punishExecutor.js#L62-L67`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L62-L67) and [`#L75-L85`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L75-L85)
- **Evidence:**
  ```javascript
  // src/utils/zeroTrustQuarantine.js#L44
  await member.roles.set([], 'Zero-Trust Quarantine: Unwhitelisted bot added');
  ```
  ```javascript
  // src/utils/punishExecutor.js#L63-L66
  const dangerousRoles = member.roles.cache.filter(r =>
      r.id !== guild.id && !r.managed && r.permissions.any(DANGEROUS_PERMISSIONS)
  );
  await member.roles.remove(dangerousRoles, reason);
  ```
- **Vulnerability Analysis:**
  1. In Discord, every OAuth2 bot invited with permissions receives a **managed integration role** (`role.managed === true`). Discord's API **forbids** removing a managed role from a bot (`member.roles.set([])` throws `50028 Invalid Role` or silently leaves managed roles attached).
  2. Therefore, in `zeroTrustQuarantine.js#L44`, calling `member.roles.set([])` on a newly joined bot **fails to strip its OAuth2 integration role**, leaving `Administrator` or other dangerous permissions active on the bot's managed role!
  3. Similarly, in `punishExecutor.js#L64` and `#L76`, `!r.managed` explicitly skips the bot's managed role when stripping dangerous roles. While a managed role cannot be *removed* from the bot member, its **permissions CAN be set to `0n`** (`await role.setPermissions(0n, reason)`) as long as the role is below the bot's highest role (`role.editable`).
- **Remediation:**
  In both `zeroTrustQuarantine.js` and `punishExecutor.js` (`strip` mode and fallback `catch` block), iterate over all `member.roles.cache.filter(r => r.managed && r.editable && r.permissions.any(DANGEROUS_PERMISSIONS))` and call `await r.setPermissions(0n, reason)` to zero out the bot's managed integration role permissions.

---

### [CONT-03] Medium: `punishLock` Returns `null` on Concurrent Invocations, Causing False `"Action Taken: Failed"` Logs
- **Severity:** **Medium (P2)**
- **Location:** [`src/utils/punishExecutor.js#L20-L24`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L20-L24)
- **Evidence:**
  ```javascript
  const lockKey = `${guild.id}_${executorId}`;
  if (punishLock.has(lockKey)) return null;
  punishLock.add(lockKey);
  setTimeout(() => punishLock.delete(lockKey), 8000);
  ```
- **Vulnerability Analysis:**
  When an unauthorized user triggers a protected event (e.g. `channelDelete`), `Roynix.js#L276` (`guildAuditLogEntryCreate`) calls `punishExecutor` first and acquires `punishLock` for 8 seconds. Milliseconds later, `src/antinuke/antiChannelDelete.js#L47` calls `punishExecutor` for the same event, hits `if (punishLock.has(lockKey)) return null`, and logs:
  ```javascript
  `- **Action Taken:** ${actionTaken || 'Failed'}\n`
  ```
  Even though the attacker was already banned by the fast-path, every security log embed in `logsChannel` displays **`Action Taken: Failed`**!
- **Remediation:**
  Store the resolved `Promise` or last result string in a `Map` (`punishResults.set(lockKey, promise)`) for the 8-second window and `return punishResults.get(lockKey)` so concurrent callers receive the actual containment outcome (`'Banned'`, `'Kicked'`, etc.) instead of `null`.
