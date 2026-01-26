/**
 * Scene operation handlers (create, modify, save)
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { OperationParams, ToolResponse } from '../types.js';
import { GodotExecutor } from './godot-executor.js';
import { ParameterMapper } from '../utils/parameters.js';
import { createErrorResponse, validatePath } from '../utils/validation.js';

/**
 * SceneOperations handles all scene-related operations
 */
export class SceneOperations {
	private executor: GodotExecutor;
	private godotPath: string;

	constructor(executor: GodotExecutor, godotPath: string) {
		this.executor = executor;
		this.godotPath = godotPath;
	}

	/**
	 * Update the Godot path
	 */
	setGodotPath(godotPath: string): void {
		this.godotPath = godotPath;
	}

	/**
	 * Handle the create_scene tool
	 */
	async handleCreateScene(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.scenePath) {
			return createErrorResponse(
				'Project path and scene path are required',
				['Provide valid paths for both the project and the scene']
			);
		}

		if (!validatePath(args.projectPath) || !validatePath(args.scenePath)) {
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

			// Prepare parameters for the operation (already in camelCase)
			const params = {
				scenePath: args.scenePath,
				rootNodeType: args.rootNodeType || 'Node2D',
			};

			// Execute the operation
			const { stdout, stderr } = await this.executor.executeOperation(
				this.godotPath,
				'create_scene',
				params,
				args.projectPath
			);

			if (stderr && stderr.includes('Failed to')) {
				return createErrorResponse(
					`Failed to create scene: ${stderr}`,
					[
						'Check if the root node type is valid',
						'Ensure you have write permissions to the scene path',
						'Verify the scene path is valid',
					]
				);
			}

			return {
				content: [
					{
						type: 'text',
						text: `Scene created successfully at: ${args.scenePath}\n\nOutput: ${stdout}`,
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to create scene: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}

	/**
	 * Handle the add_node tool
	 */
	async handleAddNode(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
			return createErrorResponse(
				'Missing required parameters',
				['Provide projectPath, scenePath, nodeType, and nodeName']
			);
		}

		if (!validatePath(args.projectPath) || !validatePath(args.scenePath)) {
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

			// Check if the scene file exists
			const scenePath = join(args.projectPath, args.scenePath);
			if (!existsSync(scenePath)) {
				return createErrorResponse(
					`Scene file does not exist: ${args.scenePath}`,
					[
						'Ensure the scene path is correct',
						'Use create_scene to create a new scene first',
					]
				);
			}

			// Prepare parameters for the operation (already in camelCase)
			const params: any = {
				scenePath: args.scenePath,
				nodeType: args.nodeType,
				nodeName: args.nodeName,
			};

			// Add optional parameters
			if (args.parentNodePath) {
				params.parentNodePath = args.parentNodePath;
			}

			if (args.properties) {
				params.properties = args.properties;
			}

			// Execute the operation
			const { stdout, stderr } = await this.executor.executeOperation(
				this.godotPath,
				'add_node',
				params,
				args.projectPath
			);

			if (stderr && stderr.includes('Failed to')) {
				return createErrorResponse(
					`Failed to add node: ${stderr}`,
					[
						'Check if the node type is valid',
						'Ensure the parent node path exists',
						'Verify the scene file is valid',
					]
				);
			}

			return {
				content: [
					{
						type: 'text',
						text: `Node '${args.nodeName}' of type '${args.nodeType}' added successfully to '${args.scenePath}'.\n\nOutput: ${stdout}`,
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to add node: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}

	/**
	 * Handle the load_sprite tool
	 */
	async handleLoadSprite(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
			return createErrorResponse(
				'Missing required parameters',
				['Provide projectPath, scenePath, nodePath, and texturePath']
			);
		}

		if (
			!validatePath(args.projectPath) ||
			!validatePath(args.scenePath) ||
			!validatePath(args.nodePath) ||
			!validatePath(args.texturePath)
		) {
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

			// Check if the scene file exists
			const scenePath = join(args.projectPath, args.scenePath);
			if (!existsSync(scenePath)) {
				return createErrorResponse(
					`Scene file does not exist: ${args.scenePath}`,
					[
						'Ensure the scene path is correct',
						'Use create_scene to create a new scene first',
					]
				);
			}

			// Check if the texture file exists
			const texturePath = join(args.projectPath, args.texturePath);
			if (!existsSync(texturePath)) {
				return createErrorResponse(
					`Texture file does not exist: ${args.texturePath}`,
					[
						'Ensure the texture path is correct',
						'Upload or create the texture file first',
					]
				);
			}

			// Prepare parameters for the operation (already in camelCase)
			const params = {
				scenePath: args.scenePath,
				nodePath: args.nodePath,
				texturePath: args.texturePath,
			};

			// Execute the operation
			const { stdout, stderr } = await this.executor.executeOperation(
				this.godotPath,
				'load_sprite',
				params,
				args.projectPath
			);

			if (stderr && stderr.includes('Failed to')) {
				return createErrorResponse(
					`Failed to load sprite: ${stderr}`,
					[
						'Check if the node path is correct',
						'Ensure the node is a Sprite2D, Sprite3D, or TextureRect',
						'Verify the texture file is a valid image format',
					]
				);
			}

			return {
				content: [
					{
						type: 'text',
						text: `Sprite loaded successfully with texture: ${args.texturePath}\n\nOutput: ${stdout}`,
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to load sprite: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}

	/**
	 * Handle the export_mesh_library tool
	 */
	async handleExportMeshLibrary(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.scenePath || !args.outputPath) {
			return createErrorResponse(
				'Missing required parameters',
				['Provide projectPath, scenePath, and outputPath']
			);
		}

		if (
			!validatePath(args.projectPath) ||
			!validatePath(args.scenePath) ||
			!validatePath(args.outputPath)
		) {
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

			// Check if the scene file exists
			const scenePath = join(args.projectPath, args.scenePath);
			if (!existsSync(scenePath)) {
				return createErrorResponse(
					`Scene file does not exist: ${args.scenePath}`,
					[
						'Ensure the scene path is correct',
						'Use create_scene to create a new scene first',
					]
				);
			}

			// Prepare parameters for the operation (already in camelCase)
			const params: any = {
				scenePath: args.scenePath,
				outputPath: args.outputPath,
			};

			// Add optional parameters
			if (args.meshItemNames && Array.isArray(args.meshItemNames)) {
				params.meshItemNames = args.meshItemNames;
			}

			// Execute the operation
			const { stdout, stderr } = await this.executor.executeOperation(
				this.godotPath,
				'export_mesh_library',
				params,
				args.projectPath
			);

			if (stderr && stderr.includes('Failed to')) {
				return createErrorResponse(
					`Failed to export mesh library: ${stderr}`,
					[
						'Check if the scene contains valid 3D meshes',
						'Ensure the output path is valid',
						'Verify the scene file is valid',
					]
				);
			}

			return {
				content: [
					{
						type: 'text',
						text: `MeshLibrary exported successfully to: ${args.outputPath}\n\nOutput: ${stdout}`,
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to export mesh library: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}

	/**
	 * Handle the save_scene tool
	 */
	async handleSaveScene(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.scenePath) {
			return createErrorResponse(
				'Missing required parameters',
				['Provide projectPath and scenePath']
			);
		}

		if (!validatePath(args.projectPath) || !validatePath(args.scenePath)) {
			return createErrorResponse(
				'Invalid path',
				['Provide valid paths without ".." or other potentially unsafe characters']
			);
		}

		// If newPath is provided, validate it
		if (args.newPath && !validatePath(args.newPath)) {
			return createErrorResponse(
				'Invalid new path',
				['Provide a valid new path without ".." or other potentially unsafe characters']
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

			// Check if the scene file exists
			const scenePath = join(args.projectPath, args.scenePath);
			if (!existsSync(scenePath)) {
				return createErrorResponse(
					`Scene file does not exist: ${args.scenePath}`,
					[
						'Ensure the scene path is correct',
						'Use create_scene to create a new scene first',
					]
				);
			}

			// Prepare parameters for the operation (already in camelCase)
			const params: any = {
				scenePath: args.scenePath,
			};

			// Add optional parameters
			if (args.newPath) {
				params.newPath = args.newPath;
			}

			// Execute the operation
			const { stdout, stderr } = await this.executor.executeOperation(
				this.godotPath,
				'save_scene',
				params,
				args.projectPath
			);

			if (stderr && stderr.includes('Failed to')) {
				return createErrorResponse(
					`Failed to save scene: ${stderr}`,
					[
						'Check if the scene file is valid',
						'Ensure you have write permissions to the output path',
						'Verify the scene can be properly packed',
					]
				);
			}

			const savePath = args.newPath || args.scenePath;
			return {
				content: [
					{
						type: 'text',
						text: `Scene saved successfully to: ${savePath}\n\nOutput: ${stdout}`,
					},
				],
			};
		} catch (error: any) {
			return createErrorResponse(
				`Failed to save scene: ${error?.message || 'Unknown error'}`,
				[
					'Ensure Godot is installed correctly',
					'Check if the GODOT_PATH environment variable is set correctly',
					'Verify the project path is accessible',
				]
			);
		}
	}
}
