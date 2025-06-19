const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const TRANSFER_MARKET_CHANNEL_ID = process.env.TRANSFER_MARKET_CHANNEL_ID;
const TEAM_BALANCES_CHANNEL_ID = process.env.TEAM_BALANCES_CHANNEL_ID;
const TRANSACTION_LOG_CHANNEL_ID = process.env.TRANSFER_MARKET_LOG_CHANNEL_ID;

const GENERAL_MANAGER_ROLE_ID = process.env.GENERAL_MANAGER_ROLE_ID;
const PLAYER_ROLE_ID = process.env.PLAYER_ROLE_ID;
const FREE_AGENT_ROLE_ID = process.env.FREE_AGENT_ROLE_ID;

// Load or initialize player data
const playersPath = './players.json';
let players = {};
if (fs.existsSync(playersPath)) {
  players = JSON.parse(fs.readFileSync(playersPath));
}

// Load team-role mapping and balances
const data = require('./data.json');

client.commands = new Collection();

const releaseCommand = new SlashCommandBuilder()
  .setName('release')
  .setDescription('Release a player to free agency')
  .addUserOption(option =>
    option.setName('player').setDescription('Player to release').setRequired(true)
  );

const syncPlayersCommand = new SlashCommandBuilder()
  .setName('syncplayers')
  .setDescription('Sync players.json with all users that have the Player role');

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [releaseCommand.toJSON(), syncPlayersCommand.toJSON()],
  });

  console.log('✅ Slash commands registered.');
});

client.on('interactionCreate', async interaction => {
  try {
    // /syncplayers
    if (interaction.isChatInputCommand() && interaction.commandName === 'syncplayers') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Only admins can run this command.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      await guild.members.fetch();

      const newPlayers = {};

      guild.members.cache.forEach(member => {
        if (member.roles.cache.has(PLAYER_ROLE_ID)) {
          newPlayers[member.id] = {
            name: `<@${member.id}>`,
            team: null,
            value: 150.0,
          };
        }
      });

      fs.writeFileSync(playersPath, JSON.stringify(newPlayers, null, 2));
      players = newPlayers;

      await interaction.editReply({
        content: `✅ Synced ${Object.keys(newPlayers).length} players into players.json`,
      });
    }

    // /release
    if (interaction.isChatInputCommand() && interaction.commandName === 'release') {
      const gm = interaction.member;
      const target = interaction.options.getUser('player');
      const targetMember = await interaction.guild.members.fetch(target.id);

      if (!gm.roles.cache.has(GENERAL_MANAGER_ROLE_ID)) {
        return interaction.reply({ content: '❌ Only general managers can release players.', ephemeral: true });
      }

      const gmTeam = Object.keys(data).find(team => gm.roles.cache.has(data[team].roleId));
      if (!gmTeam) {
        return interaction.reply({ content: '❌ You are not assigned to any team.', ephemeral: true });
      }

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
        ephemeral: true,
      });
    }

    // Button: confirm or cancel release
    if (interaction.isButton()) {
      const [action, playerId] = interaction.customId.split(':');

      if (action === 'cancel_release') {
        return interaction.update({ content: '❌ Release canceled.', components: [] });
      }

      if (action === 'confirm_release') {
        const gm = interaction.member;
        const playerData = players[playerId];
        if (!playerData) return interaction.update({ content: '❌ Player not found.', components: [] });

        const gmTeam = Object.keys(data).find(team => gm.roles.cache.has(data[team].roleId));
        if (!gmTeam || playerData.team !== gmTeam) {
          return interaction.update({ content: '❌ You cannot release this player.', components: [] });
        }

        const refund = playerData.value * 0.5;
        data[gmTeam].balance += refund;

        const targetMember = await interaction.guild.members.fetch(playerId);
        await targetMember.roles.remove(data[gmTeam].roleId);
        await targetMember.roles.add(FREE_AGENT_ROLE_ID);

        playerData.team = null;
        fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));

        try {
          await targetMember.send(`You have been released from the **${gmTeam}** and placed on the transfer market for **$${playerData.value.toFixed(2)}M**.`);
        } catch (e) {
          console.log(`❌ Failed to DM ${playerData.name}`);
        }

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

        const balanceChannel = await client.channels.fetch(TEAM_BALANCES_CHANNEL_ID);
        await balanceChannel.send(`💰 ${gmTeam} balance updated: **$${data[gmTeam].balance.toLocaleString()}**`);

        const logChannel = await client.channels.fetch(TRANSACTION_LOG_CHANNEL_ID);
        await logChannel.send(`📄 ${playerData.name} released by ${gmTeam}. Refund: **$${refund.toFixed(2)}M**.`);

        return interaction.update({ content: `✅ ${playerData.name} released to free agency.`, components: [] });
      }
    }
  } catch (err) {
    console.error('❌ Error in interaction handler:', err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ An error occurred.', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Bot error occurred.', ephemeral: true });
    }
  }
});

client.login(TOKEN);
