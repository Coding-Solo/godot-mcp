/**
 * Godot executable path detection and validation
 */

import { existsSync } from 'fs';
import { normalize } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logDebug } from '../utils/validation.js';

const execAsync = promisify(exec);

/**
 * GodotPathManager handles detection and validation of Godot executable paths
 */
export class GodotPathManager {
	private godotPath: string | null = null;
	private validatedPaths: Map<string, boolean> = new Map();
	private strictPathValidation: boolean = false;

	constructor(customPath?: string, strictPathValidation: boolean = false) {
		this.strictPathValidation = strictPathValidation;

		if (customPath) {
			const normalizedPath = normalize(customPath);
			this.godotPath = normalizedPath;
			logDebug(`Custom Godot path provided: ${this.godotPath}`);

			// Validate immediately with sync check
			if (!this.isValidGodotPathSync(this.godotPath)) {
				console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
				this.godotPath = null; // Reset to trigger auto-detection later
			}
		}
	}

	/**
	 * Get the current Godot path
	 */
	getGodotPath(): string | null {
		return this.godotPath;
	}

	/**
	 * Synchronous validation for constructor use
	 * This is a quick check that only verifies file existence, not executable validity
	 * Full validation will be performed later in detectGodotPath
	 * @param path Path to check
	 * @returns True if the path exists or is 'godot' (which might be in PATH)
	 */
	private isValidGodotPathSync(path: string): boolean {
		try {
			logDebug(`Quick-validating Godot path: ${path}`);
			return path === 'godot' || existsSync(path);
		} catch (error) {
			logDebug(`Invalid Godot path: ${path}, error: ${error}`);
			return false;
		}
	}

	/**
	 * Validate if a Godot path is valid and executable
	 */
	async isValidGodotPath(path: string): Promise<boolean> {
		// Check cache first
		if (this.validatedPaths.has(path)) {
			return this.validatedPaths.get(path)!;
		}

		try {
			logDebug(`Validating Godot path: ${path}`);

			// Check if the file exists (skip for 'godot' which might be in PATH)
			if (path !== 'godot' && !existsSync(path)) {
				logDebug(`Path does not exist: ${path}`);
				this.validatedPaths.set(path, false);
				return false;
			}

			// Try to execute Godot with --version flag
			const command = path === 'godot' ? 'godot --version' : `"${path}" --version`;
			await execAsync(command);

			logDebug(`Valid Godot path: ${path}`);
			this.validatedPaths.set(path, true);
			return true;
		} catch (error) {
			logDebug(`Invalid Godot path: ${path}, error: ${error}`);
			this.validatedPaths.set(path, false);
			return false;
		}
	}

	/**
	 * Detect the Godot executable path based on the operating system
	 */
	async detectGodotPath(): Promise<void> {
		// If godotPath is already set and valid, use it
		if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
			logDebug(`Using existing Godot path: ${this.godotPath}`);
			return;
		}

		// Check environment variable next
		if (process.env.GODOT_PATH) {
			const normalizedPath = normalize(process.env.GODOT_PATH);
			logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
			if (await this.isValidGodotPath(normalizedPath)) {
				this.godotPath = normalizedPath;
				logDebug(`Using Godot path from environment: ${this.godotPath}`);
				return;
			} else {
				logDebug(`GODOT_PATH environment variable is invalid`);
			}
		}

		// Auto-detect based on platform
		const osPlatform = process.platform;
		logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);

		const possiblePaths: string[] = [
			'godot', // Check if 'godot' is in PATH first
		];

		// Add platform-specific paths
		if (osPlatform === 'darwin') {
			possiblePaths.push(
				'/Applications/Godot.app/Contents/MacOS/Godot',
				'/Applications/Godot_4.app/Contents/MacOS/Godot',
				`${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
				`${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
				`${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`
			);
		} else if (osPlatform === 'win32') {
			possiblePaths.push(
				'C:\\Program Files\\Godot\\Godot.exe',
				'C:\\Program Files (x86)\\Godot\\Godot.exe',
				'C:\\Program Files\\Godot_4\\Godot.exe',
				'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
				`${process.env.USERPROFILE}\\Godot\\Godot.exe`
			);
		} else if (osPlatform === 'linux') {
			possiblePaths.push(
				'/usr/bin/godot',
				'/usr/local/bin/godot',
				'/snap/bin/godot',
				`${process.env.HOME}/.local/bin/godot`
			);
		}

		// Try each possible path
		for (const path of possiblePaths) {
			const normalizedPath = normalize(path);
			if (await this.isValidGodotPath(normalizedPath)) {
				this.godotPath = normalizedPath;
				logDebug(`Found Godot at: ${normalizedPath}`);
				return;
			}
		}

		// If we get here, we couldn't find Godot
		logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
		console.warn(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
		console.warn(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

		if (this.strictPathValidation) {
			// In strict mode, throw an error
			throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
		} else {
			// Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
			if (osPlatform === 'win32') {
				this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
			} else if (osPlatform === 'darwin') {
				this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
			} else {
				this.godotPath = normalize('/usr/bin/godot');
			}

			logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
			console.warn(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
			console.warn(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
		}
	}

	/**
	 * Set a custom Godot path
	 * @param customPath Path to the Godot executable
	 * @returns True if the path is valid and was set, false otherwise
	 */
	async setGodotPath(customPath: string): Promise<boolean> {
		if (!customPath) {
			return false;
		}

		// Normalize the path to ensure consistent format across platforms
		// (e.g., backslashes to forward slashes on Windows, resolving relative paths)
		const normalizedPath = normalize(customPath);
		if (await this.isValidGodotPath(normalizedPath)) {
			this.godotPath = normalizedPath;
			logDebug(`Godot path set to: ${normalizedPath}`);
			return true;
		}

		logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
		return false;
	}

	/**
	 * Check if the Godot version is 4.4 or later
	 * @param version The Godot version string
	 * @returns True if the version is 4.4 or later
	 */
	isGodot44OrLater(version: string): boolean {
		const match = version.match(/^(\d+)\.(\d+)/);
		if (match) {
			const major = parseInt(match[1], 10);
			const minor = parseInt(match[2], 10);
			return major > 4 || (major === 4 && minor >= 4);
		}
		return false;
	}
}
