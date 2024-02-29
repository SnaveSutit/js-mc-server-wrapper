import blessed from 'blessed'
import { Server } from './server'
import deathMessages from './minecraft/deathMessages'

let SERVER: Server

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

async function main() {
	screen.render()

	consoleInput.key(['C-q'], () => {
		if (SERVER.stopped) {
			process.exit(0)
		}
		SERVER.stop().finally(() => {
			process.exit(0)
		})
	})

	consoleInput.key(['C-r'], () => {
		if (SERVER.stopped) {
			log('Restarting server...')
			SERVER.start()
		}
	})

	getInput()

	SERVER = new Server({
		root: './server',
		autoRestart: true,
		autoRestartDelay: 10000,
		hardcoreButDeathEndsTheWorldMode: true,
		onStart: (serverProcess) => {
			serverProcess.on('exit', () => {
				log('Server stopped!')
				log('Press C-r to restart the server')
				log('Press C-q to exit')
			})
			serverProcess.stderr!.on('data', (data: string) => {
				const str = data.toString().trim()
				log(str)
			})
			serverProcess.stdout!.on('data', (data: string) => {
				const str = data.toString().trim()
				log(str)
			})
		},
	})

	SERVER.start()
}

void main().catch((e) => {
	screen.destroy()
	console.error(e)
	process.exit(1)
})
