/**
 * Tool routing and delegation to operation classes
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResponse } from '../types.js';
import { ProjectOperations } from '../operations/project-operations.js';
import { SceneOperations } from '../operations/scene-operations.js';
import { UidOperations } from '../operations/uid-operations.js';
import { LSPOperations } from '../operations/lsp-operations.js';

/**
 * ToolHandlers routes tool calls to appropriate operation handlers
 */
export class ToolHandlers {
	private projectOps: ProjectOperations;
	private sceneOps: SceneOperations;
	private uidOps: UidOperations;
	private lspOps: LSPOperations;

	constructor(
		projectOps: ProjectOperations,
		sceneOps: SceneOperations,
		uidOps: UidOperations,
		lspOps: LSPOperations
	) {
		this.projectOps = projectOps;
		this.sceneOps = sceneOps;
		this.uidOps = uidOps;
		this.lspOps = lspOps;
	}

	/**
	 * Handle a tool call by routing to the appropriate operation handler
	 */
	async handleToolCall(toolName: string, args: any): Promise<ToolResponse> {
		switch (toolName) {
			// Project operations
			case 'run_project':
				return await this.projectOps.handleRunProject(args);
			case 'get_debug_output':
				return await this.projectOps.handleGetDebugOutput();
			case 'stop_project':
				return await this.projectOps.handleStopProject();
			case 'get_godot_version':
				return await this.projectOps.handleGetGodotVersion();
			case 'run_project_and_get_output':
				return await this.projectOps.handleRunProjectAndGetOutput(args);
			case 'run_tests':
				return await this.projectOps.handleRunTests(args);
			case 'list_projects':
				return await this.projectOps.handleListProjects(args);
			case 'get_project_info':
				return await this.projectOps.handleGetProjectInfo(args);

			// Scene operations
			case 'create_scene':
				return await this.sceneOps.handleCreateScene(args);
			case 'add_node':
				return await this.sceneOps.handleAddNode(args);
			case 'load_sprite':
				return await this.sceneOps.handleLoadSprite(args);
			case 'export_mesh_library':
				return await this.sceneOps.handleExportMeshLibrary(args);
			case 'save_scene':
				return await this.sceneOps.handleSaveScene(args);

			// UID operations
			case 'get_uid':
				return await this.uidOps.handleGetUid(args);
			case 'update_project_uids':
				return await this.uidOps.handleUpdateProjectUids(args);

			// LSP operations
			case 'get_file_diagnostics':
				return await this.lspOps.handleGetFileDiagnostics(args);
			case 'get_godot_native_class':
				return await this.lspOps.handleGetGodotNativeClass(args);
			case 'find_symbol_references':
				return await this.lspOps.handleFindSymbolReferences(args);

			default:
				throw new McpError(
					ErrorCode.MethodNotFound,
					`Unknown tool: ${toolName}`
				);
		}
	}
}
