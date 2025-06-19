import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import fs from 'fs-extra';

export const data = new SlashCommandBuilder()
  .setName('editcard')
  .setDescription('Edit a posted player card in the transfer market')
  .addStringOption(option =>
    option.setName('message_id')
      .setDescription('The message ID of the card post to update')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('price')
      .setDescription('New price (optional)'))
  .addAttachmentOption(option =>
    option.setName('image')
      .setDescription('New image file (optional)'))
  .addBooleanOption(option =>
    option.setName('freeagent')
      .setDescription('Update free agent status (optional)'));

export async function execute(interaction) {
  const messageId = interaction.options.getString('message_id');
  const newPrice = interaction.options.getInteger('price');
  const newImage = interaction.options.getAttachment('image');
  const newFreeAgent = interaction.options.getBoolean('freeagent');

  const channel = interaction.channel;

  try {
    const message = await channel.messages.fetch(messageId);
    const originalEmbed = message.embeds[0];

    if (!originalEmbed) {
      return interaction.reply({ content: '❌ No embed found in that message.', ephemeral: true });
    }

    const name = originalEmbed.title?.replace('📇 Player: ', '') || 'Unknown Player';
    const oldPriceField = originalEmbed.fields.find(f => f.name.includes('Value'));
    const oldPrice = parseInt(oldPriceField?.value.replace(/[^0-9]/g, '') || '0', 10);
    const oldStatusField = originalEmbed.fields.find(f => f.name.includes('Status'));
    const wasFreeAgent = oldStatusField?.value.toLowerCase().includes('free agent');

    const updatedPrice = newPrice ?? oldPrice;
    const updatedImage = newImage?.url ?? originalEmbed.image?.url;
    const updatedFreeAgent = newFreeAgent ?? wasFreeAgent;

    const updatedEmbed = new EmbedBuilder()
      .setTitle(`📇 Player: ${name}`)
      .addFields(
        { name: '💰 Value', value: `$${updatedPrice.toLocaleString()}`, inline: true },
        { name: '📍 Status', value: updatedFreeAgent ? 'Free Agent' : 'Owned by Team', inline: true }
      )
      .setImage(updatedImage)
      .setColor(updatedFreeAgent ? 0x00b0f4 : 0xff9e00)
      .setFooter({ text: updatedFreeAgent ? 'Available for direct purchase.' : 'Available for trade or direct offer.' });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`buy-${name}`)
        .setLabel('BUY')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!updatedFreeAgent)
    );

    if (!updatedFreeAgent) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`trade-${name}`)
          .setLabel('TRADE')
          .setStyle(ButtonStyle.Primary)
      );
    }

    await message.edit({ embeds: [updatedEmbed], components: [buttons] });

    await interaction.reply({ content: `✅ Card for **${name}** updated.`, ephemeral: true });

  } catch (error) {
    console.error(error);
    return interaction.reply({ content: '❌ Could not find or edit that message.', ephemeral: true });
  }
}
