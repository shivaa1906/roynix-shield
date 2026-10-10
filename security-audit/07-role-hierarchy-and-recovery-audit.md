# Phase 7 — Role Hierarchy, Self-Protection, Auto-Recovery, Persistence & Remediation Plan (`outh#6496`)

**Audit Date:** 2026-10-10  
**Target Repository:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Audit Mode:** Strict Read-Only Static Analysis  

---

## 1. Role Hierarchy & Bot Self-Protection Audit

### 1.1 `Roynix Protect` Role Creation & Positioning
- **Implementation:**
  - Slash: [`src/commands/slash/antinuke/antinuke.js#L186-L246`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L186-L246)
  - Prefix: [`src/commands/prefix/antinuke/antinuke.js#L254-L287`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L254-L287)
- **Current Behavior:**
  - Creates a role named `Roynix Protect` with `PermissionsBitField.Flags.Administrator`, assigns it to the bot (`botMember.roles.add(role)`), and moves it to `Math.max(1, botHighestPos - 1)`.
  - In `slash/antinuke.js#L204-L221` (updated in commit `12bcbda`), positioning errors are logged and a `roleMoveWarning` is displayed if the role cannot be moved or sits low in the hierarchy.
- **Identified Gaps:**
  - **[ROLE-01] Prefix `antinuke enable` Still Silently Ignores Role Move Failures ([`prefix/antinuke.js#L276`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L276))**:
    `await role.setPosition(targetPos).catch(() => null)` in `prefix/antinuke.js` still swallows positioning errors without warning the user.
  - **[ROLE-02] No Self-Protection Against Tampering With `Roynix Protect` Role**:
    If an attacker or compromised admin lowers the position of `Roynix Protect`, removes `Administrator` from `Roynix Protect`, or deletes `Roynix Protect`:
    - `antiRoleUpdate.js` ([`#L50-L61`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiRoleUpdate.js#L50-L61)) only reverts permissions if permissions were *added* (`addedPerms.any(DANGEROUS_PERMS)`), **not** if permissions were *removed* from `protectRole` (`antinukeData.protectRole`)!
    - Neither `antiRoleDelete.js` nor `antiRoleUpdate.js` updates `antinukeData_${guild.id}.protectRole` when the protection role is deleted and recreated (leaving `antinukeData.protectRole` pointing to a dead role ID).

---

## 2. Automatic Recovery & Snapshot Engine Audit

### 2.1 Architecture
The recovery engine spans four modules:
1. **Periodic Snapshot Scheduler ([`src/base/Roynix.js#L185-L225`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L185-L225))**:
   - Captures a baseline snapshot 10 seconds after startup and refreshes every 30 minutes (`1,800,000ms`), skipping guilds currently in `recoveryLock` or `channelReconstructionLock`.
2. **Snapshot Serializer & Restorer ([`src/utils/serverBackup.js#L16-L315`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/serverBackup.js#L16-L315))**:
   - Stores guild metadata, roles, channels (with permission overwrites and category parenting), and member role assignments (`memberRoles`, capped at 5,000 members with custom roles) in `client.backupDB` (`database/backups.sqlite`).
3. **Nuke Auto-Recovery Listener ([`src/antinuke/autoRecovery.js#L45-L120`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/autoRecovery.js#L45-L120))**:
   - Triggers full snapshot restoration via `restoreSnapshot` when `>= 2` destructive channel/role deletions occur within `15,000ms`.
4. **Single-Item Immediate Reconstruction**:
   - [`src/antinuke/antiChannelDelete.js#L51-L132`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiChannelDelete.js#L51-L132)
   - [`src/antinuke/antiRoleDelete.js#L52-L85`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiRoleDelete.js#L52-L85)
   - [`src/base/Roynix.js#L380-L426`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L380-L426)

### 2.2 Confirmed Auto-Recovery Vulnerabilities

#### [REC-01] High: Duplicate Channel and Role Creation on Every Single Deletion
- **Severity:** **High (P1)**
- **Location:** [`src/base/Roynix.js#L380-L426`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L380-L426) vs [`src/antinuke/antiChannelDelete.js#L51-L132`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiChannelDelete.js#L51-L132) and [`src/antinuke/antiRoleDelete.js#L52-L85`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiRoleDelete.js#L52-L85)
- **Evidence:**
  When 1 channel is deleted by an unauthorized user:
  1. `Roynix.js#L384` (`raw` `GUILD_AUDIT_LOG_ENTRY_CREATE`) immediately calls `guild.channels.create(...)` from `cachedSnap`.
  2. Milliseconds later, `antiChannelDelete.js#L58` (`channelDelete` event) **also** calls `guild.channels.create(...)` from the deleted `channel` object!
  3. Because `Roynix.js` does not set `channelReconstructionLock` or record the deleted `targetId` as already reconstructed, **two duplicate channels** (and **two duplicate roles** on `roleDelete`) are created for every single deletion!
  4. Worse, if 2 channels are deleted within 15 seconds, `autoRecovery.js#L93` ALSO runs `restoreSnapshot(guild)`, which checks `currentChannels.find(c => c.name === chSnap.name && c.type === chSnap.type)`—if the `raw` or `antiChannelDelete` recreation is still in-flight on Discord's API, `restoreSnapshot` can create a **third** copy!
- **Remediation:**
  Remove the duplicate inline `guild.channels.create` / `guild.roles.create` blocks from the `raw` sniffer in [`src/base/Roynix.js#L377-L426`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L377-L426) (keep only the 0ms ban/kick in `raw`), and add a per-target deduplication `Set` (`client.recoveredTargets`, 30s TTL) shared between `antiChannelDelete.js`, `antiRoleDelete.js`, and `autoRecovery.js`.

#### [REC-02] Medium: Snapshot Poisoning Risk During Slow/Low-Rate Attacks
- **Severity:** **Medium (P2)**
- **Location:** [`src/base/Roynix.js#L198-L209`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L198-L209)
- **Evidence:**
  The 30-minute snapshot timer overwrites `snapshot_${guild.id}` unconditionally as long as `!this.recoveryLock.has(guild.id)`.
- **Vulnerability Analysis:**
  If a compromised Extra Owner (exempt from AntiNuke) deletes channels/roles, or if a server is partially damaged and the 30-minute timer ticks before restoration, the healthy snapshot in `backupDB` is overwritten with the damaged guild state (`channels.length === 0` or drastically reduced).
- **Remediation:**
  In `captureSnapshot(guild)`, compare the new channel/role count against the existing saved snapshot (`backupDB.get('snapshot_' + guild.id)`). If the guild lost `> 30%` of its channels or roles since the last snapshot and `force !== true`, refuse to overwrite the healthy backup (or store the previous snapshot in `snapshot_prev_${guild.id}`).

---

## 3. Database Persistence & Restart Behavior Audit

### 3.1 Storage Architecture (`FastDB` + `better-sqlite3`)
- **Implementation:** [`src/utils/fastDb.js#L26-L150`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/fastDb.js#L26-L150)
- **Strengths Verified:**
  - Uses synchronous native C++ `better-sqlite3` with `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and `PRAGMA mmap_size = 67108864`.
  - Preloads all rows into an L1 in-memory `Map` on startup so `.get()` and `.set()` operate at memory speed (`0.001ms`–`0.25ms`) while persisting synchronously to SQLite WAL on disk.
  - Supports nested dot-notation (`antinukeData_${guild.id}.whitelisted.${user.id}`) with deep-clone isolation (`structuredClone`) to prevent accidental in-memory reference mutation.
  - `antinuke disable` in both [`slash/antinuke.js#L297-L306`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L297-L306) and [`prefix/antinuke.js#L334-L343`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L334-L343) preserves `whitelisted`, `extraOwners`, `punishment`, `logsChannel`, and `disabledEvents` when setting `enabled: false`.

### 3.2 Confirmed Persistence Issues
- **[DB-01] Low: Missing `process.on('SIGINT' / 'SIGTERM')` WAL Checkpoint & Clean Shutdown Hook**:
  - Neither [`src/index.js`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/index.js) nor [`src/utils/fastDb.js`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/fastDb.js) registers a `SIGINT`/`SIGTERM` handler to close the SQLite connections (`sqlite.close()`) and destroy the Discord client cleanly on process termination.

---

## 4. Non-Destructive Verification & Isolated Test Plan

Because this audit strictly prohibits running destructive Discord operations against live servers, the following isolated verification matrix is defined for Phase 2 remediation testing:

| Test ID | Target Finding | Isolated Verification Method | Expected Pass Criterion |
| :--- | :--- | :--- | :--- |
| **TEST-01** | `AUTH-01` (`raw` sniffer missing `guild.ownerId`) | Unit-test `raw` packet handler with mock `packet.d = { guild_id, user_id: guild.ownerId, action_type: 12 }`. | Handler returns early at `isWhitelisted`; zero ban calls, zero `circuitBreaker` incidents. |
| **TEST-02** | `ATTR-01` (`getAuditExecutor` `_any` cross-attribution) | Unit-test `getAuditExecutor(guild, 12, 'ch_target_2')` when `auditLogCache` only has `ch_target_1` and `_any` (executor = Admin A). | Returns `null` (or fetches exact match for `ch_target_2`), never misattributing `ch_target_2` to Admin A. |
| **TEST-03** | `ATTR-02` (`antiBot.js` premature ban & null crash) | Simulate `guildMemberAdd` with `member.user.bot = true` invited by `guild.ownerId` and with `executor = null`. | When invited by `guild.ownerId`, bot is **not** banned; when `executor = null`, bot is banned and log embed renders `'Unknown'` without throwing `TypeError`. |
| **TEST-04** | `ATTR-03` (`antiWebhookUpdate.js` event name & deletion) | Verify `client.listenerCount('webhooksUpdate') >= 1` and `client.listenerCount('webhooksUpdates') === 0`. | Listener attaches to `'webhooksUpdate'`, resolves `WebhookCreate`/`Update`/`Delete`, and deletes unauthorized webhooks. |
| **TEST-05** | `AUTH-03` & `AUTH-04` (`prefix/antinuke.js` bugs) | Invoke prefix `extraowner show` (with `args[2] = undefined`) and simulate non-author click on `punishment set`. | Does not call `members.fetch(undefined)` and replies ephemerally using `interaction.reply` without `ReferenceError`. |
| **TEST-06** | `CONT-01` & `CONT-02` (`punishExecutor` fallback & managed role zeroing) | Mock `guild.bans.create` rejecting with `50013` on a bot member with a `managed: true` role. | Enters `catch (err)` block, calls `role.setPermissions(0n)` on managed role, applies 28d timeout, and returns `'Roles Stripped & Timed Out (Fallback)'`. |
| **TEST-07** | `REC-01` & `DET-04` (Duplicate channel recovery & double Circuit Breaker count) | Simulate 1 unauthorized `channelDelete` event across `raw`, `guildAuditLogEntryCreate`, and `channelDelete`. | `circuitBreaker` records **1** incident (no lockdown on 1 event), and `guild.channels.create` is called **once**. |

---

## 5. Prioritized Remediation Roadmap (Preserving All Existing Features)

All findings across Reports `01`–`07` are consolidated below in strict priority order for Phase 2 implementation:

### Priority 0 — Critical (Fix Immediately Before Production Use)
1. **[AUTH-01] Add `executorId === guild.ownerId` to `raw` Gateway Sniffer** ([`src/base/Roynix.js#L353`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L353)):
   - Prevents the `raw` sniffer from attempting to ban the Server Owner, tripping the Circuit Breaker, or recreating channels/roles the Server Owner intentionally deleted.
2. **[ATTR-01] Eliminate Cross-Target False Attribution in `getAuditExecutor`** ([`src/utils/getExecutor.js#L39-L108`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/getExecutor.js#L39-L108)):
   - Key `pendingFetches` by `${guild.id}_${type}_${targetId || 'any'}` and enforce strict `targetId` matching whenever `targetId` is non-null.
3. **[ATTR-02] Fix Premature Bot Ban & Null Executor Crash in `antiBot.js`** ([`src/antinuke/antiBot.js#L34-L64`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiBot.js#L34-L64)):
   - Resolve `executor` before banning the joining bot so bots invited by the Guild Owner, Bot Owner, Extra Owner, or `antiBot`-whitelisted admins are not banned; add null-safe `executor?.id` formatting.

### Priority 1 — High (Security Bypass, Broken Module, or False-Positive Containment)
4. **[ATTR-03] Fix `'webhooksUpdates'` Typo, Cache Key, and Webhook Deletion in `antiWebhookUpdate.js`** ([`src/antinuke/antiWebhookUpdate.js#L14-L53`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiWebhookUpdate.js#L14-L53)):
   - Listen to `'webhooksUpdate'`, check `WebhookCreate` / `WebhookUpdate` / `WebhookDelete`, and delete unauthorized webhooks immediately.
5. **[CONT-01 & CONT-02 & CONT-03] Fix `punishExecutor.js` & `zeroTrustQuarantine.js` Containment Reliability** ([`src/utils/punishExecutor.js#L20-L85`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/punishExecutor.js#L20-L85), [`src/utils/zeroTrustQuarantine.js#L44`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/zeroTrustQuarantine.js#L44)):
   - Remove `.catch(() => null)` inside `try` on `guild.bans.create` so failed bans fall back to role-stripping + timeout; zero out permissions (`role.setPermissions(0n)`) on managed bot roles (`r.managed`); share the in-flight punishment Promise across `punishLock` so logs report `'Banned'` instead of `'Failed'`.
6. **[REC-01 & DET-04] Deduplicate Fast-Path Recovery & Circuit Breaker Incident Counting** ([`src/base/Roynix.js#L266`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L266), [`#L360-L426`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L360-L426)):
   - Deduplicate `circuitBreaker.recordIncident` by audit-log entry ID (or record in one place only) and deduplicate channel/role recovery using a `recoveredTargets` `Set` so each deleted channel/role is recreated exactly once.
7. **[DET-01 & DET-02] Fix `antiPing.js` False-Positive Member Bans & Webhook Deletion** ([`src/antinuke/antiPing.js#L40-L125`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L40-L125)):
   - Delete offending webhooks when `message.webhookId` is present; require actual `message.mentions.everyone` or repeated/high-volume mentions (`>= 6` or `>= 3` messages) before banning members.
8. **[AUTH-03 & AUTH-04] Fix Prefix Command Unawaited `members.fetch` & `ReferenceError: i is not defined`** ([`src/commands/prefix/antinuke/antinuke.js#L361`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L361), [`#L595`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L595), [`#L1209`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L1209)).

### Priority 2 — Medium (Hardening, Collector Lifecycle & Snapshot Protection)
9. **[AUTH-02, AUTH-05 & AUTH-06] Re-Verify Authorization in Collectors, Add `whitelist add` Timeout Cleanup, and Protect `disable`/`reset`**.
10. **[ROLE-01 & ROLE-02] Protect `Roynix Protect` Role Against Permission Removal & Position Tampering** ([`src/antinuke/antiRoleUpdate.js`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiRoleUpdate.js), [`src/commands/prefix/antinuke/antinuke.js#L276`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L276)).
11. **[REC-02 & DET-03 & DB-01] Guard Healthy Snapshots Against Poisoning, Sweep `botMessageSpamTracker`, and Add Clean SQLite Shutdown Hook**.
