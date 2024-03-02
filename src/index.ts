import fs from 'fs'
import pathjs from 'path'
import blessed from 'blessed'
import { getTimeFileName } from './util'
import deathMessages from './minecraft/deathMessages'
import { MinecraftServer, OnlineMinecraftServer } from './server'
import zip from './7z'

let SERVER: MinecraftServer

const screen = blessed.screen({
	smartCSR: true,
})

const consoleInput = blessed.textbox({
	height: 3,
	bottom: 0,
	content: '> ',
	border: {
		type: 'line',
	},
})

const consoleLog = blessed.box({
	bottom: 3,
	scrollable: true,
	tags: true,
})

const consoleContainer = blessed.box({
	width: '100%',
	height: '100%',
	children: [consoleLog, consoleInput],
})

screen.append(consoleContainer)

const logRegex =
	/^\[(?<hour>\d+):(?<minute>\d+):(?<second>\d+)\]\s+\[(?<thread>[\w \d-]+)\/(?<logType>\w+)\]:\s+(?<log>.+)/gm
function formatLog(data: string) {
	logRegex.lastIndex = 0
	const match = logRegex.exec(data)

	if (match) {
		let { hour, minute, second, thread, logType, log } = match.groups!
		let logColor = 'white'
		switch (logType) {
			case 'WARN':
				logType = `{/bold}{yellow-fg}${logType}{/yellow-fg}{bold}`
				logColor = 'yellow'
				break
			case 'ERROR':
				logType = `{red-fg}${logType}{/red-fg}`
				logColor = 'red'
				break
			default:
				logType = `{cyan-fg}${logType}{/cyan-fg}`
				break
		}
		return `{gray-fg}{bold}[${hour}:${minute}:${second}] [{cyan-fg}${thread}{/cyan-fg}/${logType}]:{/bold}{/gray-fg} {${logColor}-fg}${log}{/}`
	}

	return data
}

export function log(text: string) {
	consoleLog.setContent(consoleLog.content + '\n' + formatLog(text))
	consoleLog.setScrollPerc(100)
	screen.render()
}

function getInput() {
	consoleInput.readInput((err, value) => {
		if (err) {
			log(err)
		} else if (value !== undefined) {
			log('> ' + value)
			SERVER.runCommand(value)
			consoleInput.clearValue()
		}
	})
	setTimeout(() => {
		getInput()
	}, 100)
}

let startTime = 0

async function resetWorld(server: MinecraftServer) {
	log('Backing up World...')
	const worldPath = pathjs.join(server.options.rootFolder, 'world')
	const worldBackupPath = pathjs.join(
		server.options.rootFolder,
		'world-backups',
		'world ' + getTimeFileName() + '.zip'
	)
	const worldBackupFolder = pathjs.dirname(worldBackupPath)
	fs.mkdirSync(worldBackupFolder, { recursive: true })
	await zip(worldBackupPath, worldPath)
	const backups = await fs.promises.readdir(worldBackupFolder)
	if (backups.length > 10) {
		log('Too many backups. Deleting oldest backup...')
		const oldestBackup = backups.sort()[0]
		await fs.promises.rm(pathjs.join(worldBackupFolder, oldestBackup))
	}
	log('World backup complete. Erasing world...')
	await fs.promises.rm(worldPath, { recursive: true, force: true })
	log('World reset complete. Restarting server...')
	server.start()
}

