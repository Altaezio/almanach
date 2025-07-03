const { token, guildId, almanachChannelId } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');
const schedule = require('node-schedule');
const {
	Client,
	Collection,
	GatewayIntentBits,
} = require('discord.js');
const { almanachMessageSchedule,
	almanachAnswerSchedule,
	almanachDataFiles,
	daysBeforePickableAgain,
	upVoteReaction,
	downVoteReaction
} = require('./settings.json');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessageReactions,
	]
});

client.commands = new Collection();

// add commands
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// add event listeners
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

// loop every loopDelay for sending the almanachs messages
const job = schedule.scheduleJob('0 * * * *', async function () {
	const runningData = require('./data/RunningData.json');
	let dataChanged = false;

	const startExecTime = new Date();
	const hour = startExecTime.getHours();

	console.log('[' + startExecTime.toLocaleString('fr-FR') + ']: Current state: ' + runningData.state);

	if (runningData.state != 'startOfDay') {
		let newDay = false;
		if (runningData.lastMessages.length == 0) {
			newDay = true;
		}
		else {
			let lastMessageDate = new Date(runningData.lastMessages[0].date[0])
			if (lastMessageDate.getDay() != startExecTime.getDay()) {
				newDay = true;
			}
		}

		if (newDay) {
			dataChanged = true;
			runningData.state = 'startOfDay';
			const currentTime = new Date();
			console.log('[' + currentTime.toLocaleString('fr-FR') + ']: New day!');
		}
	}


	if (runningData.state == 'startOfDay' && hour >= almanachMessageSchedule) {
		const channel = client.channels.cache.get(almanachChannelId);
		if (channel === undefined) {
			return;
		}

		{
			const currentTime = new Date();
			console.log('[' + currentTime.toLocaleString('fr-FR') + ']: Sending message');
		}

		const almanachFile = almanachDataFiles[Math.floor(almanachDataFiles.length * Math.random())];
		const almanachData = require('./data/' + almanachFile);
		let chosenDay = almanachData.days[Math.floor(almanachData.days.length * Math.random())];
		let alreadyPicked = true;
		let lastMessageData = undefined;
		while (alreadyPicked) {
			alreadyPicked = false;
			lastMessageData = runningData.lastMessages.find(e => e.dayId == chosenDay.id);
			if (lastMessageData !== undefined) {
				const timeLastPicked = lastMessageData.date[0];
				const daysSinceLastPicked = (timeLastPicked - startExecTime.getTime()) / (1000 * 60 * 60 * 24);
				if (daysSinceLastPicked < daysBeforePickableAgain) {
					chosenDay = almanachData.days[Math.floor(almanachData.days.length * Math.random())];
					alreadyPicked = true;
				}
			}
		}
		if (lastMessageData === undefined) {
			lastMessageData = {
				'file': almanachFile,
				'dayId': chosenDay.id,
				'date': [startExecTime.getTime()]
			};
		}
		else {
			console.assert(lastMessageData.file == almanachFile, 'File changed');
			console.assert(lastMessageData.dayId == chosenDay.id, 'Id changed');
			lastMessageData.date.unshift(startExecTime.getTime());
		}

		if (chosenDay.type == 'citation') {
			const lines = chosenDay.text.split('\n');
			lines.forEach((element, index) => {
				if (element.length > 0)
					lines[index] = '> ' + element;
			});
			chosenDay.text = lines.join('\n');
			chosenDay.text += chosenDay.author; // assumes last line ended with a line break
		}

		runningData.state = 'messageSending';
		const data = JSON.stringify(runningData, null, 4);
		fs.writeFileSync(__dirname + './data/RunningData.json', data);
		await channel.send(chosenDay.text)
			.then((message) => {
				lastMessageData.messageId = message.id;
			});
		dataChanged = true;
		runningData.lastMessages.unshift(lastMessageData); // prepend
		runningData.state = 'messageSent';
		{
			const currentTime = new Date();
			console.log('[' + currentTime.toLocaleString('fr-FR') + ']: Message sent');
		}
		if (chosenDay.type != 'enigma') {
			runningData.state = 'answerSent';
		}
	}
	else if (runningData.state == 'messageSent' && hour >= almanachAnswerSchedule) {
		const channel = client.channels.cache.get(almanachChannelId);
		if (channel === undefined) {
			return;
		}
		if (runningData.lastMessages.length <= 0) {
			const currentTime = new Date();
			console.error('[' + currentTime.toLocaleString('fr-FR') + ']: No last message but wanted an anwser');
			return;
		}

		{
			const currentTime = new Date();
			console.log('[' + currentTime.toLocaleString('fr-FR') + ']: Sending answer');
		}

		const todayData = runningData.lastMessages[0];
		const todate = new Date(todayData.date[0]);
		console.assert(startExecTime.getDay() == todate.getDay(), 'not the same day');
		const almanachData = require('./data/' + todayData.file);
		today = almanachData.days.find((e) => e.id == todayData.dayId);
		if (today === undefined) {
			console.error('today of id ' + todayData.dayId + ' not found');
			return;
		}
		console.assert(today.type == 'enigma', 'not an enigma');

		runningData.state = 'answerSending';
		const data = JSON.stringify(runningData, null, 4);
		fs.writeFileSync(__dirname + './data/RunningData.json', data);
		const m = await channel.messages.fetch(todayData.messageId);
		if (typeof (m) === 'Message') {

			m.reply('||' + today.answer + '||');
		}
		else {
			if (Array.isArray(m)) {
				const message = m.find(e => e.id == todayData.messageId);
				if (message !== undefined) {
					m.reply('||' + today.answer + '||');
				}
				else {
					channel.send('||' + today.answer + '||');
				}
			}
			else {
				channel.send('||' + today.answer + '||');
			}
		}
		runningData.state = 'answerSent';
		dataChanged = true;

		{
			const currentTime = new Date();
			console.log('[' + currentTime.toLocaleString('fr-FR') + ']: Answer sent');
		}
	}

	if (dataChanged) {
		const data = JSON.stringify(runningData, null, 4);
		fs.writeFileSync(__dirname + './data/RunningData.json', data);

		{
			const currentTime = new Date();
			console.log('[' + currentTime.toLocaleString('fr-FR') + ']: Data changed save it');
		}
	}
});

client.login(token);
