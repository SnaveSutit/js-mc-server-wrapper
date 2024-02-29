import { exec } from 'child_process'

export default function zip(zipName: string, target: string) {
	return new Promise<void>((resolve, reject) => {
		switch (process.platform) {
			case 'win32':
				return exec(
					`$7zipPath = "$env:programFiles/7-Zip/7z.exe"; if (-not (Test-Path -Path $7zipPath -PathType Leaf)) { throw "7 zip file '$7zipPath' not found" }; Set-Alias 7z $7zipPath; 7z a "${zipName}" "${target}"`,
					{ shell: 'powershell.exe' }
				).on('exit', (code) => {
					resolve()
				})
			case 'linux':
				return exec(`7z a "${zipName}" "${target}"`).on('exit', (code) => {
					resolve()
				})
		}
	})
}
