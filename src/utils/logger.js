import chalk from "chalk";

export function warn(message) {
    console.log(chalk.yellowBright(`[WARNING]: [${new Date().toISOString()}] ${message}`));
}

export function info(message) {
    console.log(chalk.greenBright(`[INFO]: [${new Date().toISOString()}] ${message}`));
}

export function error(message) {
    console.log(chalk.redBright(`[ERROR]: [${new Date().toISOString()}] ${message}`));
}
