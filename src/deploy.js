import { InteractionContextType, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import { warn, info, error } from './utils/logger.js';
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.TOKEN;
const clientId = config.clientId;

if (!token || !clientId) {
    error('Missing TOKEN or CLIENT_ID in environment variables.');
    process.exit(1);
}

const globalCommands = [];
const commandsPath = path.join(__dirname, 'commands/slash');
const commandCategories = fs.readdirSync(commandsPath).filter(folder => 
    fs.statSync(path.join(commandsPath, folder)).isDirectory()
);

for (const category of commandCategories) {
    const categoryPath = path.join(commandsPath, category);
    const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(categoryPath, file);
        const fileUrl = new URL(`file://${filePath}`).href;

        try {
            const command = await import(fileUrl);
            
            if (command?.data?.data && command?.data?.execute) {
                globalCommands.push(command.data.data.setContexts(InteractionContextType.Guild).toJSON());
            } else {
                warn(`Skipping invalid command file: ${file} - Missing required properties`);
            }
        } catch (err) {
            error(`Error loading command file: ${file}`, err);
        }
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        info(`Starting deployment of ${globalCommands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: globalCommands }
        );

        info(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (err) {
        error('Error deploying commands:', err);
    }
})();