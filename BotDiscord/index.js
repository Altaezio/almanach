const { token, guildId, almanachChannelId } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');
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
const loopDelay = 5; //30 * 60 * 1000; // 30min
setInterval(async () => {
	const runningData = require('./data/RunningData.json');
	let dataChanged = false;

	const currentTime = new Date();
	const hour = currentTime.getHours();
	if (hour == 0) {
		dataChanged = true;
		runningData.state = 'startOfDay';
	}

	if (runningData.state == 'startOfDay' && hour >= almanachMessageSchedule) {
		const channel = client.channels.cache.get(almanachChannelId);
		if (channel === undefined) {
			return;
		}

		runningData.state = 'fetchingVotes';
		const dataVotes = JSON.stringify(runningData, null, 4);
		fs.writeFileSync('./data/RunningData.json', dataVotes);
		if (runningData.lastMessages.length > 0) {
			const lastMessageData = runningData.lastMessages[0];
			let message = await channel.messages.fetch(lastMessageData.messageId);
			if (typeof (message) !== 'Message' && Array.isArray(message)) {
				message = message.find(e => e.id == lastMessageData.messageId);
			}
			if (message !== undefined) {
				dataChanged = true;
				await message.reactions.cache.forEach(async (reaction) => {
					const emojiName = reaction._emoji.name
					const emojiCount = reaction.count
					const reactionUsers = await reaction.users.fetch();
					if (emojiName === upVoteReaction) {
						lastMessageData.upVotes += emojiCount - 1;
					}
					else if (emojiName === downVoteReaction) {
						lastMessageData.downVotes += emojiCount - 1;
					}
				});
			}
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
				const daysSinceLastPicked = (timeLastPicked - currentTime.getTime()) / (1000 * 60 * 60 * 24);
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
				'date': [currentTime.getTime()],
				'upVotes': 0,
				'downVotes': 0
			};
		}
		else {
			console.assert(lastMessageData.file == almanachFile, "File changed");
			console.assert(lastMessageData.dayId == chosenDay.id, "Id changed");
			lastMessageData.date.unshift(currentTime.getTime());
		}

		if (chosenDay.type == 'citation') {
			const lines = chosenDay.text.split('\n');
			lines.forEach(element => {
				element = '> ' + element;
			});
			chosenDay.text = lines.join('\n');
			chosenDay.text += chosenDay.author; // assumes last line ended with a line break
		}

		runningData.state = 'messageSending';
		const data = JSON.stringify(runningData, null, 4);
		fs.writeFileSync('./data/RunningData.json', data);
		await channel.send(chosenDay.text)
			.then((message) => {
				lastMessageData.messageId = message.id;
				message.react(upVoteReaction);
				message.react(downVoteReaction);
			});
		dataChanged = true;
		runningData.lastMessages.unshift(lastMessageData); // prepend
		runningData.state = 'messageSent';
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
			console.error('No last message but wanted an anwser');
			return;
		}

		const todayData = runningData.lastMessages[0];
		const todate = new Date(todayData.date[0]);
		console.assert(currentTime.getDay() == todate.getDay(), 'not the same day');
		const almanachData = require('./data/' + todayData.file);
		today = almanachData.days.find((e) => e.id == todayData.dayId);
		if (today === undefined) {
			console.error('today of id ' + todayData.dayId + ' not found');
			return;
		}
		console.assert(today.type == 'enigma', 'not an enigma');

		runningData.state = 'answerSending';
		const data = JSON.stringify(runningData, null, 4);
		fs.writeFileSync('./data/RunningData.json', data);
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
	}

	if (dataChanged) {
		const data = JSON.stringify(runningData, null, 4);
		fs.writeFileSync('./data/RunningData.json', data);
	}
}, loopDelay);

client.login(token);
