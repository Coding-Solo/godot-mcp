/**
 * Main GodotMCPServer class that composes all operations
 */

import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { GodotServerConfig } from './types.js';
import { GodotPathManager } from './config/godot-path.js';
import { GodotExecutor } from './operations/godot-executor.js';
import { ProjectOperations } from './operations/project-operations.js';
import { SceneOperations } from './operations/scene-operations.js';
import { UidOperations } from './operations/uid-operations.js';
import { LSPOperations } from './operations/lsp-operations.js';
import { ToolHandlers } from './tools/tool-handlers.js';
import { getToolDefinitions } from './tools/tool-registry.js';
import { logDebug } from './utils/validation.js';

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main server class for the Godot MCP server
 */
export class GodotMCPServer {
	private server: Server;
	private pathManager: GodotPathManager;
	private executor: GodotExecutor;
	private projectOps: ProjectOperations;
	private sceneOps: SceneOperations;
	private uidOps: UidOperations;
	private lspOps: LSPOperations;
	private toolHandlers: ToolHandlers;
	private strictPathValidation: boolean;

	constructor(config?: GodotServerConfig) {
		// Initialize path manager
		this.strictPathValidation = config?.strictPathValidation || false;
		this.pathManager = new GodotPathManager(
			config?.godotPath,
			this.strictPathValidation
		);

		// Set the path to the operations script
		const operationsScriptPath = join(__dirname, 'scripts', 'godot_operations.gd');
		logDebug(`Operations script path: ${operationsScriptPath}`);

		// Initialize executor (will get godot path later)
		this.executor = new GodotExecutor(operationsScriptPath);

		// Initialize operation classes (will get godot path later)
		this.projectOps = new ProjectOperations('');
		this.sceneOps = new SceneOperations(this.executor, '');
		this.uidOps = new UidOperations(this.executor, '', this.pathManager);
		this.lspOps = new LSPOperations('');

		// Initialize tool handlers
		this.toolHandlers = new ToolHandlers(
			this.projectOps,
			this.sceneOps,
			this.uidOps,
			this.lspOps
		);

		// Initialize the MCP server
		this.server = new Server(
			{
				name: 'godot-mcp',
				version: '0.1.0',
			},
			{
				capabilities: {
					tools: {},
				},
			}
		);

		// Set up tool handlers
		this.setupToolHandlers();

		// Error handling
		this.server.onerror = (error) => console.error('[MCP Error]', error);

		// Cleanup on exit
		process.on('SIGINT', async () => {
			await this.cleanup();
			process.exit(0);
		});
	}

	/**
	 * Set up the tool handlers for the MCP server
	 */
	private setupToolHandlers() {
		// Define available tools
		this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: getToolDefinitions(),
		}));

		// Handle tool calls
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			logDebug(`Handling tool request: ${request.params.name}`);
			const result = await this.toolHandlers.handleToolCall(
				request.params.name,
				request.params.arguments
			);
			return result as any;
		});
	}

	/**
	 * Update Godot path for all operations
	 */
	private updateGodotPath(godotPath: string) {
		this.projectOps.setGodotPath(godotPath);
		this.sceneOps.setGodotPath(godotPath);
		this.uidOps.setGodotPath(godotPath);
		this.lspOps.setGodotPath(godotPath);
	}

	/**
	 * Clean up resources when shutting down
	 */
	private async cleanup() {
		logDebug('Cleaning up resources');

		// Stop any active project process
		const activeProcess = this.projectOps.getActiveProcess();
		if (activeProcess) {
			logDebug('Killing active Godot process');
			activeProcess.process.kill();
		}

		// Cleanup LSP resources
		this.lspOps.cleanup();

		await this.server.close();
	}

	/**
	 * Run the MCP server
	 */
	async run() {
		try {
			// Detect Godot path before starting the server
			await this.pathManager.detectGodotPath();

			const godotPath = this.pathManager.getGodotPath();
			if (!godotPath) {
				console.error('[SERVER] Failed to find a valid Godot executable path');
				console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
				process.exit(1);
			}

			// Check if the path is valid
			const isValid = await this.pathManager.isValidGodotPath(godotPath);

			if (!isValid) {
				if (this.strictPathValidation) {
					// In strict mode, exit if the path is invalid
					console.error(`[SERVER] Invalid Godot path: ${godotPath}`);
					console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
					process.exit(1);
				} else {
					// In compatibility mode, warn but continue with the default path
					console.warn(`[SERVER] Warning: Using potentially invalid Godot path: ${godotPath}`);
					console.warn('[SERVER] This may cause issues when executing Godot commands');
					console.warn('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
				}
			}

			console.log(`[SERVER] Using Godot at: ${godotPath}`);

			// Update all operations with the detected Godot path
			this.updateGodotPath(godotPath);

			const transport = new StdioServerTransport();
			await this.server.connect(transport);
			console.error('Godot MCP server running on stdio');
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('[SERVER] Failed to start:', errorMessage);
			process.exit(1);
		}
	}
}
