# Codebase Summary: Godot MCP Server

## Key Components and Their Interactions

### 1. MCP Server (`src/index.ts`)
- **Purpose:** Acts as the bridge between the MCP client (e.g., AI assistant) and the Godot engine.
- **Functionality:**
    - Initializes an MCP server using `@modelcontextprotocol/sdk`.
    - Defines available tools (`create_scene`, `add_node`, etc.) with their input/output schemas using `setRequestHandler`.
    - Handles incoming `CallToolRequest` messages.
    - Normalizes incoming parameters (camelCase to snake_case).
    - Detects the Godot executable path.
    - Constructs command-line arguments, including the operation name and a JSON string of parameters.
    - Invokes the `godot_operations.gd` script using `child_process.spawn` (configured with `shell: false`).
    - Captures stdout/stderr from the Godot process.
    - Formats and returns the result or error to the MCP client.
- **Key Methods:** `constructor`, `setupToolHandlers`, `executeOperation`, individual tool handlers (`handleCreateScene`, etc.).

### 2. Godot Operations Script (`src/scripts/godot_operations.gd`)
- **Purpose:** Executes specific Godot engine actions based on commands received from the MCP server.
- **Functionality:**
    - Runs as a headless Godot script (`extends SceneTree`).
    - Parses command-line arguments to get the operation name and JSON parameter string.
    - Uses `JSON.parse()` to convert the JSON string into a Godot Dictionary (`params`).
    - Uses a `match` statement to call the appropriate function based on the operation name.
    - Contains functions for each tool operation (e.g., `create_scene`, `add_node`).
    - Interacts with Godot APIs (`ResourceSaver`, `PackedScene`, `Node`, `ClassDB`, `DirAccess`, `FileAccess`, etc.) to perform actions.
    - Includes specific cleanup logic (e.g., freeing instantiated nodes (`scene_root.free()`), adding delays) in functions like `add_node`, `create_scene`, `load_sprite`, `export_mesh_library`, and `save_scene` to prevent resource leaks or issues in headless mode.
    - Prints success messages to stdout or error messages to stderr.
    - Exits using `quit()`.
- **Key Methods:** `_init`, `create_scene`, `add_node`, `load_sprite`, `export_mesh_library`, `save_scene`, etc., `log_*`, `instantiate_class`.

### Interaction Flow (`create_scene` example)
1.  MCP client sends `CallToolRequest` for `create_scene` with arguments (projectPath, scenePath, rootNodeType).
2.  `src/index.ts` receives the request via `setRequestHandler(CallToolRequestSchema, ...)`.
3.  `handleCreateScene` is called.
4.  Parameters are normalized (camelCase to snake_case).
5.  `executeOperation` is called with operation "create_scene" and snake_case params.
6.  `executeOperation` converts params to a JSON string.
7.  `executeOperation` calls `spawn` with the Godot executable path, `--headless`, `--path`, `--script`, the operation name ("create_scene"), and the JSON string as arguments (`shell: false`).
8.  `godot_operations.gd` starts execution.
9.  `_init` parses command-line args, extracts "create_scene" and the JSON string.
10. `_init` calls `JSON.parse()` on the JSON string.
11. `_init` calls the `create_scene(params)` function with the parsed Dictionary.
12. `create_scene` function uses Godot APIs to create the root node, pack the scene, ensure the directory exists, and save the `.tscn` file using `ResourceSaver.save()`.
13. `create_scene` prints success/error messages.
14. Godot script exits (`quit()`).
15. `executeOperation` in `src/index.ts` resolves its promise with stdout/stderr.
16. `handleCreateScene` processes stdout/stderr and returns a result object to the MCP client.

## Data Flow
- **Input:** MCP `CallToolRequest` with JSON arguments (camelCase or snake_case).
- **Internal:**
    - Node.js normalizes arguments to snake_case.
    - Node.js serializes snake_case arguments to a JSON string.
    - JSON string passed as a command-line argument to GDScript.
    - GDScript parses the JSON string back into a Dictionary.
- **Output:** MCP response object containing success/error message and relevant data (e.g., created scene path). Stdout/stderr from Godot script captured by Node.js.

## External Dependencies
- **@modelcontextprotocol/sdk:** Core dependency for MCP communication. Managed via `package.json` and `npm`.
- **Godot Engine:** External executable. Path is auto-detected or configured via environment variable/server config. The server relies on Godot's command-line interface and headless execution capabilities.

## Recent Significant Changes
- **Argument Passing:** Switched from `spawn` with `shell: true` and manual escaping to `spawn` with `shell: false` and passing the raw JSON string. This resolved issues with argument parsing on Windows.
- **MCP SDK Usage:** Refactored tool registration from `server.registerTool` to using `server.setRequestHandler` for `ListToolsRequestSchema` and `CallToolRequestSchema`, aligning with current SDK practices.
- **GDScript Error Fix:** Removed incorrect `scene_root.owner = scene_root` assignment in `create_scene` function, resolving a Godot engine assertion error during `PackedScene.pack()`.
- **Logging:** Added detailed debug logging in both `index.ts` and `godot_operations.gd` to trace argument passing and execution flow.
- **`add_node` Fixes:** Debugged and resolved multiple issues in the `add_node` GDScript function:
    - Addressed initial "RID allocation leak" errors by adding `scene_root.free()`.
    - Resolved subsequent node duplication issues (likely caused by freeing `scene_root` too early) by adding a small delay (`OS.delay_msec(100)`) after `ResourceSaver.save()` but before `scene_root.free()` in `add_node`.
    - Corrected a "Can't free a RefCounted object" error introduced by incorrectly trying to free the `PackedScene` resource.
- **RID Leak Fix:** Added missing `scene_root.free()` calls to the end of `create_scene`, `load_sprite`, `export_mesh_library`, and `save_scene` functions in `godot_operations.gd` to resolve RID allocation leaks observed during testing.
- **`resave_resources` Fix:** Addressed issues with the `resave_resources` tool:
    - Modified `godot_operations.gd` (`_init`) to make the JSON parameter optional and default to an empty dictionary if not provided.
    - Added explicit parameter validation checks within specific GDScript functions that require them.
    - Added a small delay (`OS.delay_msec(100)`) before `quit()` in `godot_operations.gd` to potentially aid output buffer flushing.
    - Updated the `handleUpdateProjectUids` function in `index.ts` to infer success based on the Godot script's exit code (0) and the absence of "ERROR" in stderr, improving reliability over parsing stdout.

## User Feedback Integration
- N/A (No user feedback integrated yet for this specific task).
