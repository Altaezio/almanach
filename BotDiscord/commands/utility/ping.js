const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const wait = require('node:timers/promises').setTimeout;
const { kikId } = require('../../config.json')

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    async execute(interaction) {
        await interaction.reply({ content: Math.random() < 0.1 ? 'Pute!' : 'Pong!' });
        if (Math.random() < 0.1 || interaction.user.id == kikId) {
            await wait(2_000);
            await interaction.followUp({ content: ':ninja:', flags: MessageFlags.Ephemeral });
            await interaction.deleteReply();
        }
    },
};