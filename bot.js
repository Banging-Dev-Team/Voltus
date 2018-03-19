const { Client } = require("discord.js");
const reload = require("require-reload")(require);
const Sequelize = require("sequelize");

const auth = require("./Configuration/auth.json");
const config = require("./Configuration/config.json");

const client = new Client({
	disableEveryone: true,
});
const sequelize = new Sequelize(auth.db.name, auth.db.user, auth.db.pwd, {
	host: auth.db.host,
	dialect: "mysql",

	pool: {
		max: 5,
		min: 0,
		acquire: 30000,
		idle: 10000,
	},
});

let readytostart = false;
client.once("ready", async() => {
	console.log(`Logged in as ${client.user.tag}`);
	if (client.guilds.size === 0) console.log(`This bot isn't in any servers! Invite it using ${await client.generateInvite(["ADMINISTRATOR"])}`);
	client.user.setActivity("Starting...");
	await require("./Database/init.js")(client, sequelize);
	for (let g of client.guilds) {
		let doc;
		try {
			doc = await ServerConfigs.findOneById(g[1].id);
			if (!doc) throw new Error();
		} catch (err) {
			require("./Events/guildCreate")(client, g[1]);
		}
	}
	readytostart = true;
	console.log("Ready!");
});

Object.assign(String.prototype, {
	escapeRegex() {
		const matchOperators = /[|\\{}()[\]^$+*?.]/g;
		return this.replace(matchOperators, "\\$&");
	},
});

client.on("message", async msg => {
	if (!readytostart) return;
	if (msg.author.bot) return;
	let doc;
	if (msg.guild) {
		doc = await ServerConfigs.findOneById(msg.guild.id);
		if (!doc) throw new Error("Something went hideously wrong with the server config document for ", msg.guild.id);
	}
	if (msg.guild && !msg.content.startsWith(doc.get("prefix"))) return;

	const cmd = msg.content.split(" ")[0].trim().toLowerCase().replace(msg.guild ? doc.get("prefix") : "", "");
	const suffix = msg.content.split(" ").splice(1).join(" ")
		.trim();

	let cmdFile;
	if (msg.channel.type === "dm") {
		try {
			cmdFile = reload(`./Commands/DM/${cmd}.js`);
		} catch (_) {
			return null;
		}
	} else if (config.maintainers.includes(msg.author.id)) {
		try {
			cmdFile = reload(`./Commands/Private/${cmd}.js`);
		} catch (_) {
			try {
				cmdFile = reload(`./Commands/Public/${cmd}.js`);
			} catch (__) {
				return null;
			}
		}
	} else {
		try {
			cmdFile = reload(`./Commands/Public/${cmd}.js`);
		} catch (_) {
			return null;
		}
	}
	cmdFile(client, msg, suffix);
});

client.memberSearch = async(string, server) => new Promise((resolve, reject) => {
	let foundMember;
	string = string.trim();

	if (string.startsWith("<@!")) {
		foundMember = server.members.get(string.slice(3, -1));
	} else if (string.startsWith("<@")) {
		foundMember = server.members.get(string.slice(2, -1));
	} else if (!isNaN(string) && new RegExp(/^\d+$/).test(string)) {
		foundMember = server.members.get(string);
	} else if (string.startsWith("@")) {
		string = string.slice(1);
	}
	if (string.lastIndexOf("#") === string.length - 5 && !isNaN(string.substring(string.lastIndexOf("#") + 1))) {
		foundMember = server.members.filter(member => member.user.username === string.substring(0, string.lastIndexOf("#") + 1))
			.find(member => member.user.discriminator === string.substring(string.lastIndexOf("#") + 1));
	}
	if (!foundMember) {
		foundMember = server.members.find(member => member.user.username.toLowerCase() === string.toLowerCase());
	}
	if (!foundMember) {
		foundMember = server.members.find(member => member.nickname && member.nickname.toLowerCase() === string.toLowerCase());
	}
	if (foundMember) {
		resolve(foundMember);
	} else {
		reject(new Error("Failed to find member"));
	}
});


client.on("guildCreate", async guild => {
	require("./Events/guildCreate")(client, guild);
});

process.on("unhandledRejection", (_, promise) => console.log(require("util").inspect(promise, null, 2)));

client.login(auth.discord.token);
