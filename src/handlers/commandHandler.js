import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { warn, info, error } from '../utils/logger.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async (client) => {
    client.commands = new Collection();
    client.prefix = new Collection();
    const loadedCommands = [];

    const loadCommands = async (dir, isPrefix) => {
        if (!fs.existsSync(dir)) {
            warn(`Directory does not exist: ${dir}`);
            return;
        }

        const folders = fs.readdirSync(dir).filter(folder => 
            fs.statSync(path.join(dir, folder)).isDirectory()
        );

        for (const folder of folders) {
            const folderPath = path.join(dir, folder);
            const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                const fileURL = pathToFileURL(filePath).href;

                try {
                    const command = await import(fileURL);

                    if (isPrefix) {
                        if (!command.data?.name || typeof command.data.execute !== 'function') {
                            warn(`Skipping invalid prefix command: ${filePath}`);
                            continue;
                        }

                        client.prefix.set(command.data.name, command.data);
                        const aliases = Array.isArray(command.data.aliases) ? command.data.aliases : [];
                        aliases.forEach(alias => client.prefix.set(alias, command.data));
                        loadedCommands.push(`Prefix: ${chalk.blue(command.data.name)}${aliases.length ? ` (Aliases: ${chalk.blue(aliases.join(', '))})` : ''}`);
                    } else {
                        if (!command.data?.data?.name || typeof command.data.execute !== 'function') {
                            warn(`Skipping invalid slash command: ${filePath}`);
                            continue;
                        }

                        client.commands.set(command.data.data.name, command.data);
                        loadedCommands.push(`Slash: ${chalk.green(command.data.data.name)}`);
                    }
                } catch (err) {
                    error(`Error loading command at ${filePath}: ${err.message}`);
                }
            }
        }
    };

    try {
        await loadCommands(path.join(__dirname, '../commands/slash'), false);
        await loadCommands(path.join(__dirname, '../commands/prefix'), true);
        info(`Loaded commands:\n${loadedCommands.join('\n')}`);
    } catch (err) {
        error(`Error loading commands: ${err.message}`);
    }
};