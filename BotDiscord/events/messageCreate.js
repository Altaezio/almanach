const { Events, MessageFlags } = require('discord.js');
const { clientId, thowId } = require('../config.json');

module.exports = {
    name: Events.MessageCreate,
    execute(message) {
        if (message.author.id == clientId)
            return;

        // --- FEUR RESPONSE --- //
        const quoiAnswer = ['feur', 'fure', 'feuse', 'tron', 'lity'];
        // console.log(`received message ${message.content}`);
        const strippedMsg = message.content.toLowerCase().replaceAll(/<.+>/gu, '').replaceAll(/\W/gu, '');
        // console.log(`as ${strippedMsg}`);
        if (strippedMsg.endsWith('quoi')) {
            message.reply({ content: quoiAnswer[Math.floor(Math.random() * quoiAnswer.length)] });
            if (message.author.id == thowId)
                message.reply({ content: 'feur, tiens un de plus pour toi :angry:', flags: MessageFlags.Ephemeral });
        }
        // --- //
    },
}
