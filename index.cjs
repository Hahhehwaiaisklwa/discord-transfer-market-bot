// Discord Transfer Market Bot (Discord.js v14)
// Fully supports /release command with confirmation, team balances, player database, transfer market listing

const { Client, GatewayIntentBits, Partials, Collection, SlashCommandBuilder, Routes, REST, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const TOKEN = 'YOUR_BOT_TOKEN';
const CLIENT_ID = 'YOUR_CLIENT_ID';
const GUILD_ID = 'YOUR_GUILD_ID';

// Channel IDs
const TRANSFER_MARKET_CHANNEL_ID = 'CHANNEL_ID_TRANSFER_MARKET';
const TEAM_BALANCES_CHANNEL_ID = 'CHANNEL_ID_BALANCES';
const TRANSACTION_LOG_CHANNEL_ID = 'CHANNEL_ID_LOG';

// Role IDs
const GENERAL_MANAGER_ROLE_ID = 'ROLE_ID_GENERAL_MANAGER';
const PLAYER_ROLE_ID = 'ROLE_ID_PLAYER';
const FREE_AGENT_ROLE_ID = 'ROLE_ID_FREE_AGENT';

// --- In-memory database ---
const teams = {
  "Lakers": { roleId: 'ROLE_ID_LAKERS', balance: 1000000000 },
  "Celtics": { roleId: 'ROLE_ID_CELTICS', balance: 1000000000 },
  // Repeat for all 30 teams
};

const players = {
  // userId: { name, team, value }
};

client.commands = new Collection();

const releaseCommand = new SlashCommandBuilder()
  .setName('release')
  .setDescription('Release a player to free agency')
  .addUserOption(option =>
    option.setName('player')
      .setDescription('Player to release')
      .setRequired(true)
  );

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [releaseCommand.toJSON()]
  });

  console.log('✅ Slash commands registered.');
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'release') {
      const gm = interaction.member;
      const target = interaction.options.getUser('player');
      const targetMember = interaction.guild.members.cache.get(target.id);

      if (!gm.roles.cache.has(GENERAL_MANAGER_ROLE_ID)) {
        return interaction.reply({ content: '❌ Only general managers can release players.', ephemeral: true });
      }

      const gmTeam = Object.keys(teams).find(team => gm.roles.cache.has(teams[team].roleId));
      if (!gmTeam) return interaction.reply({ content: '❌ You are not assigned to any team.', ephemeral: true });

      const playerData = players[target.id];
      if (!playerData || playerData.team !== gmTeam) {
        return interaction.reply({ content: '❌ That player is not on your team.', ephemeral: true });
      }

      const refund = playerData.value * 0.5;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_release:${target.id}`)
          .setLabel('Yes, release')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_release')
          .setLabel('No, cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `Are you sure you want to release **${playerData.name}**?\nYou will receive **$${refund.toFixed(2)}M** back.`,
        components: [row],
        ephemeral: true
      });
    }
  }

  if (interaction.isButton()) {
    const [action, playerId] = interaction.customId.split(':');

    if (action === 'cancel_release') {
      return interaction.update({ content: '❌ Release canceled.', components: [] });
    }

    if (action === 'confirm_release') {
      const gm = interaction.member;
      const playerData = players[playerId];
      if (!playerData) return interaction.update({ content: '❌ Player not found.', components: [] });

      const gmTeam = Object.keys(teams).find(team => gm.roles.cache.has(teams[team].roleId));
      if (!gmTeam || playerData.team !== gmTeam) return interaction.update({ content: '❌ You cannot release this player.', components: [] });

      const refund = playerData.value * 0.5;
      teams[gmTeam].balance += refund;

      const targetMember = await interaction.guild.members.fetch(playerId);
      await targetMember.roles.remove(teams[gmTeam].roleId);
      await targetMember.roles.add(FREE_AGENT_ROLE_ID);

      playerData.team = null;

      // DM player
      try {
        await targetMember.send(`You have been released from the **${gmTeam}** and placed on the transfer market for **$${playerData.value.toFixed(2)}M**.`);
      } catch (e) {
        console.log(`DM failed for ${playerData.name}`);
      }

      // Post to transfer market
      const embed = new EmbedBuilder()
        .setTitle(`${playerData.name}`)
        .addFields(
          { name: 'Status', value: 'Free Agent', inline: true },
          { name: 'Value', value: `$${playerData.value.toFixed(2)}M`, inline: true }
        )
        .setColor('Green');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`buy:${playerId}`)
          .setLabel('BUY')
          .setStyle(ButtonStyle.Success)
      );

      const marketChannel = await client.channels.fetch(TRANSFER_MARKET_CHANNEL_ID);
      await marketChannel.send({ embeds: [embed], components: [row] });

      // Update team balances
      const balanceChannel = await client.channels.fetch(TEAM_BALANCES_CHANNEL_ID);
      await balanceChannel.send(`✅ ${gmTeam} balance updated: **$${teams[gmTeam].balance.toLocaleString()}**`);

      // Log transaction
      const logChannel = await client.channels.fetch(TRANSACTION_LOG_CHANNEL_ID);
      await logChannel.send(`📝 ${playerData.name} released by ${gmTeam}. Refund: **$${refund.toFixed(2)}M**.`);

      return interaction.update({ content: `✅ ${playerData.name} released to free agency.`, components: [] });
    }
  }
});

client.login(TOKEN);
