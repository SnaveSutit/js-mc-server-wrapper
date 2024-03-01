import { ChildProcess, spawn } from 'child_process'
import * as fs from 'fs'
import pathjs from 'path'
import properties from './properties'
import { Rcon } from 'rcon-client'
import internal from 'stream'

const SERVER_PROPERTIES_FILE = 'server.properties'

interface MinecraftServerProperties {
	[key: string]: any
}

interface MinecraftServerOptions {
	rootFolder: string
	startupScript: string
	autoRestart?: boolean
	autoRestartDelay?: number
	rcon: {
		password: string
		port: number
	}
	/**
	 * Called when the server process is started
	 */
	onStartup?: (serverProcess: ChildProcess) => void
	/**
	 * Called when the server process is fully booted and ready to accept RCON connections.
	 */
	onOnline?: (server: OnlineMinecraftServer) => void
	/**
	 * Called when the server process ends
	 */
	onShutdown?: () => void
	/**
	 * Custom logging function. Defaults to console.log
	 */
	log?: (message: string) => void
}

export type OnlineMinecraftServer = MinecraftServer & {
	rcon: Rcon
	process: ChildProcess & {
		stdout: internal.Readable
		stderr: internal.Readable
		stdin: internal.Writable
	}
}

export class MinecraftServer {
	public process: ChildProcess | undefined = undefined
	public rcon: Rcon | undefined = undefined
	public log: (message: string) => void = console.log

	constructor(public options: MinecraftServerOptions) {
		if (options.log) this.log = options.log
	}

	private _properties: MinecraftServerProperties | undefined = undefined
	private _serverRconOnline = false
	private _rconConnected = false
	private _serverOnline = false
	private _serverStarting = false

	public async start(): Promise<void> {
		if (this._serverStarting) return Promise.reject('Server is already starting')
		if (this.isOnline()) return Promise.reject('Server is already online')

		return new Promise<void>((resolve) => {
			this._serverStarting = true
			this._serverRconOnline = false
			this._rconConnected = false
			this._configureRCON()

			this.process = spawn(this.options.startupScript, {
				cwd: this.options.rootFolder,
				stdio: 'pipe',
				shell: true,
			})
				.on('exit', (code) => {
					this._onProcessExit(code || 0)
				})
				.on('error', (err) => {
					this._onProcessError(err)
				})
			this.process!.stdout!.on('data', (data) => {
				this._onProcesSTDout(data)
			})
			this.process!.stderr!.on('data', (data) => {
				this._onProcessSTDerr(data)
			})
			this._serverOnline = true
			this._serverStarting = false
			if (this.options.onStartup) this.options.onStartup(this.process!)
			this.log('Server process started!')
			resolve()
		}).catch((err) => {
			this.log('Failed to start server: ' + err)
		})
	}

	public async stop() {
		if (!this.isOnline()) return Promise.reject('Server is already offline')
		return new Promise<void>((resolve) => {
			this.process!.on('exit', () => {
				resolve()
			})
			this.process!.stdin!.write('stop\n')
		})
	}

	public async kill() {
		if (!this.isOnline()) return Promise.reject('Server is already offline')
		this.log('Killing server process...')
		return new Promise<void>((resolve) => {
			this.process!.on('exit', () => {
				resolve()
			})
			this.process!.kill('SIGINT')
		})
	}

	public isOnline() {
		if (!this._serverOnline) return false
		return this._serverOnline
	}

	public isRCONConnected() {
		return this._rconConnected
	}

	public write(input: string) {
		if (!this.isOnline()) throw new Error('Tried to write to a server that is not online')
		this.process?.stdin?.write(input)
	}

	public runCommand(command: string | string[]) {
		if (!this.isOnline())
			throw new Error('Tried to run a command on a server that is not online')
		if (Array.isArray(command)) {
			this.write(command.join('\n') + '\n')
			return
		}
		this.write(command + '\n')
	}

	public getProperty(key: string) {
		if (this._properties === undefined) {
			const content = fs.readFileSync(
				pathjs.join(this.options.rootFolder, SERVER_PROPERTIES_FILE),
				'utf-8'
			)
			this._properties = properties.parse(content)
		}
		return this._properties[key]
	}

	public setProperty(key: string, value: any) {
		if (this._properties === undefined) {
			this.getProperty(key)
		}
		this._properties![key] = value
		fs.writeFileSync(
			pathjs.join(this.options.rootFolder, SERVER_PROPERTIES_FILE),
			properties.stringify(this._properties!)
		)
	}

	private _configureRCON() {
		this.setProperty('enable-rcon', true)
		this.setProperty('broadcast-rcon-to-ops', false)
		this.setProperty('rcon.password', this.options.rcon.password)
		this.setProperty('rcon.port', this.options.rcon.port)
	}

	private async _connectToRcon() {
		if (!this._serverRconOnline)
			throw new Error('Attempted to connect RCON while server RCON is offline.')
		const client = await Rcon.connect({
			host: 'localhost',
			port: this.getProperty('rcon.port'),
			password: this.getProperty('rcon.password'),
		}).catch((err) => {
			this.log('Failed to connect to RCON: ' + err)
		})
		if (client) {
			this._rconConnected = true
			this.rcon = client
			this.log('RCON Connected!')
			this._onRCONConnected()
		} else {
			setTimeout(() => {
				this._connectToRcon()
			}, 1000)
		}
	}

	private _onRCONConnected() {
		if (this.options.onOnline) this.options.onOnline(this as OnlineMinecraftServer)
	}

	private _onProcessError(err: Error) {
		this._serverStarting = false
		this._serverOnline = false
		this._rconConnected = false
		this._serverRconOnline = false
		if (this.options.onShutdown) this.options.onShutdown()
		this.log('Server encountered an error: ' + err + '\n')
	}

	private _onProcessExit(code: number) {
		this._serverStarting = false
		this._serverOnline = false
		this._rconConnected = false
		this._serverRconOnline = false
		if (this.options.onShutdown) this.options.onShutdown()
		this.log('Server process exited with code ' + code)
	}

	private _onProcesSTDout(data: string) {
		const str = data.toString().trim()
		this.log(str)
		if (!this._serverRconOnline && str.includes('Thread RCON Listener started')) {
			this._serverRconOnline = true
			this.log('Server-side RCON Online!')
			void this._connectToRcon()
		} else if (this._serverRconOnline && str.includes('Thread RCON Listener offline')) {
			this._serverRconOnline = false
			this.log('Server-side RCON Offline!')
		}
	}

	private _onProcessSTDerr(data: string) {
		const str = data.toString().trim()
		this.log(str)
	}
}
