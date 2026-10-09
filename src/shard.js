import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import './deploy.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manager = new ShardingManager(path.resolve(__dirname, 'index.js'), {
    totalShards: 2,
    token: process.env.TOKEN,
});

manager.on('shardCreate', shard => {
    console.log(`[SHARD] Launched Shard ${shard.id}`);

    shard.on('message', (msg) => {
        if (typeof msg === 'string') {
            console.log(`[Shard ${shard.id}] ${msg}`);
        }
    });
});

manager.spawn({ timeout: -1 })