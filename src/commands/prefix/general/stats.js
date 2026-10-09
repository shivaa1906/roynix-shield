import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
  } from 'discord.js';
  import getQuickDBPing from '../../../utils/dbPing.js';
  import getUptimeTimestamp from '../../../utils/uptime.js';
  import emojis from '../../../config/emojis.js';
  import os from 'os';
  import process from 'process';
  
  export const data = {
    name: 'stats',
    description: 'Shows detailed statistics of the bot',
    async execute(message, args, client) {
      const selectionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('global').setLabel('Global').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('shard').setLabel('Shard').setStyle(ButtonStyle.Danger),
      );
  
      const msg = await message.reply({
        content: 'Choose the type of statistics you want to view:',
        components: [selectionRow]
      });
  
      const selectionCollector = msg.createMessageComponentCollector({ time: 15000 });
  
      selectionCollector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) {
          return i.reply({
            content: "Only the command author can use these buttons.",
            flags: MessageFlags.Ephemeral
          });
        }
  
        const type = i.customId;
        selectionCollector.stop(); 
  
        const startTime = Date.now();
        const [apiPing, dbPing, memoryUsage] = await Promise.all([
          client.ws.ping,
          getQuickDBPing(),
          process.memoryUsage()
        ]);
        const clientPing = Date.now() - startTime;
  
        const startCpuUsage = process.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 500));
        const endCpuUsage = process.cpuUsage();
        const cpuPercent = (((endCpuUsage.user - startCpuUsage.user) / 1000) / 500).toFixed(2);
  
        const cpuInfo = os.cpus()[0];
        const loadAvg = os.loadavg()[0];
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
  
        const version = "2.0.0";
        const uptime = getUptimeTimestamp(client);
        const shardId = client.shard?.ids[0] || 0;
  
        let guildCount, userCount, channelCount, emojiCount;
        if (type === 'global' && client.shard) {
          const results = await client.shard.broadcastEval(c => ({
            guildCount: c.guilds.cache.size,
            userCount: c.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
            channelCount: c.channels.cache.size,
            emojiCount: c.emojis.cache.size
          }));
          guildCount = results.reduce((a, r) => a + r.guildCount, 0);
          userCount = results.reduce((a, r) => a + r.userCount, 0);
          channelCount = results.reduce((a, r) => a + r.channelCount, 0);
          emojiCount = results.reduce((a, r) => a + r.emojiCount, 0);
        } else {
          guildCount = client.guilds.cache.size;
          userCount = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
          channelCount = client.channels.cache.size;
          emojiCount = client.emojis.cache.size;
        }
  
        const embeds = {
          general: new EmbedBuilder()
            .setAuthor({ name: `Roynix Shield Statistics (${type.toUpperCase()})`, iconURL: client.user.displayAvatarURL() })
            .setDescription([
              `${emojis.general} __**General Information**__`,
              `> **Bot Version**: \`${version}\``,
              `> **Bot Mention**: ${client.user}`,
              `> **Library**: \`discord.js v14.19.3\``,
              `> **Uptime**: ${uptime}`,
              `> **WebSocket Ping**: \`${apiPing}ms\``,
              `> **Client Ping**: \`${clientPing}ms\``,
              `> **Database Ping**: \`${dbPing}ms\``,
              `> **Shard ID**: \`${shardId}\``,
              `> **Guilds**: \`${guildCount}\``,
              `> **Users**: \`${userCount}\``,
              `> **Channels**: \`${channelCount}\``,
              `> **Emojis**: \`${emojiCount}\``
            ].join('\n'))
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setColor(client.color),
  
          system: new EmbedBuilder()
            .setAuthor({ name: 'System Statistics', iconURL: client.user.displayAvatarURL() })
            .setDescription([
              `${emojis.system} __**System Information**__`,
              `> **OS**: \`${os.platform()} ${os.arch()}\``,
              `> **CPU**: \`${cpuInfo.model}\``,
              `> **Cores**: \`${os.cpus().length}\``,
              `> **CPU Usage**: \`${cpuPercent}%\``,
              `> **Load Average**: \`${loadAvg.toFixed(2)}\``,
              `> **Total Memory**: \`${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB\``,
              `> **Used Memory**: \`${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)}GB\``,
              `> **Free Memory**: \`${(freeMem / 1024 / 1024 / 1024).toFixed(2)}GB\``,
              `> **Process Memory**: \`${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB\``,
              `> **Heap Used**: \`${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB\``
            ].join('\n'))
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setColor(client.color),
  
          team: new EmbedBuilder()
            .setAuthor({ name: 'Team Information', iconURL: client.user.displayAvatarURL() })
            .setDescription([
              `### ${emojis.member} __**Development Team**__`,
              `${emojis.developer} **Developers:**`,
              `- [shiva](https://discord.com/users/788970167907778562) (\`788970167907778562\`)`
            ].join('\n'))
            .setColor(client.color)
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setThumbnail(client.user.displayAvatarURL())
        };
  
        const getNavRow = (active) => new ActionRowBuilder().addComponents(
          ['general', 'system', 'team'].map(id =>
            new ButtonBuilder()
              .setCustomId(id)
              .setLabel(id.charAt(0).toUpperCase() + id.slice(1))
              .setStyle(id === active ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(false)
          )
        );
  
        await i.update({
          content: null,
          embeds: [embeds.general],
          components: [getNavRow('general')]
        });
  
        const collector = msg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async (btn) => {
          if (btn.user.id !== message.author.id)
            return btn.reply({ content: "Only the command author can use these buttons.", flags: MessageFlags.Ephemeral });
  
          const currentEmbed = embeds[btn.customId];
          await btn.update({
            embeds: [currentEmbed],
            components: [getNavRow(btn.customId)]
          });
        });
  
        collector.on('end', () => {
          const disabledRow = new ActionRowBuilder().addComponents(
            ['general', 'system', 'team'].map(id =>
              new ButtonBuilder()
                .setCustomId(id)
                .setLabel(id.charAt(0).toUpperCase() + id.slice(1))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            )
          );
          msg.edit({ components: [disabledRow] }).catch(() => {});
        });
      });
  
      selectionCollector.on('end', async (reason) => {
        if (reason === 'time') {
          await msg.edit({
            content: 'Selection timed out. Please run the command again.',
            components: []
          }).catch(() => {});
        }
      });
    }
  };
  