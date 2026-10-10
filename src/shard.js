import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import './deploy.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('unhandledRejection', (reason) => {
    console.error('[Master Sharding] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Master Sharding] Uncaught Exception:', err);
});

const manager = new ShardingManager(path.resolve(__dirname, 'index.js'), {
    totalShards: 2,
    token: process.env.TOKEN,
    respawn: true,
});

manager.on('shardCreate', shard => {
    console.log(`[SHARD] Launched Shard ${shard.id}`);

    shard.on('death', (proc) => {
        console.warn(`[Shard ${shard.id}] Process died (exit code: ${proc?.exitCode ?? 'unknown'}). Auto-respawning shard...`);
    });

    shard.on('disconnect', () => {
        console.warn(`[Shard ${shard.id}] Gateway disconnected. Attempting automatic reconnection...`);
    });

    shard.on('error', (err) => {
        console.error(`[Shard ${shard.id}] Shard error encountered:`, err);
    });

    shard.on('message', (msg) => {
        if (typeof msg === 'string') {
            console.log(`[Shard ${shard.id}] ${msg}`);
        }
    });
});

const shutdownShards = (signal) => {
    console.log(`[Master Sharding] Received ${signal}. Stopping all shards cleanly...`);
    manager.respawn = false;
    for (const shard of manager.shards.values()) {
        try {
            shard.respawn = false;
            shard.kill();
        } catch {}
    }
    process.exit(0);
};

process.once('SIGINT', () => shutdownShards('SIGINT'));
process.once('SIGTERM', () => shutdownShards('SIGTERM'));

manager.spawn({ timeout: -1 }).catch(err => {
    console.error('[Master Sharding] Error during shard spawn:', err);
});