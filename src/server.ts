import childProcess from 'child_process'
import pathjs from 'path'
// import RCONClient from './rcon/client'
import properties from './server/properties'
import fs from 'fs'
import { log } from '.'

interface ServerOptions {
	root: string
	autoRestart?: boolean
	autoRestartDelay?: number
	onStart?: (serverProcess: childProcess.ChildProcess) => void
}

export class Server {
	public serverProcess: childProcess.ChildProcess | undefined = undefined
	// public rcon: RCONClient
	public properties: Record<string, any> = {}
	public stopped = false
	private manuallyStopped = false

	constructor(private options: ServerOptions) {}

	public start() {
		if (this.isRunning()) return
		this.stopped = false
		this.manuallyStopped = false

		this.properties = this.readServerProperties()
		this.configureRCON()

		this.serverProcess = childProcess.spawn(`start.bat`, {
			cwd: this.options.root,
			stdio: 'pipe',
		})

		this.serverProcess.on('exit', () => {
			this.stopped = true

			if (!this.manuallyStopped && this.options.autoRestart) {
			}
		})

		if (this.options.onStart) {
			this.options.onStart(this.serverProcess)
		}
	}

	public stop() {
		if (!this.isRunning()) return Promise.resolve()
		return new Promise<void>((resolve) => {
			this.serverProcess!.on('exit', () => {
				resolve()
			})
			this.manuallyStopped = true
			this.serverProcess!.stdin!.write('stop\n')
		})
	}

	public runCommand(command: string) {
		if (!this.isRunning()) return
		this.serverProcess!.stdin!.write(command + '\n')
	}

	private isRunning() {
		if (this.serverProcess === undefined) {
			this.stopped = true
			return false
		}
		return true
	}

	private configureRCON() {
		this.properties['enable-rcon'] = true
		this.properties['broadcast-rcon-to-ops'] = false
		this.properties['rcon.port'] = 25575
		this.properties['rcon.password'] = Math.random().toString(36).substring(2)
		this.writeServerProperties()
	}

	private readServerProperties() {
		const contents = fs.readFileSync(
			pathjs.join(this.options.root, 'server.properties'),
			'utf-8'
		)
		return properties.parse(contents)
	}

	private writeServerProperties() {
		const contents = properties.stringify(this.properties)
		fs.writeFileSync(pathjs.join(this.options.root, 'server.properties'), contents)
	}
}
