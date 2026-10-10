# Phase 2 — AntiNuke Protection Feature Inventory & Verification Matrix

**Audit Target:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Advertised Registry:** [`src/utils/antinukeModules.js#L3-L28`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/antinukeModules.js#L3-L28) (24 Modules)  
**Dynamic Loader:** [`src/handlers/antinuke.js#L12-L36`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/handlers/antinuke.js#L12-L36)  
**Fast-Path Engines:** [`src/base/Roynix.js#L231-L396`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L231-L396) (`guildAuditLogEntryCreate` + `raw` `GUILD_AUDIT_LOG_ENTRY_CREATE`)

---

## 1. Master Feature Verification Table (All 24 Advertised Modules)

> [!IMPORTANT]
> Because the repository has **zero automated unit/integration test files**, no module can be classified as *"Verified by source and tests"*. Every implemented module is classified below based on rigorous source verification.

| # | Advertised Name | Config Key (`disabledEvents`) | Gateway Event(s) | Listener File & Lines | Fast-Path (`Roynix.js`) | Recovery Attempted? | Audit Classification |
|---|---|---|---|---|---|---|---|
| 1 | **Anti Bot** | `antiBot` | `guildMemberAdd` | [`antiBot.js#L16-L73`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiBot.js#L16-L73) | Yes (`BotAdd`) | Yes (bans/kicks added bot at 0ms) | **Partially implemented (Logic flaw: bans bots added by Guild Owner if bot ID not pre-whitelisted; crashes on null executor at L63)** |
| 2 | **Anti Ban** | `antiBan` | `guildBanAdd` | [`antiBan.js#L12-L90`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiBan.js#L12-L90) | Yes (`MemberBanAdd`) | Yes (`guild.bans.remove`) | **Implemented but insufficiently tested** |
| 3 | **Anti Kick** | `antiKick` | `guildMemberRemove` | [`antiKick.js#L12-L67`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiKick.js#L12-L67) | Yes (`MemberKick`) | No (Discord API limitation) | **Implemented but insufficiently tested** |
| 4 | **Anti Channel Create** | `antiChannelCreate` | `channelCreate` | [`antiChannelCreate.js#L14-L67`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiChannelCreate.js#L14-L67) | Yes (`ChannelCreate`) | Yes (`channel.delete` — ignores `autoRecovery` toggle) | **Implemented but insufficiently tested** |
| 5 | **Anti Channel Delete** | `antiChannelDelete` | `channelDelete` | [`antiChannelDelete.js#L19-L97`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiChannelDelete.js#L19-L97) | Yes (`ChannelDelete`) | Yes (`blueprintManager.restoreChannelHierarchical`) | **Implemented but insufficiently tested** |
| 6 | **Anti Channel Update** | `antiChannelUpdate` | `channelUpdate` | [`antiChannelUpdate.js#L14-L132`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiChannelUpdate.js#L14-L132) | Yes (`ChannelUpdate`) | Yes (`newChannel.edit` + `permissionOverwrites.set`) | **Implemented but insufficiently tested** |
| 7 | **Anti Sticker Create** | `antiStickerCreate` | `stickerCreate` | [`antiStickerCreate.js#L12-L63`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiStickerCreate.js#L12-L63) | Yes (`StickerCreate`) | Yes (`sticker.delete` — ignores `autoRecovery` toggle) | **Implemented but insufficiently tested** |
| 8 | **Anti Sticker Delete** | `antiStickerDelete` | `stickerDelete` | [`antiStickerDelete.js#L12-L76`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiStickerDelete.js#L12-L76) | Yes (`StickerDelete`) | Yes (`guild.stickers.create`) | **Implemented but insufficiently tested** |
| 9 | **Anti Sticker Update** | `antiStickerUpdate` | `stickerUpdate` | [`antiStickerUpdate.js#L12-L65`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiStickerUpdate.js#L12-L65) | Yes (`StickerUpdate`) | Yes (`newSticker.edit`) | **Implemented but insufficiently tested** |
| 10 | **Anti Guild Update** | `antiGuildUpdate` | `guildUpdate` | [`antiGuildUpdate.js#L12-L83`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiGuildUpdate.js#L12-L83) | Yes (`GuildUpdate`) | Yes (`newGuild.edit`) | **Implemented but insufficiently tested** |
| 11 | **Anti Role Create** | `antiRoleCreate` | `roleCreate` | [`antiRoleCreate.js#L12-L61`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiRoleCreate.js#L12-L61) | Yes (`RoleCreate`) | Yes (`role.delete` — ignores `autoRecovery` toggle) | **Partially implemented (Does not skip `role.managed` integration roles)** |
| 12 | **Anti Role Delete** | `antiRoleDelete` | `roleDelete` | [`antiRoleDelete.js#L12-L95`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiRoleDelete.js#L12-L95) | Yes (`RoleDelete`) | Yes (`blueprintManager.restoreRole`) | **Implemented but insufficiently tested** |
| 13 | **Anti Role Update** | `antiRoleUpdate` | `roleUpdate` | [`antiRoleUpdate.js#L12-L78`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiRoleUpdate.js#L12-L78) | Yes (`RoleUpdate`) | Yes (`newRole.edit`) | **Implemented but insufficiently tested** |
| 14 | **Anti Unban** | `antiUnban` | `guildBanRemove` | [`antiUnban.js#L12-L73`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiUnban.js#L12-L73) | Yes (`MemberBanRemove`) | Yes (`guild.members.ban(user.id)`) | **Implemented but insufficiently tested** |
| 15 | **Anti Webhook Update** | `antiWebhookUpdate` | `webhooksUpdates` (TYPO!) | [`antiWebhookUpdate.js#L14-L81`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiWebhookUpdate.js#L14-L81) | Yes (`WebhookCreate/Delete/Update`) | **No** (Created webhooks are NOT deleted except on CircuitBreaker trip) | **Broken or incorrectly wired (`webhooksUpdates` event typo + wrong cache key `guild.id`)** |
| 16 | **Anti Member Update** | `antiMemberUpdate` | `guildMemberUpdate` | [`antiMemberUpdate.js#L12-L96`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiMemberUpdate.js#L12-L96) | Yes (`MemberRoleUpdate`, `MemberUpdate`) | Yes (`roles.set`, `setNickname`, `timeout(null)`) | **Implemented but insufficiently tested** |
| 17 | **Anti Emoji Update** | `antiEmojiUpdate` | `emojiUpdate` | [`antiEmojiUpdate.js#L12-L63`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiEmojiUpdate.js#L12-L63) | Yes (`EmojiUpdate`) | Yes (`newEmoji.edit({ name: oldEmoji.name })`) | **Implemented but insufficiently tested** |
| 18 | **Anti Emoji Create** | `antiEmojiCreate` | `emojiCreate` | [`antiEmojiCreate.js#L12-L63`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiEmojiCreate.js#L12-L63) | Yes (`EmojiCreate`) | Yes (`emoji.delete`) | **Implemented but insufficiently tested** |
| 19 | **Anti Emoji Delete** | `antiEmojiDelete` | `emojiDelete` | [`antiEmojiDelete.js#L12-L74`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiEmojiDelete.js#L12-L74) | Yes (`EmojiDelete`) | Yes (`fetch(emoji.url)` + `guild.emojis.create`) | **Implemented but insufficiently tested** |
| 20 | **Anti Prune** | `antiPrune` | `guildAuditLogEntryCreate` | [`antiPrune.js#L11-L53`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPrune.js#L11-L53) | Yes (`Prune`) | No (Discord API limitation) | **Partially implemented (Relies on cached `entry.executor` at L23; skips uncached executors)** |
| 21 | **Anti Ping** | `antiPing` | `messageCreate` | [`antiPing.js#L12-L85`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L12-L85) | No (Not an audit log event) | Yes (`message.delete` + `bulkDelete(6)` on bot spam) | **Partially implemented (False-positive bans regular users mentioning 4 friends; does not delete webhook spammers)** |
| 22 | **Auto Recovery** | `autoRecovery` | Cross-cutting | [`blueprintManager.js`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/blueprintManager.js) + 10 handlers | Yes (`ChannelDelete`, `RoleDelete` in `raw`) | N/A | **Implemented but insufficiently tested** |
| 23 | **Zero-Trust Quarantine** | `zeroTrustQuarantine` | `guildMemberUpdate`, `roleUpdate`, `guildMemberAdd` | [`zeroTrustQuarantine.js#L63-L172`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/zeroTrustQuarantine.js#L63-L172) | Called inline from Channel/Role/Ban handlers | Yes (`roles.remove(dangerousRoles)`) | **Partially implemented (Cannot strip permissions from `role.managed === true` bot roles via `roles.remove`)** |
| 24 | **Circuit Breaker** | `circuitBreaker` | Cross-cutting incident counter | [`src/utils/circuitBreaker.js#L35-L147`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/utils/circuitBreaker.js#L35-L147) | Called from `raw`, `guildAuditLogEntryCreate`, and handlers | Purges webhooks <10m old, sets Verification Level 4, strips bot roles | **Partially implemented (Never restores `guild.verificationLevel` after 60s lockdown expires)** |

---

## 2. Detailed Per-Feature Findings & Anomalies

### 2.1 Broken Event Wiring in `antiWebhookUpdate.js`
- **File:** [`src/antinuke/antiWebhookUpdate.js#L14-L36`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiWebhookUpdate.js#L14-L36)
- **Defect 1 (Event Name Typo):** Line 14 registers `client.on('webhooksUpdates', ...)`. In `discord.js` v14 (`Events.WebhooksUpdate`), the event name is `'webhooksUpdate'` (singular `Update`). Because `'webhooksUpdates'` is never emitted by Discord.js, this listener is completely dead code.
- **Defect 2 (Wrong Cache Key):** Line 29 queries `client.auditLogCache.get(guild.id)`. However, `Roynix.js` stores keys as `${guild.id}_${action}_${targetId}` and `${guild.id}_${action}_any`. `client.auditLogCache.get(guild.id)` always returns `undefined`.
- **Defect 3 (No Webhook Deletion/Recovery):** Even when the `raw` or `guildAuditLogEntryCreate` fast-path bans the webhook creator, the newly created rogue webhook itself is **not** deleted unless the Circuit Breaker trips (2+ incidents in 2s). An attacker who creates 1 webhook can continue spamming through that webhook token without even being in the server.

### 2.2 Premature Bot Ban & Null Dereference in `antiBot.js`
- **File:** [`src/antinuke/antiBot.js#L30-L66`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiBot.js#L30-L66)
- **Defect 1 (Server Owner Bot Addition Blocked):** Lines 34–36 immediately execute `guild.bans.create(member.id)` **before** line 38 resolves `executor = await getAuditExecutor(guild, AuditLogEvent.BotAdd, member.id, client)`. If the **Server Owner** or an **Extra Owner** invites a legitimate bot without first adding the bot's ID to the whitelist, the bot is immediately banned upon joining!
- **Defect 2 (Null Executor Crash):** If `executor` resolves to `null` (e.g., audit log delay), line 41 skips punishing the inviter, but line 63 unconditionally evaluates `${executor.id}` and `${executor.tag}` inside the log embed, throwing `TypeError: Cannot read properties of null (reading 'id')`.

### 2.3 False-Positive Ban Risk & Webhook Blindness in `antiPing.js`
- **File:** [`src/antinuke/antiPing.js#L35-L61`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/antiPing.js#L35-L61)
- **Defect 1 (False-Positive Mass Mention Ban):** Line 35 defines `isMassPing` as:
  ```javascript
  const isMassPing = message.mentions.everyone || 
    ((message.mentions.users?.size || 0) + (message.mentions.roles?.size || 0) >= 4);
  ```
  Any normal server member who mentions 4 users in a single message (e.g., tagging 4 friends in a game lobby) immediately triggers `punishExecutor` and is **permanently banned** from the server.
- **Defect 2 (Webhook Mention Bypass):** When a webhook sends an `@everyone` ping, `message.webhookId` is present and `message.author.id` is the webhook's ID. `punishExecutor` attempts `guild.bans.create(webhookId)` (which fails because a webhook is not a user) and leaves the webhook alive to continue spamming `@everyone`.

### 2.4 Managed Role Blindness in `zeroTrustQuarantine.js`
- **File:** [`src/antinuke/zeroTrustQuarantine.js#L38-L48`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/zeroTrustQuarantine.js#L38-L48), [`#L81-L87`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/zeroTrustQuarantine.js#L81-L87), [`#L164-L171`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/antinuke/zeroTrustQuarantine.js#L164-L171)
- **Defect:** When a bot is invited via Discord OAuth2 with `permissions=8` (Administrator), Discord assigns those permissions to the bot's **managed integration role (`role.managed === true`)**. Discord's API forbids calling `member.roles.remove(managedRole)` or `member.roles.set([])` to remove a managed role (`DiscordAPIError[50028]: Invalid Role`). To neutralize an unwhitelisted bot's managed role, the code must call `role.setPermissions(0n)` on the managed role itself.
