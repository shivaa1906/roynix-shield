# Roynix Shield Bot Setup Guide

## Prerequisites

Before setting up the bot, ensure you have the following installed:

- Node js ( v 12 and higher )

## Installation

1. **Clone the repository:**

   ```sh
   git clone https://github.com/Itz-Npg/roynix.git
   cd roynix
   ```

2. **Install the required Python packages:**

   ```sh
    npm install
   ```

3. **Set up the environment variables:**

   Create a `.env` file in the

secrets

directory with the following content:

```env
TOKEN = "BOT_TOKEN",
CLIENT_ID = "CLIENT ID"
```

## Running the Bot

1. **Start the bot:**

   ```sh
   node src/shard.js
   ```

2. **Verify the bot is running:**

   Check the bot's status in your Discord server. It should be online and responsive to commands.

## Additional Configuration

### Setting Up Modules

You can set up various modules using the bot's commands. Here are some examples:


- **AntiNuke Module:**

  ```sh
  -antinuke enable
  ```

- **Logging Module:**

  ```sh
    -logging setup
  ```

- **Join 2 Create**
  ``` sh
     -j2c setup
  ```

- **Welcomer Module:**

  ```sh
    -welcome setup
  ```

- **Activity Roles Module:**

  ```sh
  -activityrole add
  ```

## Support

For support, join our [Discord server](https://discord.gg/XA4VZMYsbP) or contact us via [email](mailto:npgearly@gmail.com).

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## As this bot is discontinued you can use but make sure to give credit to Kyxen and Roynix bot team if found using without credit legal action will be taken

Thank you for using Roynix Bot!
