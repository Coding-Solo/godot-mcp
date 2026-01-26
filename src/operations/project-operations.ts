/**
 * Project operation handlers (run, stop, test, discovery)
 */

import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import type { GodotProcess, OperationParams, ToolResponse } from '../types.js';
import { ParameterMapper } from '../utils/parameters.js';
import { createErrorResponse, validatePath, logDebug } from '../utils/validation.js';

const execAsync = promisify(exec);

/**
 * ProjectOperations handles all project-related operations
 */
export class ProjectOperations {
	private activeProcess: GodotProcess | null = null;
	private godotPath: string;

	constructor(godotPath: string) {
		this.godotPath = godotPath;
	}

	/**
	 * Update the Godot path
	 */
	setGodotPath(godotPath: string): void {
		this.godotPath = godotPath;
	}

	/**
	 * Get the active process (for external access)
	 */
	getActiveProcess(): GodotProcess | null {
		return this.activeProcess;
	}

	/**
	 * Find Godot projects in a directory
	 */
	findGodotProjects(directory: string, recursive: boolean): Array<{ path: string; name: string }> {
		const projects: Array<{ path: string; name: string }> = [];

		try {
			// Check if the directory itself is a Godot project
			const projectFile = join(directory, 'project.godot');
			if (existsSync(projectFile)) {
				projects.push({
					path: directory,
					name: basename(directory),
				});
			}

			// If not recursive, only check immediate subdirectories
			if (!recursive) {
				const entries = readdirSync(directory, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory()) {
						const subdir = join(directory, entry.name);
						const projectFile = join(subdir, 'project.godot');
						if (existsSync(projectFile)) {
							projects.push({
								path: subdir,
								name: entry.name,
							});
						}
					}
				}
			} else {
				// Recursive search
				const entries = readdirSync(directory, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory()) {
						const subdir = join(directory, entry.name);
						// Skip hidden directories
						if (entry.name.startsWith('.')) {
							continue;
						}
						// Check if this directory is a Godot project
						const projectFile = join(subdir, 'project.godot');
						if (existsSync(projectFile)) {
							projects.push({
								path: subdir,
								name: entry.name,
							});
						} else {
							// Recursively search this directory
							const subProjects = this.findGodotProjects(subdir, true);
							projects.push(...subProjects);
						}
					}
				}
			}
		} catch (error) {
			logDebug(`Error searching directory ${directory}: ${error}`);
		}

		return projects;
	}

	/**
	 * Get the structure of a Godot project asynchronously by counting files recursively
	 */
	private getProjectStructureAsync(projectPath: string): Promise<any> {
		return new Promise((resolve) => {
			try {
				const structure = {
					scenes: 0,
					scripts: 0,
					assets: 0,
					other: 0,
				};

				const scanDirectory = (currentPath: string) => {
					const entries = readdirSync(currentPath, { withFileTypes: true });

					for (const entry of entries) {
						const entryPath = join(currentPath, entry.name);

						// Skip hidden files and directories
						if (entry.name.startsWith('.')) {
							continue;
						}

						if (entry.isDirectory()) {
							// Recursively scan subdirectories
							scanDirectory(entryPath);
						} else if (entry.isFile()) {
							// Count file by extension
							const ext = entry.name.split('.').pop()?.toLowerCase();

							if (ext === 'tscn') {
								structure.scenes++;
							} else if (ext === 'gd' || ext === 'gdscript' || ext === 'cs') {
								structure.scripts++;
							} else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ttf', 'wav', 'mp3', 'ogg'].includes(ext || '')) {
								structure.assets++;
							} else {
								structure.other++;
							}
						}
					}
				};

				// Start scanning from the project root
				scanDirectory(projectPath);
				resolve(structure);
			} catch (error) {
				logDebug(`Error getting project structure asynchronously: ${error}`);
				resolve({
					error: 'Failed to get project structure',
					scenes: 0,
					scripts: 0,
					assets: 0,
					other: 0
				});
			}
		});
	}

	/**
	 * Handle the run_project tool
	 */
	async handleRunProject(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath) {
			return createErrorResponse(
				'Project path is required',
				['Provide a valid path to a Godot project directory']
			);
		}

		if (!validatePath(args.projectPath)) {
			return createErrorResponse(
				'Invalid project path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		try {
			// Check if the project directory exists and contains a project.godot file
			const projectFile = join(args.projectPath, 'project.godot');
			if (!existsSync(projectFile)) {
				return createErrorResponse(
					`Not a valid Godot project: ${args.projectPath}`,
					[
						'Ensure the path points to a directory containing a project.godot file',
						'Use list_projects to find valid Godot projects',
					]
				);
			}

			// Kill any existing process
			if (this.activeProcess) {
				logDebug('Killing existing Godot process before starting a new one');
				this.activeProcess.process.kill();
			}

			const cmdArgs = ['-d', '--path', args.projectPath];
			if (args.scene && validatePath(args.scene)) {
				logDebug(`Adding scene parameter: ${args.scene}`);
				cmdArgs.push(args.scene);
			}

			logDebug(`Running Godot project: ${args.projectPath}`);
			const process = spawn(this.godotPath, cmdArgs, { stdio: 'pipe' });
			const output: string[] = [];
			const errors: string[] = [];

			process.stdout?.on('data', (data: Buffer) => {
				const lines = data.toString().split('\n');
				output.push(...lines);
				lines.forEach((line: string) => {
					if (line.trim()) logDebug(`[Godot stdout] ${line}`);
				});
			});

			process.stderr?.on('data', (data: Buffer) => {
				const lines = data.toString().split('\n');
				errors.push(...lines);
				lines.forEach((line: string) => {
					if (line.trim()) logDebug(`[Godot stderr] ${line}`);
				});
			});

			process.on('exit', (code: number | null) => {
				logDebug(`Godot process exited with code ${code}`);
				if (this.activeProcess && this.activeProcess.process === process) {
					this.activeProcess = null;
				}
			});

			process.on('error', (err: Error) => {
				console.error('Failed to start Godot process:', err);
				if (this.activeProcess && this.activeProcess.process === process) {
					this.activeProcess = null;
				}
			});

			this.activeProcess = { process, output, errors };

			return {
				content: [
					{
						type: 'text',
						text: `Godot project started in debug mode. Use get_debug_output to see output.`,
					},
				],
			};
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return createErrorResponse(
				`Failed to run Godot project: ${errorMessage}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}

	/**
	 * Handle the get_debug_output tool
	 */
	async handleGetDebugOutput(): Promise<ToolResponse> {
		if (!this.activeProcess) {
			return createErrorResponse(
				'No active Godot process.',
				[
					'Use run_project to start a Godot project first',
					'Check if the Godot process crashed unexpectedly',
				]
			);
		}

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							output: this.activeProcess.output,
							errors: this.activeProcess.errors,
						},
						null,
						2
					),
				},
			],
		};
	}

	/**
	 * Handle the stop_project tool
	 */
	async handleStopProject(): Promise<ToolResponse> {
		if (!this.activeProcess) {
			return createErrorResponse(
				'No active Godot process to stop.',
				[
					'Use run_project to start a Godot project first',
					'The process may have already terminated',
				]
			);
		}

		logDebug('Stopping active Godot process');
		this.activeProcess.process.kill();
		const output = this.activeProcess.output;
		const errors = this.activeProcess.errors;
		this.activeProcess = null;

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							message: 'Godot project stopped',
							finalOutput: output,
							finalErrors: errors,
						},
						null,
						2
					),
				},
			],
		};
	}

	/**
	 * Handle the get_godot_version tool
	 */
	async handleGetGodotVersion(): Promise<ToolResponse> {
		try {
			logDebug('Getting Godot version');
			const { stdout } = await execAsync(`"${this.godotPath}" --version`);
			return {
				content: [
					{
						type: 'text',
						text: stdout.trim(),
					},
				],
			};
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return createErrorResponse(
				`Failed to get Godot version: ${errorMessage}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
				]
			);
		}
	}

	/**
	 * Handle the run_project_and_get_output tool
	 */
	async handleRunProjectAndGetOutput(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath) {
			return createErrorResponse(
				'Project path is required',
				['Provide a valid path to a Godot project directory']
			);
		}

		if (!validatePath(args.projectPath)) {
			return createErrorResponse(
				'Invalid project path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		// Set defaults for optional parameters
		const maxLines = args.maxLines || 100;
		const timeout = args.timeout || 5000;

		try {
			// Start the project
			const runResult = await this.handleRunProject(args);
			if (runResult.isError) {
				return runResult;
			}

			// Wait for the specified timeout
			await new Promise(resolve => setTimeout(resolve, timeout));

			// Get the debug output
			const outputResult = await this.handleGetDebugOutput();

			// Stop the project
			await this.handleStopProject();

			// If there was no active process when getting output, return an error
			if (outputResult.isError) {
				return createErrorResponse(
					'Failed to capture output from Godot project',
					[
						'Check if the project started correctly',
						'Try increasing the timeout value',
					]
				);
			}

			// Parse the output JSON
			const rawOutput = JSON.parse(outputResult.content[0].text);

			// Truncate output and errors to the specified maximum lines
			const output = rawOutput.output.slice(-maxLines).join('\n');
			const errors = rawOutput.errors.slice(-maxLines).join('\n');

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								success: true,
								message: 'Godot workflow completed',
								output: output,
								errors: errors,
								truncated: rawOutput.output.length > maxLines || rawOutput.errors.length > maxLines,
								originalOutputLines: rawOutput.output.length,
								originalErrorLines: rawOutput.errors.length,
							},
							null,
							2
						),
					},
				],
			};
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return createErrorResponse(
				`Failed to run Godot workflow: ${errorMessage}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the project path is accessible',
					'Try increasing the timeout value',
				]
			);
		}
	}

	/**
	 * Handle the run_tests tool
	 */
	async handleRunTests(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath) {
			return createErrorResponse(
				'Project path is required',
				['Provide a valid path to a Godot project directory']
			);
		}

		if (!validatePath(args.projectPath)) {
			return createErrorResponse(
				'Invalid project path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		// Set defaults for optional parameters
		const gdir = args.gdir || 'res://tests/unit';
		const maxLines = args.maxLines || 200;
		const timeout = args.timeout || 10000;

		try {
			// Check if the project directory exists and contains a project.godot file
			const projectFile = join(args.projectPath, 'project.godot');
			if (!existsSync(projectFile)) {
				return createErrorResponse(
					`Not a valid Godot project: ${args.projectPath}`,
					[
						'Ensure the path points to a directory containing a project.godot file',
						'Use list_projects to find valid Godot projects',
					]
				);
			}

			// Build the command to run tests
			const godotArgs = [
				'--headless',
				'-s',
				'--path',
				args.projectPath,
				'addons/gut/gut_cmdln.gd',
				`-gdir=${gdir}`
			];

			logDebug(`Running Godot tests: ${args.projectPath} with gdir=${gdir}`);

			// Spawn the Godot process
			const process = spawn(this.godotPath, godotArgs, { stdio: 'pipe' });
			const output: string[] = [];
			const errors: string[] = [];

			process.stdout?.on('data', (data: Buffer) => {
				const lines = data.toString().split('\n').filter(line => line.trim() !== '');
				output.push(...lines);
			});

			process.stderr?.on('data', (data: Buffer) => {
				const lines = data.toString().split('\n').filter(line => line.trim() !== '');
				errors.push(...lines);
			});

			// Wait for the specified timeout
			await new Promise(resolve => setTimeout(resolve, timeout));

			// Stop the process
			if (process && !process.killed) {
				process.kill('SIGTERM');
				// Give it a moment to terminate gracefully
				await new Promise(resolve => setTimeout(resolve, 500));
				if (process && !process.killed) {
					process.kill('SIGKILL');
				}
			}

			// Truncate output and errors to the specified maximum lines
			const truncatedOutput = output.slice(-maxLines).join('\n');
			const truncatedErrors = errors.slice(-maxLines).join('\n');

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								success: true,
								message: 'Godot tests completed',
								output: truncatedOutput,
								errors: truncatedErrors,
								truncated: output.length > maxLines || errors.length > maxLines,
								originalOutputLines: output.length,
								originalErrorLines: errors.length,
								testDirectory: gdir,
							},
							null,
							2
						),
					},
				],
			};
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return createErrorResponse(
				`Failed to run Godot tests: ${errorMessage}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the project path is accessible',
					'Ensure GUT is installed in addons/gut/',
					'Try increasing the timeout value',
				]
			);
		}
	}

	/**
	 * Handle the list_projects tool
	 */
	async handleListProjects(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.directory) {
			return createErrorResponse(
				'Directory is required',
				['Provide a valid directory path to search for Godot projects']
			);
		}

		if (!validatePath(args.directory)) {
			return createErrorResponse(
				'Invalid directory path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		try {
			logDebug(`Listing Godot projects in directory: ${args.directory}`);
			if (!existsSync(args.directory)) {
				return createErrorResponse(
					`Directory does not exist: ${args.directory}`,
					['Provide a valid directory path that exists on the system']
				);
			}

			const recursive = args.recursive === true;
			const projects = this.findGodotProjects(args.directory, recursive);

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(projects, null, 2),
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to list projects: ${error?.message || 'Unknown error'}`,
				[
					'Ensure the directory exists and is accessible',
					'Check if you have permission to read the directory',
				]
			);
		}
	}

	/**
	 * Handle the get_project_info tool
	 */
	async handleGetProjectInfo(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath) {
			return createErrorResponse(
				'Project path is required',
				['Provide a valid path to a Godot project directory']
			);
		}

		if (!validatePath(args.projectPath)) {
			return createErrorResponse(
				'Invalid project path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		try {
			// Check if the project directory exists and contains a project.godot file
			const projectFile = join(args.projectPath, 'project.godot');
			if (!existsSync(projectFile)) {
				return createErrorResponse(
					`Not a valid Godot project: ${args.projectPath}`,
					[
						'Ensure the path points to a directory containing a project.godot file',
						'Use list_projects to find valid Godot projects',
					]
				);
			}

			logDebug(`Getting project info for: ${args.projectPath}`);

			// Get Godot version
			const execOptions = { timeout: 10000 }; // 10 second timeout
			const { stdout } = await execAsync(`"${this.godotPath}" --version`, execOptions);

			// Get project structure using the recursive method
			const projectStructure = await this.getProjectStructureAsync(args.projectPath);

			// Extract project name from project.godot file
			let projectName = basename(args.projectPath);
			try {
				const fs = require('fs');
				const projectFileContent = fs.readFileSync(projectFile, 'utf8');
				const configNameMatch = projectFileContent.match(/config\/name="([^"]+)"/);
				if (configNameMatch && configNameMatch[1]) {
					projectName = configNameMatch[1];
					logDebug(`Found project name in config: ${projectName}`);
				}
			} catch (error) {
				logDebug(`Error reading project file: ${error}`);
				// Continue with default project name if extraction fails
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								name: projectName,
								path: args.projectPath,
								godotVersion: stdout.trim(),
								structure: projectStructure,
							},
							null,
							2
						),
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to get project info: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}
}
