/**
 * UID operation handlers (Godot 4.4+)
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import type { ToolResponse } from '../types.js';
import { GodotExecutor } from './godot-executor.js';
import { GodotPathManager } from '../config/godot-path.js';
import { ParameterMapper } from '../utils/parameters.js';
import { createErrorResponse, validatePath } from '../utils/validation.js';

const execAsync = promisify(exec);

/**
 * UidOperations handles UID-related operations (Godot 4.4+)
 */
export class UidOperations {
	private executor: GodotExecutor;
	private godotPath: string;
	private pathManager: GodotPathManager;

	constructor(executor: GodotExecutor, godotPath: string, pathManager: GodotPathManager) {
		this.executor = executor;
		this.godotPath = godotPath;
		this.pathManager = pathManager;
	}

	/**
	 * Update the Godot path
	 */
	setGodotPath(godotPath: string): void {
		this.godotPath = godotPath;
	}

	/**
	 * Handle the get_uid tool
	 */
	async handleGetUid(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.filePath) {
			return createErrorResponse(
				'Missing required parameters',
				['Provide projectPath and filePath']
			);
		}

		if (!validatePath(args.projectPath) || !validatePath(args.filePath)) {
			return createErrorResponse(
				'Invalid path',
				['Provide valid paths without ".." or other potentially unsafe characters']
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

			// Check if the file exists
			const filePath = join(args.projectPath, args.filePath);
			if (!existsSync(filePath)) {
				return createErrorResponse(
					`File does not exist: ${args.filePath}`,
					['Ensure the file path is correct']
				);
			}

			// Get Godot version to check if UIDs are supported
			const { stdout: versionOutput } = await execAsync(`"${this.godotPath}" --version`);
			const version = versionOutput.trim();

			if (!this.pathManager.isGodot44OrLater(version)) {
				return createErrorResponse(
					`UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
					[
						'Upgrade to Godot 4.4 or later to use UIDs',
						'Use resource paths instead of UIDs for this version of Godot',
					]
				);
			}

			// Prepare parameters for the operation (already in camelCase)
			const params = {
				filePath: args.filePath,
			};

			// Execute the operation
			const { stdout, stderr } = await this.executor.executeOperation(
				this.godotPath,
				'get_uid',
				params,
				args.projectPath
			);

			if (stderr && stderr.includes('Failed to')) {
				return createErrorResponse(
					`Failed to get UID: ${stderr}`,
					[
						'Check if the file is a valid Godot resource',
						'Ensure the file path is correct',
					]
				);
			}

			return {
				content: [
					{
						type: 'text',
						text: `UID for ${args.filePath}: ${stdout.trim()}`,
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to get UID: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}

	/**
	 * Handle the update_project_uids tool
	 */
	async handleUpdateProjectUids(args: any): Promise<ToolResponse> {
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

			// Get Godot version to check if UIDs are supported
			const { stdout: versionOutput } = await execAsync(`"${this.godotPath}" --version`);
			const version = versionOutput.trim();

			if (!this.pathManager.isGodot44OrLater(version)) {
				return createErrorResponse(
					`UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
					[
						'Upgrade to Godot 4.4 or later to use UIDs',
						'Use resource paths instead of UIDs for this version of Godot',
					]
				);
			}

			// Prepare parameters for the operation (already in camelCase)
			const params = {
				projectPath: args.projectPath,
			};

			// Execute the operation
			const { stdout, stderr } = await this.executor.executeOperation(
				this.godotPath,
				'resave_resources',
				params,
				args.projectPath
			);

			if (stderr && stderr.includes('Failed to')) {
				return createErrorResponse(
					`Failed to update project UIDs: ${stderr}`,
					[
						'Check if the project is valid',
						'Ensure you have write permissions to the project directory',
					]
				);
			}

			return {
				content: [
					{
						type: 'text',
						text: `Project UIDs updated successfully.\n\nOutput: ${stdout}`,
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to update project UIDs: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}
}
