import childProcess from 'child_process'
import pathjs from 'path'
import { Rcon } from 'rcon-client'
import properties from './server/properties'
import fs from 'fs'
import { log } from '.'
import zip from './7z'
import { getTimeFileName } from './util'

interface ServerOptions {
	root: string
	autoRestart?: boolean
	autoRestartDelay?: number
	onStart?: (serverProcess: childProcess.ChildProcess) => void
	/**
	 * If true, the server will be in hardcore mode, but if a player dies, the server will stop, delete the world, then start up again.
	 */
	hardcoreButDeathEndsTheWorldMode?: boolean
}

export class Server {
	public serverProcess: childProcess.ChildProcess | undefined = undefined
	public properties: Record<string, any> = {}
	public stopped = false
	public rcon: Rcon | undefined

	private rconOnline = false
	private manuallyStopped = false

	constructor(private options: ServerOptions) {}

	public start() {
		if (this.isRunning()) return
		try {
			this.stopped = false
			this.manuallyStopped = false

			this.properties = this.readServerProperties()
			this.configureRCON()

			this.rconOnline = false

			let startScript = process.platform === 'win32' ? 'start.bat' : './start.sh'
			this.serverProcess = childProcess
				.spawn(startScript, {
					cwd: this.options.root,
					stdio: 'pipe',
					shell: true,
				})
				.on('error', (err) => {
					log('Error while starting server: ' + err + '\n')
				})
				.on('exit', () => {
					this.stopped = true
					this.rconOnline = false
					this.serverProcess = undefined
					if (!this.manuallyStopped && this.options.autoRestart) {
					}
				})

			this.serverProcess.stdout!.on('data', (data: string) => {
				const str = data.toString().trim()
				if (!this.rconOnline && str.includes('Thread RCON Listener started')) {
					this.rconOnline = true
					log('Server-side RCON Online!')
					this.connectToRcon()
				}
			})

			if (this.options.hardcoreButDeathEndsTheWorldMode) {
				const commands = [
					'difficulty hard\n',
					'scoreboard objectives add deaths deathCount\n',
					'scoreboard objectives add health health\n',
					'scoreboard objectives setdisplay list health\n',
					'gamerule playersSleepingPercentage 1\n',
				]
				commands.forEach((c) => this.runCommand(c))
			}

			if (this.options.onStart) {
				this.options.onStart(this.serverProcess)
			}
		} catch (err) {
			log('Error while starting server: ' + err + '\n')
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

	private async connectToRcon() {
		log('Connecting RCON...')
		const client = await Rcon.connect({
			host: 'localhost',
			port: this.properties['rcon.port'],
			password: this.properties['rcon.password'],
		}).catch((err) => {
			log('Error while connecting RCON: ' + err)
		})
		if (client) {
			this.rcon = client
			this.rconOnline = true
			log('RCON Connected!')
			this.onRconConnected()
		} else {
			setTimeout(() => {
				this.connectToRcon()
			}, 1000)
		}
	}

	private onRconConnected() {
		const intervalID = setInterval(() => {
			if (!this.rconOnline) {
				clearInterval(intervalID)
				log('RCON is offline. Stopping death check...')
				return
			}
			// log('Checking for deaths...')
			this.rcon!.send('execute as @a if score @s deaths matches 1..')
				.then((result) => {
					// console.log(`Result: ${result}`)
					if (!result.includes('passed')) return
					log('{red-fg}{bold}Death detected!{/bold}{/red-fg}')
					clearInterval(intervalID)
					this.rcon!.send(
						'tellraw @a {"text": "Death detected! The server will reset in 10 seconds. Goodbye!","color":"red"}'
					)
					setTimeout(() => {
						this.stop().then(() => {
							try {
								log('Backing up world...')
								const worldPath = pathjs.join(this.options.root, 'world')
								const worldBackupPath = pathjs.join(
									this.options.root,
									'world-backups',
									'world ' + getTimeFileName() + '.zip'
								)
								fs.mkdirSync(pathjs.dirname(worldBackupPath), { recursive: true })
								zip(worldBackupPath, worldPath).then(() => {
									const backups = fs.readdirSync(
										pathjs.join(this.options.root, 'world-backups')
									)
									if (backups.length > 10) {
										log('Too many backups. Deleting oldest backup...')
										const oldestBackup = backups.sort()[0]
										fs.rmSync(
											pathjs.join(
												this.options.root,
												'world-backups',
												oldestBackup
											)
										)
									}
									log('World backup complete. Resetting world...')
									fs.rmSync(pathjs.join(this.options.root, 'world'), {
										recursive: true,
										force: true,
									})
									log('World reset complete. Restarting server...')
									this.start()
								})
							} catch (err) {
								log('Error while resetting world: ' + err)
							}
						})
					}, 10000)
				})
				.catch((err) => {
					log('Error while checking for deaths: ' + err)
				})
		}, 15000)
	}

	private isRunning() {
		if (this.stopped) return false
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
