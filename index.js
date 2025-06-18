import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  await client.application.commands.set([...client.commands.map(cmd => cmd.data)], process.env.GUILD_ID);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ There was an error executing that command.', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);

