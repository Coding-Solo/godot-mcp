/**
 * MCP tool schema definitions for all 19 tools
 */

/**
 * Get tool definitions for the MCP server
 */
export function getToolDefinitions() {
	return [
		{
			name: 'run_project',
			description: 'Run the Godot project and capture output',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					scene: {
						type: 'string',
						description: 'Optional: Specific scene to run',
					},
				},
				required: ['projectPath'],
			},
		},
		{
			name: 'get_debug_output',
			description: 'Get the current debug output and errors',
			inputSchema: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
		{
			name: 'stop_project',
			description: 'Stop the currently running Godot project',
			inputSchema: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
		{
			name: 'get_godot_version',
			description: 'Get the installed Godot version',
			inputSchema: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
		{
			name: 'run_project_and_get_output',
			description: 'Run a Godot project, capture its output, and automatically stop it',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					scene: {
						type: 'string',
						description: 'Optional: Specific scene to run',
					},
					maxLines: {
						type: 'number',
						description: 'Optional: Maximum number of log lines to capture (default: 100)',
					},
					timeout: {
						type: 'number',
						description: 'Optional: How long to run the project before stopping (in milliseconds, default: 5000)',
					}
				},
				required: ['projectPath'],
			},
		},
		{
			name: 'run_tests',
			description: 'Run Godot tests using GUT (Godot Unit Test) framework',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					gdir: {
						type: 'string',
						description: 'Optional: Directory containing tests (default: res://tests/unit)',
					},
					maxLines: {
						type: 'number',
						description: 'Optional: Maximum number of log lines to capture (default: 200)',
					},
					timeout: {
						type: 'number',
						description: 'Optional: How long to run tests before stopping (in milliseconds, default: 10000)',
					}
				},
				required: ['projectPath'],
			},
		},
		{
			name: 'list_projects',
			description: 'List Godot projects in a directory',
			inputSchema: {
				type: 'object',
				properties: {
					directory: {
						type: 'string',
						description: 'Directory to search for Godot projects',
					},
					recursive: {
						type: 'boolean',
						description: 'Whether to search recursively (default: false)',
					},
				},
				required: ['directory'],
			},
		},
		{
			name: 'get_project_info',
			description: 'Retrieve metadata about a Godot project',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
				},
				required: ['projectPath'],
			},
		},
		{
			name: 'create_scene',
			description: 'Create a new Godot scene file',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					scenePath: {
						type: 'string',
						description: 'Path where the scene file will be saved (relative to project)',
					},
					rootNodeType: {
						type: 'string',
						description: 'Type of the root node (e.g., Node2D, Node3D)',
						default: 'Node2D',
					},
				},
				required: ['projectPath', 'scenePath'],
			},
		},
		{
			name: 'add_node',
			description: 'Add a node to an existing scene',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					scenePath: {
						type: 'string',
						description: 'Path to the scene file (relative to project)',
					},
					parentNodePath: {
						type: 'string',
						description: 'Path to the parent node (e.g., "root" or "root/Player")',
						default: 'root',
					},
					nodeType: {
						type: 'string',
						description: 'Type of node to add (e.g., Sprite2D, CollisionShape2D)',
					},
					nodeName: {
						type: 'string',
						description: 'Name for the new node',
					},
					properties: {
						type: 'object',
						description: 'Optional properties to set on the node',
					},
				},
				required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
			},
		},
		{
			name: 'load_sprite',
			description: 'Load a sprite into a Sprite2D node',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					scenePath: {
						type: 'string',
						description: 'Path to the scene file (relative to project)',
					},
					nodePath: {
						type: 'string',
						description: 'Path to the Sprite2D node (e.g., "root/Player/Sprite2D")',
					},
					texturePath: {
						type: 'string',
						description: 'Path to the texture file (relative to project)',
					},
				},
				required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
			},
		},
		{
			name: 'export_mesh_library',
			description: 'Export a scene as a MeshLibrary resource',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					scenePath: {
						type: 'string',
						description: 'Path to the scene file (.tscn) to export',
					},
					outputPath: {
						type: 'string',
						description: 'Path where the mesh library (.res) will be saved',
					},
					meshItemNames: {
						type: 'array',
						items: {
							type: 'string',
						},
						description: 'Optional: Names of specific mesh items to include (defaults to all)',
					},
				},
				required: ['projectPath', 'scenePath', 'outputPath'],
			},
		},
		{
			name: 'save_scene',
			description: 'Save changes to a scene file',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					scenePath: {
						type: 'string',
						description: 'Path to the scene file (relative to project)',
					},
					newPath: {
						type: 'string',
						description: 'Optional: New path to save the scene to (for creating variants)',
					},
				},
				required: ['projectPath', 'scenePath'],
			},
		},
		{
			name: 'get_uid',
			description: 'Get the UID for a specific file in a Godot project (for Godot 4.4+)',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					filePath: {
						type: 'string',
						description: 'Path to the file (relative to project) for which to get the UID',
					},
				},
				required: ['projectPath', 'filePath'],
			},
		},
		{
			name: 'update_project_uids',
			description: 'Update UID references in a Godot project by resaving resources (for Godot 4.4+)',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
				},
				required: ['projectPath'],
			},
		},
		{
			name: 'get_file_diagnostics',
			description: 'Get diagnostics (errors, warnings, hints) for GDScript files in the project using the Godot LSP server. Requires the Godot editor to be running with the project open. The LSP server automatically publishes diagnostics when files are opened or modified.',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					filePath: {
						type: 'string',
						description: 'Optional: Path to a specific GDScript file (relative to project or absolute). If not provided, returns diagnostics for all files.',
					},
				},
				required: ['projectPath'],
			},
		},
		{
			name: 'get_godot_native_class',
			description: 'Query a Godot native class by name (e.g., Node2D, Control, Sprite2D). Returns the class inheritance hierarchy. Requires the Godot editor to be running.',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory (used to connect to LSP server)',
					},
					className: {
						type: 'string',
						description: 'Name of the Godot native class to look up (e.g., "Node2D", "Control", "Sprite2D")',
					},
				},
				required: ['projectPath', 'className'],
			},
		},
		{
			name: 'find_symbol_references',
			description: 'Find all references to a symbol (variable, function, class, etc.) in a GDScript file. Returns locations where the symbol is used across the project. Requires the Godot editor to be running.',
			inputSchema: {
				type: 'object',
				properties: {
					projectPath: {
						type: 'string',
						description: 'Path to the Godot project directory',
					},
					filePath: {
						type: 'string',
						description: 'Path to the GDScript file containing the symbol (relative to project or absolute)',
					},
					line: {
						type: 'number',
						description: 'Line number (0-indexed) where the symbol is located',
					},
					character: {
						type: 'number',
						description: 'Character position (0-indexed) within the line',
					},
					includeDeclaration: {
						type: 'boolean',
						description: 'Whether to include the declaration/definition in results (default: true)',
					},
				},
				required: ['projectPath', 'filePath', 'line', 'character'],
			},
		},
	];
}
