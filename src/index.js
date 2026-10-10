import express from 'express';
import os from 'os';
import process from 'process';
import { Roynix } from './base/Roynix.js';
import { FastDB } from './utils/fastDb.js';
import { info } from './utils/logger.js';
import getQuickDBPing from './utils/dbPing.js';
import getUptimeTimestamp from './utils/uptime.js';
import { startKeepAlive } from './utils/keepAlive.js';
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
// Prioritize process.env.PORT for cloud platforms (Render, Railway, Fly.io, Heroku)
const PORT = process.env.PORT || process.env.API_PORT || 3000;

// Root endpoint: Immediate 200 OK for platform health checks
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'online',
        service: 'Roynix Shield',
        ready: client.isReady(),
        ping: client.ws?.ping ?? -1,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// Dedicated health & ping endpoints
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.use('/api', createStatsAPI(client));

let httpServer = null;

// Bind immediately on Shard 0 (or unsharded) to satisfy platform health checks within seconds
if (!client.shard || client.shard.ids.includes(0)) {
    httpServer = app.listen(PORT, '0.0.0.0', () => {
        info(`[Web Service] Roynix Shield listening on 0.0.0.0:${PORT}`);
        info(`[Web Service] Health check: http://0.0.0.0:${PORT}/health`);
        info(`[Web Service] Stats API: http://0.0.0.0:${PORT}/api/stats`);

        // Start automated keep-alive engine
        startKeepAlive(PORT);
    });
}

let shuttingDown = false;
async function handleProcessShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    info(`[Process] Received ${signal}. Flushing SQLite WAL and shutting down cleanly...`);
    try {
        if (httpServer) {
            httpServer.close();
        }
    } catch {}
    try {
        await client.shutdown(signal);
    } catch {}
    try {
        FastDB.closeAll();
    } catch {}
    process.exit(0);
}

process.once('SIGINT', () => handleProcessShutdown('SIGINT'));
process.once('SIGTERM', () => handleProcessShutdown('SIGTERM'));

client.start().catch((err) => {
    console.error('Failed to start client:', err);
});
