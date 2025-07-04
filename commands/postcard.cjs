const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postcard')
    .setDescription('Post a player card to the transfer market')
    .addStringOption(option =>
      option.setName('name').setDescription('Player name').setRequired(true))
    .addNumberOption(option =>
      option.setName('price').setDescription('Price in millions (e.g., 218.64)').setRequired(true))
    .addAttachmentOption(option =>
      option.setName('image').setDescription('Attach player card image').setRequired(true))
    .addBooleanOption(option =>
      option.setName('freeagent').setDescription('Is this player a free agent?').setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const price = interaction.options.getNumber('price');
    const image = interaction.options.getAttachment('image');
    const isFreeAgent = interaction.options.getBoolean('freeagent');

    const priceDisplay = parseFloat(price.toFixed(2)).toString() + 'M';

    const embed = new EmbedBuilder()
      .setTitle(`📇 Player: ${name}`)
      .addFields(
        { name: '💰 Value', value: `$${priceDisplay}`, inline: true },
        { name: '📍 Status', value: isFreeAgent ? 'Free Agent' : 'Owned by Team', inline: true }
      )
      .setImage(image.url)
      .setColor(isFreeAgent ? 0x00b0f4 : 0xff9e00)
      .setFooter({ text: isFreeAgent ? 'Available for direct purchase.' : 'Available for trade or direct offer.' });

    const row = new ActionRowBuilder();

    if (isFreeAgent) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`buy-${name}`)
          .setLabel('BUY')
          .setStyle(ButtonStyle.Success)
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`trade-${name}`)
          .setLabel('TRADE')
          .setStyle(ButtonStyle.Primary)
      );
    }

    const posted = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    const deleteRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`delete-confirm-${name}-${posted.channel.id}-${posted.id}`)
        .setLabel('DELETE')
        .setStyle(ButtonStyle.Danger)
    );

    await posted.edit({ components: [row, deleteRow] });
  }
};
