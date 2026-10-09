import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { warn, info, error } from '../utils/logger.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async (client) => {
    client.events = new Collection();
    const loadedEvents = [];

    const loadEvents = async (dir) => {
        const folders = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());

        for (const folder of folders) {
            const folderPath = path.join(dir, folder);
            const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));

            for (const file of files) {
                const fileURL = pathToFileURL(path.join(folderPath, file));

                try {
                    const { data } = await import(fileURL);

                    if (!data.name || typeof data.execute !== 'function') {
                        warn(`Skipping invalid event: ${fileURL.href}`);
                        continue;
                    }

                    client.events.set(data.name, data);

                    const handler = (...args) => data.execute(...args, client);
                    data.once ? client.once(data.name, handler) : client.on(data.name, handler);

                    loadedEvents.push(`${chalk.magenta(data.name)} (${chalk.cyan(file)})`);
                } catch (err) {
                    error(`Error loading event at ${fileURL.href}: ${err.message}`);
                }
            }
        }
    };

    await loadEvents(path.join(__dirname, '../events'));

    info(`Loaded events:\n${loadedEvents.join('\n')}`);
};