async function showStats(server: OnlineMinecraftServer) {
	await server.rcon.send('tellraw @a {"text": "Game Over!","color":"red"}')
	await server.rcon.send('tellraw @a {"text": "This run\'s Stats:", "color":"red"}')
	const timeSurvived = Math.floor(Date.now() - startTime)
	let seconds = timeSurvived / 1000
	let minutes = Math.floor(seconds / 60)
	seconds = Math.floor(seconds % 60)
	let hours = Math.floor(minutes / 60)
	minutes = Math.floor(minutes % 60)
	await server.rcon.send(
		`tellraw @a [{"text": "You survived for ","color":"red"}, {"text": "${hours}:${minutes}:${seconds}","color":"aqua"}, {"text":"."}]`
	)
	// Kills
	await server.rcon.send('execute as @a run scoreboard players operation #hc.kills i += @s kills')
	await server.rcon.send(
		'tellraw @a [{"text": "You killed ","color":"red"}, {"score":{"name":"#hc.kills","objective":"i"},"color":"aqua"}, {"text":" mobs."}]'
	)
	// Distance traveled
	const distanceObjectives = [
		'sneakTravel',
		'walkTravel',
		'sprintTravel',
		'swimTravel',
		'flyTravel',
		'horseTravel',
		'pigTravel',
		'minecartTravel',
		'striderTravel',
		'walkOnWaterTravel',
		'walkUnderWaterTravel',
		'fallTravel',
		'boatTravel',
		'climbTravel',
	]
	for (const objective of distanceObjectives) {
		await server.rcon.send(
			`execute as @a run scoreboard players operation #hc.distance i += @s ${objective}`
		)
	}
	await server.rcon.send('scoreboard players operation #hc.distance i /= 100 i')
	await server.rcon.send(
		'tellraw @a [{"text": "You traveled a total of ","color":"red"}, {"score":{"name":"#hc.distance","objective":"i"},"color":"aqua"}, {"text":" blocks."}]'
	)
	// Damage dealt
	await server.rcon.send(
		'execute as @a run scoreboard players operation #hc.damageDealt i += @s damageDealt'
	)
	await server.rcon.send(
		'tellraw @a [{"text": "You dealt ","color":"red"}, {"score":{"name":"#hc.damageDealt","objective":"i"},"color":"aqua"}, {"text":" damage."}]'
	)
	// Damage taken
	await server.rcon.send(
		'execute as @a run scoreboard players operation #hc.damageTaken i += @s damageTaken'
	)
	await server.rcon.send(
		'tellraw @a [{"text": "You took ","color":"red"}, {"score":{"name":"#hc.damageTaken","objective":"i"},"color":"aqua"}, {"text":" damage."}]'
	)
	// Jumps
	await server.rcon.send(
		'execute as @a run scoreboard players operation #hc.jumps i += @s jumpCount'
	)
	await server.rcon.send(
		'tellraw @a [{"text": "You jumped ","color":"red"}, {"score":{"name":"#hc.jumps","objective":"i"},"color":"aqua"}, {"text":" times."}]'
	)
	// Items dropped
	await server.rcon.send(
		'execute as @a run scoreboard players operation #hc.drops i += @s dropItem'
	)
	await server.rcon.send(
		'tellraw @a [{"text": "You dropped ","color":"red"}, {"score":{"name":"#hc.drops","objective":"i"},"color":"aqua"}, {"text":" items."}]'
	)
}

function watchForDeaths(server: OnlineMinecraftServer) {
	let intervalID: NodeJS.Timeout

	async function checkDeathCount() {
		// log('Checking for deaths...')
		await server.rcon.send('scoreboard players set #hc.deathCount deaths 0')
		await server.rcon.send('scoreboard players operation #hc.deathCount deaths > * deaths')
		const result = await server.rcon.send('execute if score #hc.deathCount deaths matches 1..')
		// log('Death check result: ' + result)
		if (!(result.includes('passed') || result.includes('commands.execute.conditional.pass'))) return
		clearInterval(intervalID)
		log('{red-fg}{bold}Death detected! Resetting server...{/bold}{/red-fg}')
		await server.rcon.send('title @a times 20 100 20')
		await server.rcon.send('title @a title {"text": "Game Over!","color":"red"}')
		await server.rcon.send(
			'title @a subtitle {"text": "You have failed. Now you will suffer.","color":"red"}'
		)
		await server.rcon.send(
			'execute as @a at @s run playsound minecraft:entity.wither.spawn player @s ~ ~ ~ 10 0.1'
		)
		await showStats(server)
		// Count down 5 seconds before stopping the server
		for (let i = 0; i < 30; i++) {
			await server.rcon.send(
				`title @a actionbar {"text": "Server will stop in ${30 - i} seconds...","color":"red"}`
			)
			await new Promise(resolve => setTimeout(resolve, 1000))
		}
		await server.stop()
		await resetWorld(server).catch(err => {
			log('Error while resetting world: ' + err)
		})
	}

	intervalID = setInterval(async () => {
		if (!server.isOnline() || !server.isRCONConnected()) {
			clearInterval(intervalID)
			log('Server is offline. Stopping death check...')
			return
		}
		await checkDeathCount()
	}, 15000)
}

