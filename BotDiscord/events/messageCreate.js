const { Events, MessageFlags } = require('discord.js');

module.exports = {
    name: Events.MessageCreate,
    async execute(interaction) {
        const quoiAnswer = ["feur", "fure", "feuse", "tron", "lity"];

        if(interaction.)
        await interaction.reply({ content: quoiAnswer[Math.floor(Math.random() * quoiAnswer.length)] });
    },
}
