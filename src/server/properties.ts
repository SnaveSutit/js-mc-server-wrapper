function parseValue(value: string) {
	if (value === '') {
		return null
	}
	try {
		return JSON.parse(value)
	} catch {
		return value
	}
}

function stringifyValue(value: any) {
	if (value === null) {
		return ''
	} else if (typeof value === 'object' || typeof value === 'number') {
		return JSON.stringify(value)
	} else {
		return value
	}
}

function parse(data: string) {
	const output: Record<string, any> = {}

	for (let line of data.split('\n')) {
		line = line.trim()
		if (line[0] === '#') continue
		const parts = line.split('=')
		if (parts.length !== 2) continue
		const key = parts[0].trim(),
			value = parts[1].trim()

		output[key] = parseValue(value)
	}

	return output
}

function stringify(data: Record<string, any>) {
	return Object.entries(data)
		.map(([key, value]) => `${key}=${stringifyValue(value)}`)
		.join('\n')
}

export default {
	parse,
	stringify,
}
