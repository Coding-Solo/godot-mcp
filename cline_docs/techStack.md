# Tech Stack: Godot MCP Server

## Core Technologies
- **Node.js:** Runtime environment for the MCP server.
- **TypeScript:** Primary language for the server codebase, providing static typing.
- **Godot Engine:** Target game engine for interactions.
- **GDScript:** Language used for the Godot-side operations script (`godot_operations.gd`).

## Key Libraries/Modules
- **@modelcontextprotocol/sdk:** Used for MCP server implementation (`Server`, `StdioServerTransport`, schemas).
- **Node.js `child_process`:**
    - `spawn`: Used for executing the Godot command-line tool reliably, especially for passing complex arguments like JSON strings. Configured with `shell: false` for better cross-platform argument handling.
    - `exec` / `execAsync`: Potentially used for simpler commands like `--version` or launching the editor.
- **Node.js `fs`:** Used for file system checks (`existsSync`, `readdirSync`).
- **Node.js `path`:** Used for path manipulation and normalization (`join`, `dirname`, `basename`, `normalize`).

## Architecture Decisions
- **MCP Server (`src/index.ts`):** Handles incoming MCP tool requests, validates parameters, prepares arguments, and invokes the Godot operations script.
- **Godot Operations Script (`src/scripts/godot_operations.gd`):** A headless Godot script that receives commands and JSON parameters via command-line arguments. It performs the actual Godot engine operations (e.g., creating scenes, adding nodes).
- **Argument Passing:** JSON strings are passed as command-line arguments from Node.js to the GDScript. Using `spawn` with `shell: false` is crucial for correct parsing on Windows, avoiding shell interpretation issues.
- **Parameter Normalization:** The Node.js server normalizes incoming MCP arguments (potentially camelCase) to snake_case before sending them to the GDScript, which expects snake_case.
