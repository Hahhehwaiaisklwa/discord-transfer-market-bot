import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs-extra';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});

const DATA_FILE = './data.json';

// Load balances
let balances = fs.existsSync(DATA_FILE) ? fs.readJsonSync(DATA_FILE) : {
  "Portland Trailblazers": 1000000000,
  "San Antonio Spurs": 1000000000,
  "Golden State Warriors": 1000000000,
  "Boston Celtics": 1000000000,
  "Indiana Pacers": 1000000000,
  "Cleveland Cavaliers": 1000000000,
  "Miami Heat": 1000000000,
  "Washington Wizards": 1000000000
};

// Save balances
const saveBalances = () => fs.writeJsonSync(DATA_FILE, balances);

// On Ready
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// More logic will be added here soon

client.login(process.env.DISCORD_TOKEN);
