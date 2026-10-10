# Phase 3 — Authorization and Privilege Escalation Audit (`outh#6496`)

**Audit Date:** 2026-10-10  
**Target Repository:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Audit Mode:** Strict Read-Only Static Analysis  

---

## 1. Access-Control Trust Hierarchy

The AntiNuke system implements a four-tier authorization model stored per guild under `antinukeData_${guild.id}` in `client.antinukeDB` (`database/antinuke.sqlite`):

| Tier | Identity | Storage / Source | Capabilities |
| :--- | :--- | :--- | :--- |
| **Tier 0: Bot Owner** | Global Developer IDs | [`src/config/config.js#L2`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/config/config.js#L2) (`config.owners`) checked via [`isBotOwner(userId)`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/isBotOwner.js#L4-L7) | Full access to all `/antinuke` and `!antinuke` commands across all guilds, including `owner` management; exempt from all AntiNuke event handlers and `raw` Gateway sniffer. |
| **Tier 1: Guild Owner** | Discord Server Owner | `guild.ownerId` (Discord API) | Full access to all `/antinuke` and `!antinuke` commands including `owner add/remove/show/reset`; exempt from standard `src/antinuke/*` listeners, **but missing exemption in `raw` Gateway sniffer** (see Finding AUTH-01). |
| **Tier 2: Extra Owner** | Delegated Security Admins | `antinukeData_${guild.id}.extraOwners` (`string[]`) | Full access to `/antinuke` and `!antinuke` (`enable`, `disable`, `whitelist`, `punishment`, `logging`, `config`, `toggle`/`modules`) **except** `owner` subcommands; exempt from all AntiNuke event handlers and `raw` Gateway sniffer. |
| **Tier 3: Whitelisted User** | Per-Event Exempt Members/Bots | `antinukeData_${guild.id}.whitelisted[userId].events` (`string[]`) | **No command access** to `/antinuke` or `!antinuke`; exempt only from the specific AntiNuke event keys listed in their `events` array. |

---

## 2. Subcommand Authorization Matrix

Both [`src/commands/slash/antinuke/antinuke.js`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js) and [`src/commands/prefix/antinuke/antinuke.js`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js) enforce a top-level gate before routing to any subcommand:

- **Slash Gate ([`slash/antinuke.js#L102-L114`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L102-L114))**:
  ```javascript
  const isAuthorized = isBotOwner(interaction.user.id) || guild.ownerId === interaction.user.id || extraOwners.includes(interaction.user.id);
  if (!isAuthorized) { return interaction.reply({ ... }); }
  ```
- **Prefix Gate ([`prefix/antinuke.js#L69-L79`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L69-L79))**:
  ```javascript
  const isAuthorized = isBotOwner(message.author.id) || guild.ownerId === message.author.id || extraOwners.includes(message.author.id);
  if (!isAuthorized) { return message.reply({ ... }); }
  ```

| Command / Subcommand | Slash Line Ref | Prefix Line Ref | Allowed Actors | Re-Checks Auth in Collector? | Destructive Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `antinuke enable` | [`#L118-L273`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L118-L273) | [`#L186-L315`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L186-L315) | Bot Owner, Guild Owner, Extra Owner | N/A | Creates `Roynix Protect` role, resets `disabledEvents: []` and `punishment: 'ban'` while preserving `whitelisted`/`extraOwners`. |
| `antinuke disable` | [`#L274-L340`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L274-L340) | [`#L316-L356`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L316-L356) | Bot Owner, Guild Owner, **Extra Owner** | No confirmation collector | Immediately disables all 24 protections and deletes `Roynix Protect` role without confirmation. |
| `antinuke owner add` | [`#L356-L413`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L356-L413) | [`#L393-L448`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L393-L448) | Bot Owner, Guild Owner (`#L344`, `#L364`) | N/A | Grants full Extra Owner bypass & command privileges. |
| `antinuke owner remove` | [`#L462-L511`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L462-L511) | [`#L498-L552`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L498-L552) | Bot Owner, Guild Owner (`#L344`, `#L364`) | N/A | Revokes Extra Owner privileges. |
| `antinuke owner show` | [`#L414-L460`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L414-L460) | [`#L449-L496`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L449-L496) | Bot Owner, Guild Owner (`#L344`, `#L364`) | `paginate` checks `user.id` | Read-only pagination. |
| `antinuke owner reset` | [`#L513-L532`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L513-L532) | [`#L554-L573`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L554-L573) | Bot Owner, Guild Owner (`#L344`, `#L364`) | No confirmation collector | Wipes entire `extraOwners` array immediately. |
| `antinuke whitelist add` | [`#L562-L707`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L562-L707) | [`#L641-L805`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L641-L805) | Bot Owner, Guild Owner, **Extra Owner** | Checks `i.user.id === author.id`, **does not re-check DB auth** | Exempts target user/bot from selected or all 21 AntiNuke events. |
| `antinuke whitelist remove` | [`#L708-L756`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L708-L756) | [`#L807-L860`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L807-L860) | Bot Owner, Guild Owner, **Extra Owner** | N/A | Removes target's event exemptions. |
| `antinuke whitelist show` | [`#L758-L811`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L758-L811) | [`#L862-L914`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L862-L914) | Bot Owner, Guild Owner, **Extra Owner** | `paginate` checks `user.id` | Read-only pagination. |
| `antinuke whitelist reset` | [`#L813-L832`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L813-L832) | [`#L916-L934`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L916-L934) | Bot Owner, Guild Owner, **Extra Owner** | No confirmation collector | Wipes all whitelisted users/bots immediately. |
| `antinuke logging` | [`#L844-L875`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L844-L875) | [`#L957-L997`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L957-L997) | Bot Owner, Guild Owner, **Extra Owner** | N/A | Redirects security incident alerts to another channel. |
| `antinuke config` | [`#L876-L909`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L876-L909) | [`#L999-L1032`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L999-L1032) | Bot Owner, Guild Owner, **Extra Owner** | N/A | Displays current protection configuration. |
| `antinuke toggle` / `modules` | [`#L910-L1024`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L910-L1024) | [`#L1034-L1151`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L1034-L1151) | Bot Owner, Guild Owner, **Extra Owner** | Checks `i.user.id === author.id`, **does not re-check DB auth** | Enables/disables individual protection modules for 120s. |
| `antinuke punishment set` | [`#L1037-L1108`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L1037-L1108) | [`#L1179-L1265`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L1179-L1265) | Bot Owner, Guild Owner, **Extra Owner** | Checks `user.id`, **crashes in prefix on non-author click** | Downgrades punishment from `ban` to `kick`. |
| `antinuke punishment show` | [`#L1110-L1121`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L1110-L1121) | [`#L1268-L1279`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L1268-L1279) | Bot Owner, Guild Owner, **Extra Owner** | N/A | Displays current punishment mode. |

---

## 3. Confirmed Authorization & Privilege Escalation Vulnerabilities

### [AUTH-01] Critical: Missing `guild.ownerId` Exemption in `raw` Gateway Sniffer
- **Severity:** **Critical (P0)**
- **Location:** [`src/base/Roynix.js#L351-L356`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L351-L356)
- **Evidence:**
  ```javascript
  const extraOwners = antinukeData.extraOwners || [];
  const whitelisted = antinukeData.whitelisted || {};
  const isWhitelisted = executorId === this.user?.id ||
      isBotOwner(executorId) ||
      extraOwners.includes(executorId) ||
      (moduleName && whitelisted[executorId]?.events?.includes(moduleName));
  ```
- **Vulnerability Analysis:**
  Every individual event handler in `src/antinuke/*.js` explicitly checks `executor.id === guild.ownerId`. However, the zero-millisecond `raw` Gateway `GUILD_AUDIT_LOG_ENTRY_CREATE` sniffer in [`src/base/Roynix.js#L351-L356`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L351-L356) omits `executorId === guild.ownerId`.
- **Exploit / Failure Scenario:**
  If the actual Discord Server Owner (`guild.ownerId`) is not listed in `config.owners` or `extraOwners` and deletes a channel, deletes a role, bans a member, or kicks a member:
  1. The `raw` Gateway sniffer treats the Server Owner as an unauthorized attacker.
  2. It fires an immediate HTTP ban/kick request against the Server Owner ([`Roynix.js#L369-L373`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L369-L373))—which Discord rejects with `50013 Missing Permissions`, wasting rate-limit quota.
  3. It records a nuke incident in `circuitBreaker.recordIncident(guild, executorId, ...)` ([`Roynix.js#L360-L362`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L360-L362)). If the Server Owner deletes 2 channels within 2 seconds, the Circuit Breaker locks down the server!
  4. It triggers instant channel/role reconstruction ([`Roynix.js#L377-L426`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L377-L426)), recreating channels and roles the Server Owner intentionally deleted.
- **Remediation:** Add `executorId === guild.ownerId` to `isWhitelisted` at [`src/base/Roynix.js#L353`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L353).

---

### [AUTH-02] High: Compromised Extra Owner Blast Radius (Full Disarm & Bot Backdooring)
- **Severity:** **High (P1)**
- **Location:** [`src/commands/slash/antinuke/antinuke.js#L103`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L103), [`#L274`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L274), [`#L562`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L562), [`#L813`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L813); [`src/commands/prefix/antinuke/antinuke.js#L69`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L69), [`#L316`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L316)
- **Evidence:**
  While `antinuke owner` restricts management to `guild.ownerId` and `isBotOwner`, Extra Owners have unrestricted access to:
  1. `antinuke disable` — completely turns off AntiNuke and deletes the `Roynix Protect` role.
  2. `antinuke whitelist add <bot>` — can whitelist a malicious nuke bot for all 21 events, then invite that bot (since Extra Owners are also exempt from `antiBot`).
  3. `antinuke whitelist reset` — can wipe all whitelisted moderators/bots so legitimate staff get banned on their next moderation action.
  4. `antinuke logging <#hidden-channel>` — can redirect security logs to a private channel before executing destructive actions.
  5. Furthermore, Extra Owners are **100% exempt** from all 24 AntiNuke listeners (`extraOwners.includes(executor.id)` returns early before any rate-limit or circuit-breaker check).
- **Remediation:**
  - Restrict `antinuke disable` and `antinuke whitelist reset` to `guild.ownerId` and `isBotOwner` (or require explicit confirmation + DM alert to `guild.ownerId`).
  - Prevent Extra Owners from whitelisting themself or adding bots without Guild Owner approval, or subject Extra Owners to Circuit Breaker velocity limits (e.g., max 5 channel/role deletions in 10s).

---

### [AUTH-03] High: Unawaited `message.guild.members.fetch(args[2])` in Prefix `owner` and `whitelist` Subcommands
- **Severity:** **High (P1)**
- **Location:** [`src/commands/prefix/antinuke/antinuke.js#L361`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L361) and [`#L595`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L595)
- **Evidence:**
  ```javascript
  // Line 361 (extraowner) and Line 595 (whitelist):
  const member = message.mentions.members.first() || message.guild.members.fetch(args[2])
  ```
- **Vulnerability Analysis:**
  1. Missing `await` and `.catch(() => null)` means `member` evaluates to a `Promise` object whenever no `@mention` is used.
  2. Because a `Promise` object is always truthy in JavaScript, `if (!member)` at lines `413`, `518`, `661`, and `827` **always passes** even when the user ID does not exist!
  3. Subsequent access to `member.user.id` at lines `424`, `528`, `674`, and `840` throws `TypeError: Cannot read properties of undefined (reading 'id')` because `Promise.user` is `undefined`.
  4. Worse, when `args[2]` is `undefined` (e.g. `!antinuke owner show`, `!antinuke owner reset`, `!antinuke whitelist show`, `!antinuke whitelist reset`), `message.guild.members.fetch(undefined)` requests a **full guild member chunk over the Gateway**, which can rate-limit or stall the bot in large guilds.
- **Remediation:** Only resolve `member` inside `add`/`remove` branches, using:
  ```javascript
  const member = message.mentions.members.first() || (args[2] ? await message.guild.members.fetch(args[2]).catch(() => null) : null);
  ```

---

### [AUTH-04] Medium: `ReferenceError: i is not defined` in Prefix `!antinuke punishment set` Collector
- **Severity:** **Medium (P1)**
- **Location:** [`src/commands/prefix/antinuke/antinuke.js#L1206-L1210`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L1206-L1210)
- **Evidence:**
  ```javascript
  collector.on('collect', async (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      if (interaction.user.id !== message.author.id) {
          return i.reply({ content: 'You cannot interact with this.', flags: MessageFlags.Ephemeral });
      }
  ```
- **Vulnerability Analysis:**
  The callback parameter is named `interaction`, but line 1209 calls `i.reply(...)`. If any unauthorized user in the channel clicks the punishment dropdown while the 60-second collector is active, the collector throws an unhandled `ReferenceError: i is not defined`.
- **Remediation:** Change `i.reply(...)` to `interaction.reply(...)` at [`src/commands/prefix/antinuke/antinuke.js#L1209`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L1209).

---

### [AUTH-05] Medium: Interactive Collectors Do Not Re-Verify Authorization on Submission
- **Severity:** **Medium (P2)**
- **Location:**
  - [`src/commands/slash/antinuke/antinuke.js#L622-L704`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L622-L704) (`whitelist add`, 60s window)
  - [`src/commands/slash/antinuke/antinuke.js#L991-L1016`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L991-L1016) (`modules`/`toggle`, 120s window)
  - [`src/commands/slash/antinuke/antinuke.js#L1061-L1093`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L1061-L1093) (`punishment set`, 60s window)
  - Corresponding collectors in [`src/commands/prefix/antinuke/antinuke.js`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js)
- **Vulnerability Analysis:**
  1. When an Extra Owner opens `/antinuke modules` (active for 120 seconds) or `/antinuke whitelist add` (active for 60 seconds), and the Server Owner revokes their Extra Owner status via `/antinuke owner remove` during that window, the open collector only checks `i.user.id === interaction.user.id` and **does not re-verify** that `i.user.id` is still in `extraOwners`. The revoked Extra Owner can still toggle off all protections or finish whitelisting an account.
  2. Additionally, in `whitelist add` ([`slash/antinuke.js#L616-L706`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L616-L706) and [`prefix/antinuke.js#L711-L801`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L711-L801)), there is no `collector.on('end')` handler to disable the select menu and "Whitelist All Events" button if the 60-second timer expires without selection.
  3. In `modules`/`toggle` ([`slash/antinuke.js#L991-L994`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L991-L994) and [`prefix/antinuke.js#L1117-L1120`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L1117-L1120)), unauthorized users are rejected by the collector `filter` without an ephemeral reply, causing Discord to show "This interaction failed".
- **Remediation:**
  - Create a helper `isUserAuthorized(guild, userId, antinukeDB)` and call it inside every `collector.on('collect')` callback before mutating `antinukeDB`.
  - Add `collector.on('end')` component cleanup to `whitelist add` in both slash and prefix commands.

---

### [AUTH-06] Medium: Missing Confirmation Step on Destructive `disable` and `reset` Commands
- **Severity:** **Medium (P2)**
- **Location:**
  - `antinuke disable`: [`slash/antinuke.js#L274-L340`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L274-L340), [`prefix/antinuke.js#L316-L356`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L316-L356)
  - `antinuke owner reset`: [`slash/antinuke.js#L513-L532`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L513-L532), [`prefix/antinuke.js#L554-L573`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L554-L573)
  - `antinuke whitelist reset`: [`slash/antinuke.js#L813-L832`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/slash/antinuke/antinuke.js#L813-L832), [`prefix/antinuke.js#L916-L934`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/commands/prefix/antinuke/antinuke.js#L916-L934)
- **Vulnerability Analysis:**
  Although `antinuke disable` was updated in commit `12bcbda` to preserve `whitelisted`, `extraOwners`, `punishment`, and `logsChannel` in SQLite (`enabled: false`), executing `antinuke disable`, `owner reset`, or `whitelist reset` takes effect immediately in a single command without an interactive confirmation prompt.
- **Remediation:** Require a Confirm/Cancel button interaction (bound to the command invoker with a 30s timeout) before executing `disable`, `owner reset`, or `whitelist reset`.
