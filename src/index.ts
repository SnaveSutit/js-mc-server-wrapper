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

function watchForDeaths(server: OnlineMinecraftServer) {
	let intervalID: NodeJS.Timeout

	async function checkDeathCount() {
		// log('Checking for deaths...')
		await server.rcon.send('scoreboard players set #hc.deathCount deaths 0')
		await server.rcon.send('scoreboard players operation #hc.deathCount deaths > * deaths')
		const result = await server.rcon.send('execute if score #hc.deathCount deaths matches 1..')
		// log('Death check result: ' + result)
		if (!result.includes('passed')) return
		clearInterval(intervalID)
		log('{red-fg}{bold}Death detected! Resetting server...{/bold}{/red-fg}')
		server.rcon.send('title @a times 20 100 20')
		server.rcon.send('title @a title {"text": "Death Detected!","color":"red"}')
		server.rcon.send(
			'title @a subtitle {"text": "The server will reset in 10 seconds. Goodbye!","color":"red"}'
		)
		server.rcon.send(
			'execute as @a at @s run playsound minecraft:entity.wither.spawn player @s ~ ~ ~ 10 0.1'
		)
		setTimeout(async () => {
			await server.stop()
			await resetWorld(server).catch((err) => {
				log('Error while resetting world: ' + err)
			})
		}, 10000)
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

	const startupScript = process.platform === 'win32' ? 'start.bat' : 'start.sh'

	SERVER = new MinecraftServer({
		rootFolder: './server',
		startupScript,
		autoRestart: true,
		autoRestartDelay: 10000,
		rcon: {
			password: Math.random().toString(36).substring(2),
			port: 25575,
		},
		onOnline: (server) => {
			log('Server Online!')
			server.runCommand([
				'difficulty hard',
				'scoreboard objectives add deaths deathCount',
				'scoreboard objectives add health health',
				'scoreboard objectives setdisplay list health',
				'gamerule playersSleepingPercentage 1',
			])
			watchForDeaths(server)
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

void main().catch((e) => {
	screen.destroy()
	console.error(e)
	process.exit(1)
})
