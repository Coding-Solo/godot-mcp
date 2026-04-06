export interface SdkToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  operation?: string;
  requiresUidSupport?: boolean;
  mapArgs?: (args: Record<string, any>) => Record<string, any>;
}

const projectPathProperty = {
  type: 'string',
  description: 'Path to the Godot project directory',
};

function withProjectPath(
  properties: Record<string, any>,
  required: string[] = []
): Record<string, any> {
  return {
    type: 'object',
    properties: {
      projectPath: projectPathProperty,
      ...properties,
    },
    required: ['projectPath', ...required],
  };
}

function omitProjectPath(args: Record<string, any>): Record<string, any> {
  const { projectPath: _projectPath, ...rest } = args;
  return rest;
}

const SDK_TOOL_DEFINITION_BASE: SdkToolDefinition[] = [
  {
    name: 'create_scene_from_json',
    description: 'Create a Godot scene from a structured JSON scene definition',
    inputSchema: withProjectPath(
      {
        scene: {
          type: 'object',
          description: 'Scene definition matching SceneOps.create_scene_from_json',
        },
      },
      ['scene']
    ),
  },
  {
    name: 'scene_to_json',
    description: 'Serialize a Godot scene to structured JSON',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'save_scene',
    description: 'Save changes to a scene file or save it to a new path',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
        newPath: {
          type: 'string',
          description: 'Optional new path for save-as behavior',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'resave_scene',
    description: 'Reload and resave a scene in place',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'add_node',
    description: 'Add a node to an existing scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
        parentNodePath: {
          type: 'string',
          description: 'Parent node path inside the scene. Empty means the root node.',
        },
        nodeType: {
          type: 'string',
          description: 'Type of node to add',
        },
        nodeName: {
          type: 'string',
          description: 'Name of the new node',
        },
        properties: {
          type: 'object',
          description: 'Optional node properties to assign',
        },
      },
      ['scenePath', 'nodeType', 'nodeName']
    ),
  },
  {
    name: 'remove_node',
    description: 'Remove a node from a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
        nodePath: {
          type: 'string',
          description: 'Node path inside the scene',
        },
      },
      ['scenePath', 'nodePath']
    ),
  },
  {
    name: 'update_node',
    description: 'Update properties on a node in a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
        nodePath: {
          type: 'string',
          description: 'Node path inside the scene',
        },
        properties: {
          type: 'object',
          description: 'Properties to set on the node',
        },
      },
      ['scenePath', 'nodePath', 'properties']
    ),
  },
  {
    name: 'move_node',
    description: 'Move a node to a new parent in a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
        nodePath: {
          type: 'string',
          description: 'Current node path',
        },
        newParent: {
          type: 'string',
          description: 'New parent node path',
        },
      },
      ['scenePath', 'nodePath', 'newParent']
    ),
  },
  {
    name: 'get_node_info',
    description: 'Get node metadata and properties from a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
        nodePath: {
          type: 'string',
          description: 'Node path inside the scene. Empty means the root node.',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'list_nodes',
    description: 'List the node tree for a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'find_nodes_by_type',
    description: 'Find nodes in a scene by node type',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Path to the scene file',
        },
        typeName: {
          type: 'string',
          description: 'Node type to search for',
        },
      },
      ['scenePath', 'typeName']
    ),
  },
  {
    name: 'create_script',
    description: 'Create a new script file',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
        content: {
          type: 'string',
          description: 'Script content',
        },
        baseType: {
          type: 'string',
          description: 'Optional base type used to inject extends automatically',
        },
      },
      ['path', 'content']
    ),
  },
  {
    name: 'read_script',
    description: 'Read a script file',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'update_script',
    description: 'Replace the full contents of a script file',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
        content: {
          type: 'string',
          description: 'New full script content',
        },
      },
      ['path', 'content']
    ),
  },
  {
    name: 'delete_script',
    description: 'Delete a script file',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'update_script_function',
    description: 'Replace a single function in a script',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
        functionName: {
          type: 'string',
          description: 'Function name to replace',
        },
        newFunctionContent: {
          type: 'string',
          description: 'Full replacement function text',
        },
      },
      ['path', 'functionName', 'newFunctionContent']
    ),
  },
  {
    name: 'update_script_range',
    description: 'Replace a line range inside a script',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
        startLine: {
          type: 'integer',
          description: '1-based start line',
        },
        endLine: {
          type: 'integer',
          description: '1-based end line',
        },
        newContent: {
          type: 'string',
          description: 'Replacement text for the range',
        },
      },
      ['path', 'startLine', 'endLine', 'newContent']
    ),
  },
  {
    name: 'attach_script',
    description: 'Attach a script to a node in a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
        nodePath: {
          type: 'string',
          description: 'Node path',
        },
        scriptPath: {
          type: 'string',
          description: 'Script path',
        },
      },
      ['scenePath', 'nodePath', 'scriptPath']
    ),
  },
  {
    name: 'detach_script',
    description: 'Detach the script from a node in a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
        nodePath: {
          type: 'string',
          description: 'Node path',
        },
      },
      ['scenePath', 'nodePath']
    ),
  },
  {
    name: 'compile_check',
    description: 'Check a script for compilation validity',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'get_script_structure',
    description: 'Extract extends, variables, and functions from a script',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Script path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'bind_resource',
    description: 'Bind a resource to a resource-typed node property',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
        nodePath: {
          type: 'string',
          description: 'Node path',
        },
        property: {
          type: 'string',
          description: 'Property name',
        },
        resourcePath: {
          type: 'string',
          description: 'Resource path to bind',
        },
      },
      ['scenePath', 'nodePath', 'property', 'resourcePath']
    ),
  },
  {
    name: 'unbind_resource',
    description: 'Clear a resource-typed node property',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
        nodePath: {
          type: 'string',
          description: 'Node path',
        },
        property: {
          type: 'string',
          description: 'Property name',
        },
      },
      ['scenePath', 'nodePath', 'property']
    ),
  },
  {
    name: 'batch_bind',
    description: 'Bind multiple resources into a scene in one call',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
        bindings: {
          type: 'array',
          description: 'List of bindings with nodePath, property, and resourcePath',
          items: {
            type: 'object',
            properties: {
              nodePath: { type: 'string' },
              property: { type: 'string' },
              resourcePath: { type: 'string' },
            },
            required: ['nodePath', 'property', 'resourcePath'],
          },
        },
      },
      ['scenePath', 'bindings']
    ),
  },
  {
    name: 'export_mesh_library',
    description: 'Export a scene as a MeshLibrary resource',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Source scene path',
        },
        outputPath: {
          type: 'string',
          description: 'Output MeshLibrary path',
        },
        meshItemNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of mesh item names to include',
        },
      },
      ['scenePath', 'outputPath']
    ),
  },
  {
    name: 'get_node_resources',
    description: 'List resource bindings on a node',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
        nodePath: {
          type: 'string',
          description: 'Node path',
        },
      },
      ['scenePath', 'nodePath']
    ),
  },
  {
    name: 'get_scene_resources',
    description: 'List all resource bindings in a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'get_uid',
    description: 'Get the UID sidecar value for a project resource',
    inputSchema: withProjectPath(
      {
        filePath: {
          type: 'string',
          description: 'Resource file path',
        },
      },
      ['filePath']
    ),
    requiresUidSupport: true,
  },
  {
    name: 'update_project_uids',
    description: 'Generate or refresh UID sidecars in the project',
    inputSchema: withProjectPath({
      directory: {
        type: 'string',
        description: 'Optional res:// subdirectory to limit the refresh scope',
      },
    }),
    requiresUidSupport: true,
    mapArgs: (args: Record<string, any>) => ({
      directory: args.directory,
    }),
  },
  {
    name: 'validate_scene',
    description: 'Validate scene structure and required nodes/resources',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'validate_resources',
    description: 'Validate resource bindings in a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'validate_script_references',
    description: 'Validate script references in a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'validate_all',
    description: 'Run all validation passes for a scene',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'validate_project',
    description:
      'Validate all scenes in the project at once. Scans for .tscn files under the given path and runs full validation on each.',
    inputSchema: withProjectPath({
      path: {
        type: 'string',
        description:
          'Optional root directory to scan (default: res://). Use to limit scope, e.g. res://scenes/',
      },
    }),
  },
  {
    name: 'add_input_action',
    description: 'Add or replace an input action in project settings',
    inputSchema: withProjectPath(
      {
        actionName: {
          type: 'string',
          description: 'Input action name',
        },
        events: {
          type: 'array',
          description: 'Input event definitions',
          items: {
            type: 'object',
          },
        },
      },
      ['actionName', 'events']
    ),
  },
  {
    name: 'remove_input_action',
    description: 'Remove an input action from project settings',
    inputSchema: withProjectPath(
      {
        actionName: {
          type: 'string',
          description: 'Input action name',
        },
      },
      ['actionName']
    ),
  },
  {
    name: 'get_input_actions',
    description: 'List input actions from project settings',
    inputSchema: withProjectPath({}),
  },
  {
    name: 'set_layer_name',
    description: 'Set a named physics or render layer',
    inputSchema: withProjectPath(
      {
        layerType: {
          type: 'string',
          description: 'Layer namespace, for example 2d_physics',
        },
        layerNumber: {
          type: 'integer',
          description: 'Layer number from 1 to 32',
        },
        name: {
          type: 'string',
          description: 'Layer display name',
        },
      },
      ['layerType', 'layerNumber', 'name']
    ),
  },
  {
    name: 'get_layer_names',
    description: 'List named layers from project settings',
    inputSchema: withProjectPath(
      {
        layerType: {
          type: 'string',
          description: 'Layer namespace, for example 2d_physics',
        },
      },
      ['layerType']
    ),
  },
  {
    name: 'add_autoload',
    description: 'Register an autoload singleton in project settings',
    inputSchema: withProjectPath(
      {
        name: {
          type: 'string',
          description: 'Autoload name',
        },
        path: {
          type: 'string',
          description: 'Script or scene path',
        },
      },
      ['name', 'path']
    ),
  },
  {
    name: 'remove_autoload',
    description: 'Remove an autoload singleton from project settings',
    inputSchema: withProjectPath(
      {
        name: {
          type: 'string',
          description: 'Autoload name',
        },
      },
      ['name']
    ),
  },
  {
    name: 'get_autoloads',
    description: 'List autoload singletons from project settings',
    inputSchema: withProjectPath({}),
  },
  {
    name: 'set_project_setting',
    description: 'Set a project setting value',
    inputSchema: withProjectPath(
      {
        key: {
          type: 'string',
          description: 'Project setting key',
        },
        value: {
          description: 'Value to store',
        },
      },
      ['key', 'value']
    ),
    mapArgs: (args: Record<string, any>) => ({
      key: args.key,
      value: args.value,
    }),
  },
  {
    name: 'get_project_setting',
    description: 'Read a project setting value',
    inputSchema: withProjectPath(
      {
        key: {
          type: 'string',
          description: 'Project setting key',
        },
      },
      ['key']
    ),
    mapArgs: (args: Record<string, any>) => ({
      key: args.key,
    }),
  },
  {
    name: 'get_directory_tree',
    description: 'Return a directory tree under the project',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Directory path to inspect',
        },
        options: {
          type: 'object',
          description: 'Optional traversal options like maxDepth or includePattern',
        },
      },
      ['path']
    ),
  },
  {
    name: 'read_file',
    description: 'Read a text file inside the project',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'File path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'write_file',
    description: 'Write a text file inside the project',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'File path',
        },
        content: {
          type: 'string',
          description: 'File content',
        },
      },
      ['path', 'content']
    ),
  },
  {
    name: 'file_exists',
    description: 'Check whether a file exists inside the project',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'File path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'dir_exists',
    description: 'Check whether a directory exists inside the project',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Directory path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'list_files',
    description: 'List files in a project directory',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'Directory path',
        },
        pattern: {
          type: 'string',
          description: 'Optional wildcard pattern',
        },
      },
      ['path']
    ),
  },
  {
    name: 'get_file_info',
    description: 'Get size and metadata for a project file',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'File path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'copy_file',
    description: 'Copy a file inside the project',
    inputSchema: withProjectPath(
      {
        from: {
          type: 'string',
          description: 'Source file path',
        },
        to: {
          type: 'string',
          description: 'Destination file path',
        },
      },
      ['from', 'to']
    ),
  },
  {
    name: 'move_file',
    description: 'Move or rename a file inside the project',
    inputSchema: withProjectPath(
      {
        from: {
          type: 'string',
          description: 'Source file path',
        },
        to: {
          type: 'string',
          description: 'Destination file path',
        },
      },
      ['from', 'to']
    ),
  },
  {
    name: 'delete_file',
    description: 'Delete a file inside the project',
    inputSchema: withProjectPath(
      {
        path: {
          type: 'string',
          description: 'File path',
        },
      },
      ['path']
    ),
  },
  {
    name: 'grep',
    description: 'Search project files for plain text or regex matches',
    inputSchema: withProjectPath(
      {
        pattern: {
          type: 'string',
          description: 'Pattern to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory path to search',
        },
        options: {
          type: 'object',
          description: 'Search options like regex, contextLines, maxResults, or filePattern',
        },
      },
      ['pattern', 'path']
    ),
  },
  {
    name: 'get_editor_logs',
    description: 'Read SDK and engine log entries for the project',
    inputSchema: withProjectPath({
      options: {
        type: 'object',
        description: 'Optional filters like level, limit, or afterTimestamp',
      },
    }),
  },
  {
    name: 'get_log_timestamp',
    description: 'Capture a log cursor timestamp for later incremental reads',
    inputSchema: withProjectPath({}),
  },
  {
    name: 'run_scene',
    description: 'Play the main scene or a custom scene. Requires editor context.',
    inputSchema: withProjectPath({
      scenePath: {
        type: 'string',
        description: 'Optional custom scene path to run',
      },
    }),
  },
  {
    name: 'stop_scene',
    description: 'Stop the currently playing scene. Requires editor context.',
    inputSchema: withProjectPath({}),
  },
  {
    name: 'open_scene',
    description: 'Open a scene in the editor. Requires editor context.',
    inputSchema: withProjectPath(
      {
        scenePath: {
          type: 'string',
          description: 'Scene path to open',
        },
      },
      ['scenePath']
    ),
  },
  {
    name: 'open_script',
    description: 'Open a script in the editor. Requires editor context.',
    inputSchema: withProjectPath(
      {
        scriptPath: {
          type: 'string',
          description: 'Script path to open',
        },
        line: {
          type: 'integer',
          description: 'Optional line number',
        },
      },
      ['scriptPath']
    ),
  },
  {
    name: 'refresh_filesystem',
    description: 'Refresh the Godot editor filesystem dock. Requires editor context.',
    inputSchema: withProjectPath({}),
  },
  {
    name: 'get_open_scenes',
    description: 'List currently open scenes in the editor. Requires editor context.',
    inputSchema: withProjectPath({}),
  },
  {
    name: 'editor_get_project_info',
    description: 'Read project metadata through SDK EditorOps',
    inputSchema: withProjectPath({}),
  },
];

export const SDK_TOOL_DEFINITIONS: SdkToolDefinition[] = SDK_TOOL_DEFINITION_BASE.map((definition) => ({
  ...definition,
  operation: definition.operation ?? definition.name,
  mapArgs: definition.mapArgs ?? omitProjectPath,
}));

export const SDK_TOOL_NAMES = new Set(
  SDK_TOOL_DEFINITIONS.map((definition) => definition.name)
);
