// index.cjs — Final Transfer Market Bot with BUY + DELETE + POSTCARD Support

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
const { data: postcardCommand, execute: postcardExecute } = require('./commands/postcard.cjs');

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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const TRANSFER_MARKET_CHANNEL_ID = process.env.TRANSFER_MARKET_CHANNEL_ID;
const TRANSACTION_LOG_CHANNEL_ID = process.env.TRANSFER_MARKET_LOG_CHANNEL_ID;

const GENERAL_MANAGER_ROLE_ID = process.env.GENERAL_MANAGER_ROLE_ID;
const PLAYER_ROLE_ID = process.env.PLAYER_ROLE_ID;
const FREE_AGENT_ROLE_ID = process.env.FREE_AGENT_ROLE_ID;

const playersPath = './players.json';
let players = {};
if (fs.existsSync(playersPath)) {
  players = JSON.parse(fs.readFileSync(playersPath));
}

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
    body: [releaseCommand.toJSON(), syncPlayersCommand.toJSON(), postcardCommand.toJSON()],
  });
  console.log('✅ Slash commands registered.');
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'syncplayers') {
        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ content: '❌ Only admins can run this command.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        await guild.members.fetch();

        const newPlayers = {};

        guild.members.cache.forEach(member => {
          if (member.roles.cache.has(PLAYER_ROLE_ID)) {
            let assignedTeam = null;
            for (const team in data) {
              if (member.roles.cache.has(data[team].roleId)) {
                assignedTeam = team;
                break;
              }
            }

            newPlayers[member.id] = {
              name: `<@${member.id}>`,
              team: assignedTeam,
              value: 150.0
            };
          }
        });

        fs.writeFileSync(playersPath, JSON.stringify(newPlayers, null, 2));
        players = newPlayers;

        await interaction.editReply({
          content: `✅ Synced ${Object.keys(newPlayers).length} players into players.json`
        });
      }

      if (interaction.commandName === 'release') {
        // keep existing release logic here
      }

      if (interaction.commandName === 'postcard') {
        return postcardExecute(interaction);
      }
    }

    if (interaction.isButton()) {
      const [action, ...rest] = interaction.customId.split('-');
      const playerName = rest.join('-');

      if (action === 'cancel_release') {
        return interaction.update({ content: '❌ Release canceled.', components: [] });
      }

      if (action === 'buy') {
        const gm = interaction.member;
        if (!gm.roles.cache.has(GENERAL_MANAGER_ROLE_ID)) {
          return interaction.reply({ content: '❌ Only general managers can buy players.', ephemeral: true });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_buy-${playerName}`)
            .setLabel(`Yes, buy ${playerName}`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`cancel_buy-${playerName}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: `Are you sure you want to buy **${playerName}**?`,
          components: [row],
          ephemeral: true
        });
      }

      if (action === 'cancel_buy') {
        return interaction.update({ content: '❌ Purchase cancelled.', components: [] });
      }

      if (action === 'confirm_buy') {
        const gm = interaction.member;
        const name = playerName;

        const teamName = Object.keys(data).find(team => gm.roles.cache.has(data[team].roleId));
        if (!teamName) {
          return interaction.update({ content: '❌ You are not assigned to a team.', components: [] });
        }

        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const cardMsg = messages.find(msg => msg.embeds[0]?.title?.includes(name));
        if (!cardMsg) {
          return interaction.update({ content: '❌ Could not find the card message.', components: [] });
        }

        const embed = cardMsg.embeds[0];
        const valueField = embed.fields.find(f => f.name.includes('Value'));
        const price = parseFloat(valueField?.value.replace(/[^0-9.]/g, '') || '0');

        data[teamName].balance -= price;
        fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));

        await cardMsg.delete();

        const teamChannelName = teamName.toLowerCase().replace(/ /g, '-');
        const teamChannel = interaction.guild.channels.cache.find(c => c.name === teamChannelName);
        if (teamChannel) {
          await teamChannel.send(`💸 **${name}** was purchased for **$${price.toFixed(2)}M**\n💰 New Balance: **$${data[teamName].balance.toFixed(2)}M**\n<@&${GENERAL_MANAGER_ROLE_ID}>`);
        }

        const logChannel = await client.channels.fetch(TRANSACTION_LOG_CHANNEL_ID);
        await logChannel.send(`🟢 **${name}** was bought by **${teamName}** for **$${price.toFixed(2)}M**.`);

        return interaction.update({ content: `✅ You bought **${name}** for $${price.toFixed(2)}M.`, components: [] });
      }

      if (action === 'delete' && interaction.customId.startsWith('delete-confirm')) {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`delete-yes-${playerName}`)
            .setLabel('Yes, delete')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`delete-no-${playerName}`)
            .setLabel('No')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: `❗ Are you sure you want to delete **${playerName}** from the market?`,
          components: [confirmRow],
          ephemeral: true
        });
      }

      if (action === 'delete' && interaction.customId.startsWith('delete-yes')) {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const cardMsg = messages.find(msg => msg.embeds[0]?.title?.includes(playerName));

        if (!cardMsg) {
          return interaction.update({ content: '❌ Could not find the card message.', components: [] });
        }

        await cardMsg.delete();
        return interaction.update({ content: `🗑️ **${playerName}** has been removed from the transfer market.`, components: [] });
      }

      if (action === 'delete' && interaction.customId.startsWith('delete-no')) {
        return interaction.update({ content: '❌ Deletion canceled.', components: [] });
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