async function main() {
	screen.render()

	consoleInput.key(['C-q'], () => {
		if (!SERVER.isOnline()) {
			process.exit(0)
		}
		SERVER.stop().finally(() => {
			process.exit(0)
		})
	})

	consoleInput.key(['C-r'], () => {
		if (!SERVER.isOnline()) {
			log('Restarting server...')
			SERVER.start()
		}
	})

	consoleInput.key(['escape'], () => {
		SERVER.kill()
		process.exit(0)
	})

	getInput()

	const startupScript = process.platform === 'win32' ? 'start.bat' : './start.sh'

	SERVER = new MinecraftServer({
		rootFolder: './server',
		startupScript,
		autoRestart: true,
		autoRestartDelay: 10000,
		rcon: {
			password: Math.random().toString(36).substring(2),
			port: 25575,
		},
		onOnline: server => {
			startTime = Date.now()
			log('Server Online!')
			server.runCommand([
				'difficulty hard',
				'scoreboard objectives add deaths deathCount',
				'scoreboard objectives add health health',
				'scoreboard objectives setdisplay list health',
				'gamerule playersSleepingPercentage 1',
				'scoreboard objectives add kills totalKillCount',
				'scoreboard objectives add i dummy',
				'scoreboard players set 100 i 100',
				// Travel distance objectives
				'scoreboard objectives add sneakTravel minecraft.custom:minecraft.crouch_one_cm',
				'scoreboard objectives add walkTravel minecraft.custom:minecraft.walk_one_cm',
				'scoreboard objectives add sprintTravel minecraft.custom:minecraft.sprint_one_cm',
				'scoreboard objectives add swimTravel minecraft.custom:minecraft.swim_one_cm',
				'scoreboard objectives add flyTravel minecraft.custom:minecraft.aviate_one_cm',
				'scoreboard objectives add horseTravel minecraft.custom:minecraft.horse_one_cm',
				'scoreboard objectives add pigTravel minecraft.custom:minecraft.pig_one_cm',
				'scoreboard objectives add minecartTravel minecraft.custom:minecraft.minecart_one_cm',
				'scoreboard objectives add striderTravel minecraft.custom:minecraft.strider_one_cm',
				'scoreboard objectives add walkOnWaterTravel minecraft.custom:minecraft.strider_one_cm',
				'scoreboard objectives add walkUnderWaterTravel minecraft.custom:minecraft.walk_under_water_one_cm',
				// Special travel objectives
				'scoreboard objectives add fallTravel minecraft.custom:minecraft.fall_one_cm',
				'scoreboard objectives add boatTravel minecraft.custom:minecraft.boat_one_cm',
				'scoreboard objectives add climbTravel minecraft.custom:minecraft.climb_one_cm',

				'scoreboard objectives add jumpCount minecraft.custom:minecraft.jump',
				'scoreboard objectives add dropItem minecraft.custom:minecraft.drop',
				'scoreboard objectives add sneakTime minecraft.custom:minecraft.sneak_time',

				'scoreboard objectives add damageDealt minecraft.custom:minecraft.damage_dealt',
				'scoreboard objectives add damageTaken minecraft.custom:minecraft.damage_taken',
			])
			watchForDeaths(server)
			setTimeout(() => {
				// From the fog config changes.
				server.runCommand('function watching:config/sighting_chance/3_rare')
				server.runCommand('function watching:config/og_shrine/true')
				server.runCommand('function watching:config/start_delay/remove')
			}, 1000)
		},
		onShutdown: () => {
			log('Server stopped!')
			log('Press C-r to restart the server')
			log('Press C-q to exit')
		},
		log,
	})

	await SERVER.start()
}

void main().catch(e => {
	screen.destroy()
	console.error(e)
	process.exit(1)
})
