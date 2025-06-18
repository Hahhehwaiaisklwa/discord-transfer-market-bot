commands/postcard.js
``>

4. Paste this code:

```js
import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs-extra';

export const data = new SlashCommandBuilder()
  .setName('postcard')
  .setDescription('Post a player card to the transfer market')
  .addStringOption(option =>
    option.setName('name').setDescription('Player name').setRequired(true))
  .addIntegerOption(option =>
    option.setName('price').setDescription('Price in dollars').setRequired(true))
  .addAttachmentOption(option =>
    option.setName('image').setDescription('Attach player card image').setRequired(true))
  .addBooleanOption(option =>
    option.setName('freeagent').setDescription('Is this player a free agent?').setRequired(true));

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const price = interaction.options.getInteger('price');
  const image = interaction.options.getAttachment('image');
  const isFreeAgent = interaction.options.getBoolean('freeagent');

  const embed = new EmbedBuilder()
    .setTitle(`📇 Player: ${name}`)
    .addFields(
      { name: '💰 Value', value: `$${price.toLocaleString()}`, inline: true },
      { name: '📍 Status', value: isFreeAgent ? 'Free Agent' : 'Owned by Team', inline: true }
    )
    .setImage(image.url)
    .setColor(isFreeAgent ? 0x00b0f4 : 0xff9e00)
    .setFooter({ text: isFreeAgent ? 'Available for direct purchase.' : 'Available for trade or direct offer.' });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`buy-${name}`)
      .setLabel('BUY')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!isFreeAgent)
  );

  if (!isFreeAgent) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`trade-${name}`)
        .setLabel('TRADE')
        .setStyle(ButtonStyle.Primary)
    );
  }

  await interaction.reply({ embeds: [embed], components: [buttons] });
}
