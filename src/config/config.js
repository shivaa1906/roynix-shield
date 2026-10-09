import dotenv from "dotenv";
dotenv.config();

const config = {
    token: process.env.TOKEN || "",
    clientId: process.env.CLIENT_ID || "",
    prefix: process.env.PREFIX || '!',
    color: process.env.BOT_COLOR ? (isNaN(process.env.BOT_COLOR) ? process.env.BOT_COLOR : parseInt(process.env.BOT_COLOR)) : 2829616,
    owners: process.env.OWNERS ? process.env.OWNERS.split(',').map(id => id.trim()) : [
        '788970167907778562'
    ],
    developers: process.env.DEVELOPERS ? process.env.DEVELOPERS.split(',').map(id => id.trim()) : [
        '788970167907778562'
    ],
    banner: process.env.BANNER_URL || "https://cdn.discordapp.com/banners/1538404690516115497/a_7ef367f0038b96a432b57f94966152e5.gif?size=1024",
    links: {
        supportServer: process.env.SUPPORT_SERVER || "https://discord.gg/aq8BHc2Q",
    },
    webhooks: {
        error: process.env.ERROR_WEBHOOK_URL || "https://discordapp.com/api/webhooks/1406246759230869605/Hq81yIfQr3ApFOu77ZszhGxc9M3wTqB_lhoopS0p8a8x8-mu_3X7aO4e66aDrFyh6hrI",
    },
    spotify: {
        id: process.env.SPOTIFY_CLIENT_ID || '55bcd0f038b849bd866ddf7319c5d637',
        secret: process.env.SPOTIFY_CLIENT_SECRET || 'd461a94b021748d2baa8a84733c024a0'
    },
    lavalink: {
        name: process.env.LAVALINK_NAME || 'Roynix',
        url: process.env.LAVALINK_URL || 'new-york-node-1.vortexcloud.xyz:5002',
        auth: process.env.LAVALINK_AUTH || 'Npgontop',
        secure: process.env.LAVALINK_SECURE === 'true'
    }
};

export default config;
