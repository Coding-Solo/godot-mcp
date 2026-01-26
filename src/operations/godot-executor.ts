/**
 * Godot command execution utilities
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import type { OperationParams } from '../types.js';
import { ParameterMapper } from '../utils/parameters.js';
import { logDebug } from '../utils/validation.js';

const execAsync = promisify(exec);

// Check if Godot debug mode is enabled
const GODOT_DEBUG_MODE: boolean = true; // Always use GODOT DEBUG MODE

/**
 * GodotExecutor handles execution of Godot operations via the godot_operations.gd script
 */
export class GodotExecutor {
	private operationsScriptPath: string;

	constructor(operationsScriptPath: string) {
		this.operationsScriptPath = operationsScriptPath;
	}

	/**
	 * Execute a Godot operation using the operations script
	 * @param godotPath Path to the Godot executable
	 * @param operation The operation to execute
	 * @param params The parameters for the operation
	 * @param projectPath The path to the Godot project
	 * @returns The stdout and stderr from the operation
	 */
	async executeOperation(
		godotPath: string,
		operation: string,
		params: OperationParams,
		projectPath: string
	): Promise<{ stdout: string; stderr: string }> {
		logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
		logDebug(`Original operation params: ${JSON.stringify(params)}`);

		// Convert camelCase parameters to snake_case for Godot script
		const snakeCaseParams = ParameterMapper.convertCamelToSnakeCase(params);
		logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);

		try {
			// Serialize the snake_case parameters to a valid JSON string
			const paramsJson = JSON.stringify(snakeCaseParams);
			// Escape single quotes in the JSON string to prevent command injection
			const escapedParams = paramsJson.replace(/'/g, "'\\''");
			// On Windows, cmd.exe does not strip single quotes, so we use
			// double quotes and escape them to ensure the JSON is parsed
			// correctly by Godot.
			const isWindows = process.platform === 'win32';
			const quotedParams = isWindows
				? `\"${paramsJson.replace(/\"/g, '\\"')}\"`
				: `'${escapedParams}'`;

			// Add debug arguments if debug mode is enabled
			const debugArgs = GODOT_DEBUG_MODE ? ['--debug-godot'] : [];

			// Construct the command with the operation and JSON parameters
			const cmd = [
				`"${godotPath}"`,
				'--headless',
				'--path',
				`"${projectPath}"`,
				'--script',
				`"${this.operationsScriptPath}"`,
				operation,
				quotedParams, // Pass the JSON string as a single argument
				...debugArgs,
			].join(' ');

			logDebug(`Command: ${cmd}`);

			const { stdout, stderr } = await execAsync(cmd);

			return { stdout, stderr };
		} catch (error: unknown) {
			// If execAsync throws, it still contains stdout/stderr
			if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
				const execError = error as Error & { stdout: string; stderr: string };
				return {
					stdout: execError.stdout,
					stderr: execError.stderr,
				};
			}

			throw error;
		}
	}
}
