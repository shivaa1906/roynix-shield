import emojis from '../config/emojis.js';

export const antinukeModules = [
    { name: 'Anti Bot', key: 'antiBot', aliases: ['bot', 'antibot'], description: 'Prevents unauthorized bots from being added' },
    { name: 'Anti Ban', key: 'antiBan', aliases: ['ban', 'antiban'], description: 'Prevents unauthorized member bans' },
    { name: 'Anti Kick', key: 'antiKick', aliases: ['kick', 'antikick'], description: 'Prevents unauthorized member kicks' },
    { name: 'Anti Channel Create', key: 'antiChannelCreate', aliases: ['channelcreate', 'antichannelcreate', 'cc'], description: 'Prevents unauthorized channel creation' },
    { name: 'Anti Channel Delete', key: 'antiChannelDelete', aliases: ['channeldelete', 'antichanneldelete', 'cd'], description: 'Prevents unauthorized channel deletion' },
    { name: 'Anti Channel Update', key: 'antiChannelUpdate', aliases: ['channelupdate', 'antichannelupdate', 'cu'], description: 'Prevents unauthorized channel modifications' },
    { name: 'Anti Sticker Create', key: 'antiStickerCreate', aliases: ['stickercreate', 'antistickercreate'], description: 'Prevents unauthorized sticker creation' },
    { name: 'Anti Sticker Delete', key: 'antiStickerDelete', aliases: ['stickerdelete', 'antistickerdelete'], description: 'Prevents unauthorized sticker deletion' },
    { name: 'Anti Sticker Update', key: 'antiStickerUpdate', aliases: ['stickerupdate', 'antistickerupdate'], description: 'Prevents unauthorized sticker modifications' },
    { name: 'Anti Guild Update', key: 'antiGuildUpdate', aliases: ['guildupdate', 'antiguildupdate', 'serverupdate'], description: 'Prevents unauthorized server setting changes' },
    { name: 'Anti Role Create', key: 'antiRoleCreate', aliases: ['rolecreate', 'antirolecreate', 'rc'], description: 'Prevents unauthorized role creation' },
    { name: 'Anti Role Delete', key: 'antiRoleDelete', aliases: ['roledelete', 'antiroledelete', 'rd'], description: 'Prevents unauthorized role deletion' },
    { name: 'Anti Role Update', key: 'antiRoleUpdate', aliases: ['roleupdate', 'antiroleupdate', 'ru'], description: 'Prevents unauthorized role modifications' },
    { name: 'Anti Unban', key: 'antiUnban', aliases: ['unban', 'antiunban'], description: 'Prevents unauthorized unbanning of members' },
    { name: 'Anti Webhook Update', key: 'antiWebhookUpdate', aliases: ['webhook', 'webhookupdate', 'antiwebhook', 'antiwebhookupdate'], description: 'Prevents unauthorized webhook creation/edits' },
    { name: 'Anti Member Update', key: 'antiMemberUpdate', aliases: ['memberupdate', 'antimemberupdate'], description: 'Prevents unauthorized role assignments' },
    { name: 'Anti Emoji Update', key: 'antiEmojiUpdate', aliases: ['emojiupdate', 'antiemojiupdate'], description: 'Prevents unauthorized emoji edits' },
    { name: 'Anti Emoji Create', key: 'antiEmojiCreate', aliases: ['antiemojicreate', 'emojicreate'], description: 'Prevents unauthorized emoji creation' },
    { name: 'Anti Emoji Delete', key: 'antiEmojiDelete', aliases: ['antiemojidelete', 'emojidelete'], description: 'Prevents unauthorized emoji deletion' },
    { name: 'Anti Prune', key: 'antiPrune', aliases: ['prune', 'antiprune'], description: 'Prevents unauthorized member pruning' },
    { name: 'Anti Ping', key: 'antiPing', aliases: ['ping', 'antiping', 'everyone', 'here'], description: 'Prevents unauthorized mass mentions' },
    { name: 'Auto Recovery', key: 'autoRecovery', aliases: ['recovery', 'autorecovery', 'restore'], description: 'Automatically restores deleted/modified channels & roles' }
];

/**
 * Find a module by key, name, or alias
 * @param {string} query
 * @returns {object|null}
 */
export function findModule(query) {
    if (!query) return null;
    const clean = query.toString().toLowerCase().replace(/[\s\-_]/g, '');
    return antinukeModules.find(m =>
        m.key.toLowerCase() === clean ||
        m.name.toLowerCase().replace(/[\s\-_]/g, '') === clean ||
        m.aliases?.some(a => a.toLowerCase().replace(/[\s\-_]/g, '') === clean)
    ) || null;
}

/**
 * Format active protection events listing with corresponding toggle switch
 * @param {string[]} [disabledEvents=[]]
 * @returns {string}
 */
export function renderEventsList(disabledEvents = []) {
    const disabledList = Array.isArray(disabledEvents) ? disabledEvents : [];
    return antinukeModules.map(mod => {
        const isEnabled = !disabledList.includes(mod.key);
        const icon = isEnabled ? emojis.enabled : emojis.disabled;
        return `> ${icon} **${mod.name}**`;
    }).join('\n');
}
