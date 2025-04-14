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
	almanachDataFiles
} = require('./settings.json');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
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
	let runningData = require('./data/RunningData.json');

	const currentTime = new Date();
	const hour = currentTime.getHours();
	if (hour == 0) {
		runningData.todayMessageSent = false;
		runningData.todayAnswerSent = false;
	}

	if (!runningData.todayMessageSent && hour >= almanachMessageSchedule) {
		const channel = client.channels.cache.get(almanachChannelId);
		if (channel) {
			const almanachFile = almanachDataFiles[Math.floor(almanachDataFiles.length * Math.random())];
			let almanachData = require('./data/' + 'AlmanachCasseTete.json');
			let chosenDay = almanachData.days[Math.floor(almanachData.days.length * Math.random())];
			while (runningData.lastMessages.findIndex((e) => e == chosenDay) != -1) {
				chosenDay = almanachData.days[Math.floor(almanachData.days.length * Math.random())];
			}
			let lastMessageData = {
				"date": currentTime.getTime(),
				"id": chosenDay.id,
				"file": almanachData.almanachFile,
				"upVotes": 0,
				"downVotes": 0
			};
			console.log(currentTime);
			runningData.lastMessages.unshift(lastMessageData);
			if (chosenDay.type == "citation") {
				let lines = chosenDay.text.split('\n');
				lines.forEach(element => {
					element = "> " + element;
				});
				chosenDay.text = lines.join('\n');
				chosenDay.text += chosenDay.author;
			}
			channel.send(chosenDay.text);
			runningData.todayMessageSent = true;
			if (chosenDay.type != "enigma") {
				runningData.todayAnswerSent = true;
			}
		}
	}
	if (!runningData.todayAnswerSent && hour >= almanachAnswerSchedule) {
		const channel = client.channels.cache.get(almanachChannelId);
		if (channel && runningData.lastMessages.length > 0) {
			let todayData = runningData.lastMessages[0];
			let todate = new Date(todayData.date);
			console.assert(currentTime.getDay() == todate.getDay(), "not the same day");
			let almanachData = require('./data/' + todayData.file);
			today = almanachData.days.find((e) => e.id == todayData.id);
			console.assert(today, "today of id " + todayData.id + " not found");
			if (today) {
				console.log(today);
				console.assert(today.type == "enigma", "not an enigma");
				channel.send(today.answer);
			}
			runningData.todayAnswerSent = true;
		}
	}

	const data = JSON.stringify(runningData, null, 4);
	fs.writeFileSync('./data/RunningData.json', data);
}, loopDelay);

client.login(token);
