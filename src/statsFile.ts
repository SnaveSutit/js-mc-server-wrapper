import * as fs from 'fs'

const STATS_FILE_PATH = 'stats.json'

export class StatsFile {
	public deaths: number = 0
	public totalTimePlayed: number = 0

	constructor() {}

	public read() {
		if (!fs.existsSync(STATS_FILE_PATH)) {
			return
		}
		const data = JSON.parse(fs.readFileSync(STATS_FILE_PATH, 'utf8'))
		this.deaths = data.deaths
		this.totalTimePlayed = data.totalTimePlayed
	}

	public write() {
		const data = JSON.stringify({
			deaths: this.deaths,
			totalTimePlayed: this.totalTimePlayed,
		})
		fs.writeFileSync(STATS_FILE_PATH, data)
	}
}
