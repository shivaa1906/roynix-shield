import express from 'express';
import os from 'os';
import process from 'process';
import { Roynix } from './base/Roynix.js';
import { info } from './utils/logger.js';
import getQuickDBPing from './utils/dbPing.js';
import getUptimeTimestamp from './utils/uptime.js';
/**
 * @param {import('discord.js').Client} client 
 */
export function createStatsAPI(client) {
    const router = express.Router();

    router.get('/stats', async (req, res) => {
        try {
            if (!client.isReady()) {
                return res.status(503).json({ error: 'Bot not ready' });
            }

            const start = Date.now();
            const dbPing = await getQuickDBPing(); 
            const clientPing = Date.now() - start;

            const stats = {
                version: "2.0.0",
                uptime: getUptimeTimestamp(client), 
                library: "discord.js",
                ping: {
                    api: client.ws.ping,
                    database: dbPing,
                    client: clientPing
                },
                counts: {
                    guilds: client.guilds.cache.size,
                    users: client.users.cache.size,
                    channels: client.channels.cache.size,
                    emojis: client.emojis.cache.size
                },
                shard: {
                    current: client.shard?.ids[0] || 0,
                    total: client.shard?.count || 1
                },
                system: {
                    memory: {
                        total: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
                        used: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
                        free: (os.freemem() / 1024 / 1024 / 1024).toFixed(2)
                    },
                    cpu: {
                        usage: (process.cpuUsage().user / 1024 / 1024).toFixed(2),
                        free: (100 - (os.loadavg()[0] * 10)).toFixed(2),
                        model: os.cpus()[0].model,
                        cores: os.cpus().length
                    }
                }
            };

            res.json(stats);
        } catch (error) {
            console.error('Stats API error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}


const client = new Roynix();
const app = express();
const PORT = process.env.API_PORT || 3000;

app.use('/api', createStatsAPI(client));

client.start().then(() => {
    if (!client.shard || client.shard.ids.includes(0)) {
        app.listen(PORT, () => {
            info(`Bot and API running on port ${PORT}`);
            info(`Access stats at: http://localhost:${PORT}/api/stats`);
        });
    }
});
