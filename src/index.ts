#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import { fileURLToPath } from 'url';
import { join, dirname, basename, normalize } from 'path';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE: boolean = true; // Always use GODOT DEBUG MODE

const execAsync = promisify(exec);

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface representing a running Godot process
 */
interface GodotProcess {
  process: any;
  output: string[];
  errors: string[];
}

/**
 * Interface for server configuration
 */
interface GodotServerConfig {
  godotPath?: string;
  debugMode?: boolean;
  godotDebugMode?: boolean;
  strictPathValidation?: boolean; // New option to control path validation behavior
}

/**
 * Interface for operation parameters
 */
interface OperationParams {
  [key: string]: any;
}

/**
 * Main server class for the Godot MCP server
 */
class GodotServer {
  private server: Server;
  private activeProcess: GodotProcess | null = null;
  private godotPath: string | null = null;
  private operationsScriptPath: string;
  private validatedPaths: Map<string, boolean> = new Map();
  private strictPathValidation: boolean = false;

  /**
   * Parameter name mappings between snake_case and camelCase
   * This allows the server to accept both formats
   */
  private parameterMappings: Record<string, string> = {
    'project_path': 'projectPath',
    'scene_path': 'scenePath',
    'root_node_type': 'rootNodeType',
    'parent_node_path': 'parentNodePath',
    'node_type': 'nodeType',
    'node_name': 'nodeName',
    'texture_path': 'texturePath',
    'node_path': 'nodePath',
    'output_path': 'outputPath',
    'mesh_item_names': 'meshItemNames',
    'new_path': 'newPath',
    'file_path': 'filePath',
    'directory': 'directory',
    'recursive': 'recursive',
    'scene': 'scene',
  };

  /**
   * Reverse mapping from camelCase to snake_case
   * Generated from parameterMappings for quick lookups
   */
  private reverseParameterMappings: Record<string, string> = {};

  constructor(config?: GodotServerConfig) {
    // Initialize reverse parameter mappings
    for (const [snakeCase, camelCase] of Object.entries(this.parameterMappings)) {
      this.reverseParameterMappings[camelCase] = snakeCase;
    }
    // Apply configuration if provided
    let debugMode = DEBUG_MODE;
    let godotDebugMode = GODOT_DEBUG_MODE;

    if (config) {
      if (config.debugMode !== undefined) {
        debugMode = config.debugMode;
      }
      if (config.godotDebugMode !== undefined) {
        godotDebugMode = config.godotDebugMode;
      }
      if (config.strictPathValidation !== undefined) {
        this.strictPathValidation = config.strictPathValidation;
      }

      // Store and validate custom Godot path if provided
      if (config.godotPath) {
        const normalizedPath = normalize(config.godotPath);
        this.godotPath = normalizedPath;
        this.logDebug(`Custom Godot path provided: ${this.godotPath}`);

        // Validate immediately with sync check
        if (!this.isValidGodotPathSync(this.godotPath)) {
          console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
          this.godotPath = null; // Reset to trigger auto-detection later
        }
      }
    }

    // Set the path to the operations script
    this.operationsScriptPath = join(__dirname, 'scripts', 'godot_operations.gd');
    if (debugMode) console.debug(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

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
   * Log debug messages if debug mode is enabled
   */
  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.debug(`[DEBUG] ${message}`);
    }
  }

  /**
   * Create a standardized error response with possible solutions
   */
  private createErrorResponse(message: string, possibleSolutions: string[] = []): any {
    // Log the error
    console.error(`[SERVER] Error response: ${message}`);
    if (possibleSolutions.length > 0) {
      console.error(`[SERVER] Possible solutions: ${possibleSolutions.join(', ')}`);
    }

    const response: any = {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };

    if (possibleSolutions.length > 0) {
      response.content.push({
        type: 'text',
        text: 'Possible solutions:\n- ' + possibleSolutions.join('\n- '),
      });
    }

    return response;
  }

  /**
   * Validate a path to prevent path traversal attacks
   */
  private validatePath(path: string): boolean {
    // Basic validation to prevent path traversal
    if (!path || path.includes('..')) {
      return false;
    }

    // Add more validation as needed
    return true;
  }

  /**
   * Synchronous validation for constructor use
   * This is a quick check that only verifies file existence, not executable validity
   * Full validation will be performed later in detectGodotPath
   * @param path Path to check
   * @returns True if the path exists or is 'godot' (which might be in PATH)
   */
  private isValidGodotPathSync(path: string): boolean {
    try {
      this.logDebug(`Quick-validating Godot path: ${path}`);
      return path === 'godot' || existsSync(path);
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      return false;
    }
  }

  /**
   * Validate if a Godot path is valid and executable
   */
  private async isValidGodotPath(path: string): Promise<boolean> {
    // Check cache first
    if (this.validatedPaths.has(path)) {
      return this.validatedPaths.get(path)!;
    }

    try {
      this.logDebug(`Validating Godot path: ${path}`);

      // Check if the file exists (skip for 'godot' which might be in PATH)
      if (path !== 'godot' && !existsSync(path)) {
        this.logDebug(`Path does not exist: ${path}`);
        this.validatedPaths.set(path, false);
        return false;
      }

      // Try to execute Godot with --version flag
      const command = path === 'godot' ? 'godot --version' : `"${path}" --version`;
      await execAsync(command);

      this.logDebug(`Valid Godot path: ${path}`);
      this.validatedPaths.set(path, true);
      return true;
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      this.validatedPaths.set(path, false);
      return false;
    }
  }

  /**
   * Detect the Godot executable path based on the operating system
   */
  private async detectGodotPath() {
    // If godotPath is already set and valid, use it
    if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
      this.logDebug(`Using existing Godot path: ${this.godotPath}`);
      return;
    }

    // Check environment variable next
    if (process.env.GODOT_PATH) {
      const normalizedPath = normalize(process.env.GODOT_PATH);
      this.logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Using Godot path from environment: ${this.godotPath}`);
        return;
      } else {
        this.logDebug(`GODOT_PATH environment variable is invalid`);
      }
    }

    // Auto-detect based on platform
    const osPlatform = process.platform;
    this.logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);

    const possiblePaths: string[] = [
      'godot', // Check if 'godot' is in PATH first
    ];

    // Add platform-specific paths
    if (osPlatform === 'darwin') {
      possiblePaths.push(
        '/Applications/Godot.app/Contents/MacOS/Godot',
        '/Applications/Godot_4.app/Contents/MacOS/Godot',
        `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`
      );
    } else if (osPlatform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Godot\\Godot.exe',
        'C:\\Program Files (x86)\\Godot\\Godot.exe',
        'C:\\Program Files\\Godot_4\\Godot.exe',
        'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
        `${process.env.USERPROFILE}\\Godot\\Godot.exe`
      );
    } else if (osPlatform === 'linux') {
      possiblePaths.push(
        '/usr/bin/godot',
        '/usr/local/bin/godot',
        '/snap/bin/godot',
        `${process.env.HOME}/.local/bin/godot`
      );
    }

    // Try each possible path
    for (const path of possiblePaths) {
      const normalizedPath = normalize(path);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Found Godot at: ${normalizedPath}`);
        return;
      }
    }

    // If we get here, we couldn't find Godot
    this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
    console.warn(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
    console.warn(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

    if (this.strictPathValidation) {
      // In strict mode, throw an error
      throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
    } else {
      // Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
      if (osPlatform === 'win32') {
        this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
      } else if (osPlatform === 'darwin') {
        this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
      } else {
        this.godotPath = normalize('/usr/bin/godot');
      }

      this.logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
      console.warn(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
      console.warn(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
    }
  }

  /**
   * Set a custom Godot path
   * @param customPath Path to the Godot executable
   * @returns True if the path is valid and was set, false otherwise
   */
  public async setGodotPath(customPath: string): Promise<boolean> {
    if (!customPath) {
      return false;
    }

    // Normalize the path to ensure consistent format across platforms
    // (e.g., backslashes to forward slashes on Windows, resolving relative paths)
    const normalizedPath = normalize(customPath);
    if (await this.isValidGodotPath(normalizedPath)) {
      this.godotPath = normalizedPath;
      this.logDebug(`Godot path set to: ${normalizedPath}`);
      return true;
    }

    this.logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
    return false;
  }

  /**
   * Clean up resources when shutting down
   */
  private async cleanup() {
    this.logDebug('Cleaning up resources');
    if (this.activeProcess) {
      this.logDebug('Killing active Godot process');
      this.activeProcess.process.kill();
      this.activeProcess = null;
    }
    await this.server.close();
  }

  /**
   * Check if the Godot version is 4.4 or later
   * @param version The Godot version string
   * @returns True if the version is 4.4 or later
   */
  private isGodot44OrLater(version: string): boolean {
    const match = version.match(/^(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      return major > 4 || (major === 4 && minor >= 4);
    }
    return false;
  }

  /**
   * Normalize parameters to camelCase format
   * @param params Object with either snake_case or camelCase keys
   * @returns Object with all keys in camelCase format
   */
  private normalizeParameters(params: OperationParams): OperationParams {
    if (!params || typeof params !== 'object') {
      return params;
    }
    
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        let normalizedKey = key;
        
        // If the key is in snake_case, convert it to camelCase using our mapping
        if (key.includes('_') && this.parameterMappings[key]) {
          normalizedKey = this.parameterMappings[key];
        }
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[normalizedKey] = this.normalizeParameters(params[key] as OperationParams);
        } else {
          result[normalizedKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Convert camelCase keys to snake_case
   * @param params Object with camelCase keys
   * @returns Object with snake_case keys
   */
  private convertCamelToSnakeCase(params: OperationParams): OperationParams {
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        // Convert camelCase to snake_case
        const snakeKey = this.reverseParameterMappings[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[snakeKey] = this.convertCamelToSnakeCase(params[key] as OperationParams);
        } else {
          result[snakeKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Execute a Godot operation using the operations script
   * @param operation The operation to execute
   * @param params The parameters for the operation
   * @param projectPath The path to the Godot project
   * @returns The stdout and stderr from the operation
   */
  private async executeOperation(
    operation: string,
    params: OperationParams,
    projectPath: string
  ): Promise<{ stdout: string; stderr: string }> {
    this.logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
    this.logDebug(`Original operation params: ${JSON.stringify(params)}`);

    // Convert camelCase parameters to snake_case for Godot script
    const snakeCaseParams = this.convertCamelToSnakeCase(params);
    this.logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);


    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    try {
      // Serialize the snake_case parameters to a valid JSON string
      const paramsJson = JSON.stringify(snakeCaseParams);
      // NO escaping needed when shell: false

      // Construct arguments array for spawn (shell: false)
      const args: string[] = [
        '--headless',
        '--path',
        projectPath, // spawn handles spaces in paths correctly when shell: false
        '--script',
        this.operationsScriptPath,
        operation,
        paramsJson, // Pass the raw, unescaped JSON string
      ];

      // Add debug flag if enabled
      if (GODOT_DEBUG_MODE) {
        args.push('--debug-godot');
      }

      // *** START DEBUG LOGGING ***
      this.logDebug(`[executeOperation] Operation: ${operation}`);
      this.logDebug(`[executeOperation] Original camelCase params: ${JSON.stringify(params)}`);
      this.logDebug(`[executeOperation] Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);
      this.logDebug(`[executeOperation] Serialized JSON for Godot (passed directly): ${paramsJson}`);
      this.logDebug(`[executeOperation] Final arguments array for spawn (shell: false): ${JSON.stringify(args)}`);
      this.logDebug(`[executeOperation] Spawning command (shell: false): ${this.godotPath}`);
      // *** END DEBUG LOGGING ***

      // Use spawn WITH shell: false
      // Ensure godotPath does not have extra quotes if it's a direct path or is in PATH
      const commandToSpawn = this.godotPath; // Use the path directly

      this.logDebug(`Spawning Godot (shell: false): "${commandToSpawn}" with args: ${JSON.stringify(args)}`);

      const godotProcess = spawn(commandToSpawn, args, {
        shell: false, // Explicitly set to false
        stdio: ['pipe', 'pipe', 'pipe'], // Capture stdout, stderr
      });

      let stdout = '';
      let stderr = '';

      godotProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.logDebug(`Godot stdout: ${output}`);
      });

      godotProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        stderr += errorOutput;
        console.error(`Godot stderr: ${errorOutput}`);
      });

      return new Promise((resolve, reject) => {
        godotProcess.on('close', (code) => {
          this.logDebug(`Godot process exited with code ${code}`);
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            // Include stderr in the rejection error for more context
            reject(new Error(`Godot process exited with code ${code}. Stderr: ${stderr || 'N/A'}`));
          }
        });

        godotProcess.on('error', (err) => {
          console.error('Failed to start Godot process:', err);
          reject(err);
        });
      });
    } catch (error: any) {
      console.error(`Error executing Godot operation: ${error.message}`);
      throw error; // Re-throw the error to be handled by the caller
    }
  }

  /**
   * Get the project structure (scenes and scripts)
   * @param projectPath Path to the Godot project
   * @returns Project structure information
   */
  private async getProjectStructure(projectPath: string): Promise<any> {
    this.logDebug(`Getting project structure for: ${projectPath}`);
    if (!this.validatePath(projectPath)) {
      throw new Error('Invalid project path');
    }

    const structure: any = { scenes: [], scripts: [] };
    const readDirRecursive = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = fullPath.substring(projectPath.length + 1).replace(/\\/g, '/'); // Relative path with forward slashes

          if (entry.isDirectory()) {
            // Skip common hidden/system directories
            if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.vscode' || entry.name === '.godot') {
              continue;
            }
            readDirRecursive(fullPath);
          } else if (entry.isFile()) {
            if (entry.name.endsWith('.tscn') || entry.name.endsWith('.scn')) {
              structure.scenes.push({ name: entry.name, path: relativePath });
            } else if (entry.name.endsWith('.gd')) {
              structure.scripts.push({ name: entry.name, path: relativePath });
            }
          }
        }
      } catch (error: any) {
        console.error(`Error reading directory ${dir}: ${error.message}`);
        // Optionally re-throw or handle specific errors like permission denied
      }
    };

    readDirRecursive(projectPath);
    this.logDebug(`Project structure retrieved: ${JSON.stringify(structure)}`);
    return structure;
  }


  /**
   * Find Godot projects within a directory
   * @param directory The directory to search in
   * @param recursive Whether to search recursively
   * @returns An array of found Godot projects with their paths and names
   */
  private findGodotProjects(directory: string, recursive: boolean): Array<{ path: string; name: string }> {
    this.logDebug(`Finding Godot projects in: ${directory}, recursive: ${recursive}`);
    if (!this.validatePath(directory)) {
      throw new Error('Invalid directory path');
    }

    const projects: Array<{ path: string; name: string }> = [];
    const searchDir = (currentDir: string, depth: number) => {
      try {
        const entries = readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);
          if (entry.isDirectory()) {
            // Check if this directory contains a project.godot file
            if (existsSync(join(fullPath, 'project.godot'))) {
              projects.push({ path: fullPath, name: basename(fullPath) });
              // If not recursive, stop searching deeper in this branch
              if (!recursive) continue;
            }
            // Recurse if allowed
            if (recursive) {
               // Skip common hidden/system directories
               if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.vscode' || entry.name === '.godot') {
                 continue;
               }
              searchDir(fullPath, depth + 1);
            }
          } else if (entry.isFile() && entry.name === 'project.godot' && depth === 0) {
            // Found project.godot in the starting directory itself
            // Avoid adding the starting directory if it was already added by finding project.godot inside it
            if (!projects.some(p => p.path === currentDir)) {
               projects.push({ path: currentDir, name: basename(currentDir) });
            }
          }
        }
      } catch (error: any) {
        console.error(`Error searching directory ${currentDir}: ${error.message}`);
      }
    };

    searchDir(directory, 0);
    this.logDebug(`Found projects: ${JSON.stringify(projects)}`);
    return projects;
  }

  /**
   * Set up handlers for all available tools
   */
  private setupToolHandlers() {
    this.logDebug('Setting up tool handlers');

    // Define tools metadata (used for ListTools and CallTool routing)
    const toolDefinitions = {
      launch_editor: {
        description: 'Launch the Godot editor for a specific project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
          },
          required: ['projectPath'],
        },
        outputSchema: { type: 'object', properties: { message: { type: 'string' } } },
        handler: this.handleLaunchEditor.bind(this),
      },
      run_project: {
        description: 'Run a Godot project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
            debug: { type: 'boolean', description: 'Run with debug enabled.', default: false },
          },
          required: ['projectPath'],
        },
        outputSchema: { type: 'object', properties: { message: { type: 'string' }, pid: { type: 'number' } } },
        handler: this.handleRunProject.bind(this),
      },
      get_debug_output: {
        description: 'Get the captured debug output from the last run project.',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: { output: { type: 'array', items: { type: 'string' } }, errors: { type: 'array', items: { type: 'string' } } } },
        handler: this.handleGetDebugOutput.bind(this),
      },
      stop_project: {
        description: 'Stop the currently running Godot project.',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: { message: { type: 'string' } } },
        handler: this.handleStopProject.bind(this),
      },
      get_godot_version: {
         description: 'Get the version of the configured Godot executable.',
         inputSchema: { type: 'object', properties: {} },
         outputSchema: { type: 'object', properties: { version: { type: 'string' } } },
         handler: this.handleGetGodotVersion.bind(this),
       },
       list_projects: {
         description: 'List Godot projects found in a specified directory.',
         inputSchema: {
           type: 'object',
           properties: {
             directory: { type: 'string', description: 'The directory to search for projects.' },
             recursive: { type: 'boolean', description: 'Search recursively.', default: false },
           },
           required: ['directory'],
         },
         outputSchema: {
           type: 'object',
           properties: {
             projects: {
               type: 'array',
               items: {
                 type: 'object',
                 properties: {
                   name: { type: 'string' },
                   path: { type: 'string' },
                 },
                 required: ['name', 'path'],
               },
             },
           },
         },
         handler: this.handleListProjects.bind(this),
       },
       get_project_info: {
         description: 'Get information about a Godot project, including scenes and scripts.',
         inputSchema: {
           type: 'object',
           properties: {
             projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
           },
           required: ['projectPath'],
         },
         outputSchema: {
           type: 'object',
           properties: {
             scenes: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string' } } } },
             scripts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string' } } } },
           },
         },
         handler: this.handleGetProjectInfo.bind(this),
       },
      create_scene: {
        description: 'Create a new scene file (.tscn) with a specified root node type.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
            scenePath: { type: 'string', description: 'Relative path within the project (e.g., "scenes/main.tscn").' },
            rootNodeType: { type: 'string', description: 'The type of the root node (e.g., "Node2D", "Control").', default: 'Node2D' },
          },
          required: ['projectPath', 'scenePath'],
        },
        outputSchema: { type: 'object', properties: { message: { type: 'string' }, scenePath: { type: 'string' } } },
        handler: this.handleCreateScene.bind(this),
      },
      add_node: {
        description: 'Add a new node to an existing scene.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
            scenePath: { type: 'string', description: 'Relative path to the scene file (e.g., "scenes/main.tscn").' },
            parentNodePath: { type: 'string', description: 'NodePath to the parent node (e.g., "root/Player"). Defaults to "root".' },
            nodeType: { type: 'string', description: 'The type of node to add (e.g., "Sprite2D", "Button").' },
            nodeName: { type: 'string', description: 'The name for the new node.' },
          },
          required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
        },
        outputSchema: { type: 'object', properties: { message: { type: 'string' }, nodePath: { type: 'string' } } },
        handler: this.handleAddNode.bind(this),
      },
      load_sprite: {
         description: 'Load a sprite texture onto a Sprite2D node in a scene.',
         inputSchema: {
           type: 'object',
           properties: {
             projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
             scenePath: { type: 'string', description: 'Relative path to the scene file.' },
             nodePath: { type: 'string', description: 'NodePath to the Sprite2D node.' },
             texturePath: { type: 'string', description: 'Resource path (res://) to the texture file.' },
           },
           required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
         },
         outputSchema: { type: 'object', properties: { message: { type: 'string' } } },
         handler: this.handleLoadSprite.bind(this),
       },
       export_mesh_library: {
         description: 'Export selected MeshInstance3D nodes from a scene into a MeshLibrary resource.',
         inputSchema: {
           type: 'object',
           properties: {
             projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
             scenePath: { type: 'string', description: 'Relative path to the scene file containing the meshes.' },
             meshItemNames: { type: 'array', items: { type: 'string' }, description: 'Array of names of the MeshInstance3D nodes to include.' },
             outputPath: { type: 'string', description: 'Resource path (res://) for the output MeshLibrary file (e.g., "meshlibs/level1.meshlib").' },
           },
           required: ['projectPath', 'scenePath', 'meshItemNames', 'outputPath'],
         },
         outputSchema: { type: 'object', properties: { message: { type: 'string' }, outputPath: { type: 'string' } } },
         handler: this.handleExportMeshLibrary.bind(this),
       },
       save_scene: {
         description: 'Save changes made to a scene.',
         inputSchema: {
           type: 'object',
           properties: {
             projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
             scenePath: { type: 'string', description: 'Relative path to the scene file to save.' },
             newPath: { type: 'string', description: '(Optional) New relative path to save the scene as (Save As).' },
           },
           required: ['projectPath', 'scenePath'],
         },
         outputSchema: { type: 'object', properties: { message: { type: 'string' }, savedPath: { type: 'string' } } },
         handler: this.handleSaveScene.bind(this),
       },
       get_uid: {
         description: 'Get the UID (Unique ID) for a resource path.',
         inputSchema: {
           type: 'object',
           properties: {
             projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
             filePath: { type: 'string', description: 'Resource path (res://) to the file.' },
           },
           required: ['projectPath', 'filePath'],
         },
         outputSchema: { type: 'object', properties: { uid: { type: 'string' } } }, // UID might be a string or number depending on Godot version/context
         handler: this.handleGetUid.bind(this),
       },
       resave_resources: {
         description: 'Resave all resources in a project to update UIDs and dependencies. Use with caution.',
         inputSchema: {
           type: 'object',
           properties: {
             projectPath: { type: 'string', description: 'Absolute path to the Godot project directory.' },
           },
           required: ['projectPath'],
         },
         outputSchema: { type: 'object', properties: { message: { type: 'string' } } },
         handler: this.handleUpdateProjectUids.bind(this), // Assuming this handler does the resaving
       },
    };

    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logDebug('Handling ListToolsRequest');
      return {
        tools: Object.entries(toolDefinitions).map(([name, def]) => ({
          name: name,
          description: def.description,
          inputSchema: def.inputSchema,
          // outputSchema is often omitted in ListTools response, but include if needed
        })),
      };
    });

    // Handler for calling a specific tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments;
      this.logDebug(`Handling CallToolRequest for tool: ${toolName} with args: ${JSON.stringify(args)}`);

      const toolDef = toolDefinitions[toolName as keyof typeof toolDefinitions];

      if (!toolDef) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
      }

      try {
        // Ensure Godot path is detected before executing any tool handler
        if (!this.godotPath) {
          await this.detectGodotPath();
        }
        // Call the specific handler associated with the tool name
        const result = await toolDef.handler(args); // Assuming handlers return the expected structure

        // Ensure the result has a 'content' property which is an array
        if (!result || !Array.isArray(result.content)) {
           console.warn(`Tool handler for '${toolName}' returned an unexpected structure. Wrapping in standard response.`);
           // Attempt to create a standard response structure
           const textContent = typeof result === 'string' ? result : JSON.stringify(result);
           return {
              content: [{ type: 'text', text: textContent }],
              // Include other properties from the original result if they exist
              ...(typeof result === 'object' && result !== null ? result : {})
           };
        }

        return result; // Return the result from the specific handler

      } catch (error: any) {
        console.error(`[Handler Error - ${toolName}] ${error.message}`);
        // Error handling logic (copied from the original loop, adjust as needed)
        let solutions: string[] = [];
         if (error.message.includes('Could not find a valid Godot executable')) {
           solutions = [
             'Ensure Godot is installed and accessible.',
             'Set the GODOT_PATH environment variable to the full path of the Godot executable.',
             'Provide the correct `godotPath` in the server configuration.',
           ];
         } else if (error.message.includes('Invalid project path') || error.message.includes('ENOENT')) {
            solutions = [
              'Verify the provided `projectPath` is correct and exists.',
              'Ensure the server has permissions to access the project directory.',
            ];
         } else if (error.message.includes('Failed to parse JSON')) {
            solutions = [
              'Check the format of the parameters being sent to the Godot script.',
              'Ensure proper escaping of arguments passed via the command line.',
            ];
         } else if (error.message.includes('Godot process exited with code')) {
            solutions = [
              'Check the Godot stderr output in the server logs for specific errors from the engine or script.',
              'Ensure the `godot_operations.gd` script is correctly placed and has no syntax errors.',
              'Verify file paths and permissions within the Godot project.',
            ];
         }

         // Use the existing createErrorResponse method
         return this.createErrorResponse(
           `Error executing tool '${toolName}': ${error.message}`,
           solutions
         );
      }
    });

    this.logDebug('Tool handlers set up using setRequestHandler');
  }

  // --- Tool Handler Implementations ---

  /**
   * Handle the launch_editor tool
   */
  private async handleLaunchEditor(args: any) {
    this.logDebug(`Handling launch_editor: ${JSON.stringify(args)}`);
    args = this.normalizeParameters(args); // Normalize parameters

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse('Invalid project path provided.');
    }
    if (!this.godotPath) {
       return this.createErrorResponse('Godot executable path not found.');
    }

    // Check if a process is already running
    if (this.activeProcess) {
      return this.createErrorResponse('Another Godot process (editor or project) is already running.');
    }

    const command = `"${this.godotPath}" --editor --path "${args.projectPath}"`;
    this.logDebug(`Executing: ${command}`);

    try {
      // Use exec for launching the editor as it's typically a one-off process
      const { stdout, stderr } = await execAsync(command);
      this.logDebug(`Editor stdout: ${stdout}`);
      if (stderr) {
        console.error(`Editor stderr: ${stderr}`);
      }
      return { content: [{ type: 'text', text: 'Godot editor launched successfully.' }] };
    } catch (error: any) {
      console.error(`Error launching editor: ${error.message}`);
      return this.createErrorResponse(`Failed to launch Godot editor: ${error.message}`);
    }
  }

  /**
   * Handle the run_project tool
   */
  private async handleRunProject(args: any) {
     this.logDebug(`Handling run_project: ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!this.validatePath(args.projectPath)) {
       return this.createErrorResponse('Invalid project path provided.');
     }
     if (!this.godotPath) {
        return this.createErrorResponse('Godot executable path not found.');
     }

     if (this.activeProcess) {
       return this.createErrorResponse('A Godot project is already running. Stop it first using stop_project.');
     }

     const commandArgs = ['--path', args.projectPath];
     if (args.debug || GODOT_DEBUG_MODE) { // Use debug if requested or globally enabled
       commandArgs.push('--debug');
     }

     this.logDebug(`Spawning Godot project: "${this.godotPath}" with args: ${commandArgs.join(' ')}`);

     try {
       // Use spawn to manage the running process and capture output
       const godotProcess = spawn(`"${this.godotPath}"`, commandArgs, {
         shell: true, // Using shell might be necessary depending on how GODOT_PATH is set
         stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, capture stdout/stderr
       });

       this.activeProcess = {
         process: godotProcess,
         output: [],
         errors: [],
       };

       godotProcess.stdout.on('data', (data) => {
         const output = data.toString();
         this.activeProcess?.output.push(output);
         this.logDebug(`Project stdout: ${output}`);
       });

       godotProcess.stderr.on('data', (data) => {
         const errorOutput = data.toString();
         this.activeProcess?.errors.push(errorOutput);
         console.error(`Project stderr: ${errorOutput}`);
       });

       godotProcess.on('close', (code) => {
         this.logDebug(`Godot project process exited with code ${code}`);
         this.activeProcess = null; // Clear active process when it closes
       });

       godotProcess.on('error', (err) => {
         console.error('Failed to start Godot project process:', err);
         this.activeProcess = null; // Clear on error too
         // We might not be able to return an error directly here as the handler might have already returned
       });

       return {
         content: [{ type: 'text', text: `Godot project started (PID: ${godotProcess.pid}).` }],
         pid: godotProcess.pid
        };
     } catch (error: any) {
       console.error(`Error running project: ${error.message}`);
       this.activeProcess = null;
       return this.createErrorResponse(`Failed to run Godot project: ${error.message}`);
     }
   }

  /**
   * Handle the get_debug_output tool
   */
  private async handleGetDebugOutput() {
    this.logDebug('Handling get_debug_output');
    if (this.activeProcess) {
      // Return copies of the arrays
      return {
         content: [
            { type: 'text', text: `Output lines: ${this.activeProcess.output.length}, Error lines: ${this.activeProcess.errors.length}` }
         ],
         output: [...this.activeProcess.output],
         errors: [...this.activeProcess.errors]
      };
    } else {
      return this.createErrorResponse('No active Godot project is running.');
    }
  }

  /**
   * Handle the stop_project tool
   */
  private async handleStopProject() {
    this.logDebug('Handling stop_project');
    if (this.activeProcess) {
      this.logDebug(`Attempting to kill process with PID: ${this.activeProcess.process.pid}`);
      const killed = this.activeProcess.process.kill(); // Sends SIGTERM by default
      if (killed) {
         this.logDebug('Kill signal sent successfully.');
         // Give it a moment, then force kill if necessary (optional)
         // setTimeout(() => {
         //   if (this.activeProcess && !this.activeProcess.process.killed) {
         //     this.logDebug('Process did not terminate, sending SIGKILL.');
         //     this.activeProcess.process.kill('SIGKILL');
         //   }
         // }, 1000);
         this.activeProcess = null; // Assume killed for now, will be cleared on 'close' anyway
         return { content: [{ type: 'text', text: 'Stop signal sent to Godot project.' }] };
      } else {
         this.logDebug('Failed to send kill signal.');
         // Attempt cleanup anyway
         this.activeProcess = null;
         return this.createErrorResponse('Failed to send stop signal to the Godot process. It might have already exited.');
      }
    } else {
      return this.createErrorResponse('No active Godot project is running.');
    }
  }

   /**
    * Handle the get_godot_version tool
    */
   private async handleGetGodotVersion() {
     this.logDebug('Handling get_godot_version');
     if (!this.godotPath) {
       // Attempt detection if not already set
       await this.detectGodotPath();
       if (!this.godotPath) {
         return this.createErrorResponse('Godot executable path not found.');
       }
     }

     try {
       const command = `"${this.godotPath}" --version`;
       this.logDebug(`Executing: ${command}`);
       const { stdout } = await execAsync(command);
       const version = stdout.trim();
       this.logDebug(`Godot version: ${version}`);
       return { content: [{ type: 'text', text: `Godot version: ${version}` }], version: version };
     } catch (error: any) {
       console.error(`Error getting Godot version: ${error.message}`);
       return this.createErrorResponse(`Failed to get Godot version: ${error.message}`);
     }
   }

   /**
    * Handle the list_projects tool
    */
   private async handleListProjects(args: any) {
     this.logDebug(`Handling list_projects: ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!this.validatePath(args.directory)) {
       return this.createErrorResponse('Invalid directory path provided.');
     }

     try {
       const projects = this.findGodotProjects(args.directory, args.recursive ?? false);
       return {
          content: [{ type: 'text', text: `Found ${projects.length} projects.` }],
          projects: projects
        };
     } catch (error: any) {
       console.error(`Error listing projects: ${error.message}`);
       return this.createErrorResponse(`Failed to list projects: ${error.message}`);
     }
   }


   /**
    * Asynchronously get project structure (wrapper for sync method)
    * @param projectPath Path to the Godot project
    * @returns Promise resolving with project structure
    */
   private getProjectStructureAsync(projectPath: string): Promise<any> {
      return new Promise((resolve, reject) => {
         try {
            const structure = this.getProjectStructure(projectPath);
            resolve(structure);
         } catch (error) {
            reject(error);
         }
      });
   }


   /**
    * Handle the get_project_info tool
    */
   private async handleGetProjectInfo(args: any) {
     this.logDebug(`Handling get_project_info: ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!this.validatePath(args.projectPath)) {
       return this.createErrorResponse('Invalid project path provided.');
     }

     // Basic check for project.godot file
     const projectFilePath = join(args.projectPath, 'project.godot');
     if (!existsSync(projectFilePath)) {
        return this.createErrorResponse(`Not a valid Godot project directory (missing project.godot): ${args.projectPath}`);
     }


     try {
       const structure = await this.getProjectStructureAsync(args.projectPath);
       return {
          content: [{ type: 'text', text: `Found ${structure.scenes.length} scenes and ${structure.scripts.length} scripts.` }],
          scenes: structure.scenes,
          scripts: structure.scripts
       };
     } catch (error: any) {
       console.error(`Error getting project info: ${error.message}`);
       return this.createErrorResponse(`Failed to get project info: ${error.message}`);
     }
   }

  /**
   * Handle the create_scene tool
   */
  private async handleCreateScene(args: any) {
    this.logDebug(`[handleCreateScene] Received raw args: ${JSON.stringify(args)}`);
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide both `projectPath` (absolute) and `scenePath` (relative).']
      );
    }
    if (!this.validatePath(args.projectPath)) {
       return this.createErrorResponse('Invalid project path provided.');
    }
     // Validate scenePath basic structure (prevent traversal, ensure .tscn/.scn)
     if (args.scenePath.includes('..') || (!args.scenePath.endsWith('.tscn') && !args.scenePath.endsWith('.scn'))) {
        return this.createErrorResponse('Invalid scene path. Must be relative, end with .tscn or .scn, and not contain "..".');
     }


    try {
      const operationArgs = {
        scene_path: args.scenePath,
        root_node_type: args.rootNodeType || 'Node2D', // Default if not provided
      };
      const { stdout, stderr } = await this.executeOperation('create_scene', operationArgs, args.projectPath);

      // Check stderr for specific Godot errors even if the process exits with 0
      if (stderr && stderr.toLowerCase().includes('error')) {
         console.error(`Godot stderr indicates potential error during scene creation: ${stderr}`);
         // Try to extract a more specific error message if possible
         const errorMatch = stderr.match(/ERROR: (.+)/);
         const specificError = errorMatch ? errorMatch[1] : stderr;
         return this.createErrorResponse(`Godot reported an error during scene creation: ${specificError}`);
      }

      // Check stdout for success message (optional but good practice)
      if (stdout.includes('Scene created successfully')) {
         const createdPath = stdout.split('at: ')[1]?.trim() || args.scenePath; // Extract path if possible
         return {
           content: [{ type: 'text', text: `Scene created successfully at: ${createdPath}` }],
           scenePath: createdPath
         };
      } else {
         // If no success message and no clear error, return a generic success/check message
         console.warn(`Scene creation process completed, but success message not found in stdout. Stdout: ${stdout}`);
         return {
            content: [{ type: 'text', text: `Scene creation process completed for ${args.scenePath}. Verify the file exists.` }],
            scenePath: args.scenePath
         };
      }
    } catch (error: any) {
      console.error(`Error creating scene: ${error.message}`);
      // Check if the error message contains stderr from the executeOperation rejection
      const stderrMatch = error.message.match(/Stderr: (.+)/);
      const godotError = stderrMatch ? stderrMatch[1] : 'Check server logs for details.';
      return this.createErrorResponse(`Failed to create scene: ${godotError}`);
    }
  }

  /**
   * Handle the add_node tool
   */
  private async handleAddNode(args: any) {
    this.logDebug(`Handling add_node: ${JSON.stringify(args)}`);
    args = this.normalizeParameters(args); // Normalize parameters

    if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
      return this.createErrorResponse(
        'Project path, scene path, node type, and node name are required',
        ['Provide `projectPath`, `scenePath`, `nodeType`, and `nodeName`.']
      );
    }
     if (!this.validatePath(args.projectPath)) {
        return this.createErrorResponse('Invalid project path provided.');
     }
     if (args.scenePath.includes('..') || (!args.scenePath.endsWith('.tscn') && !args.scenePath.endsWith('.scn'))) {
         return this.createErrorResponse('Invalid scene path.');
     }
     if (args.parentNodePath && args.parentNodePath.includes('..')) {
         return this.createErrorResponse('Invalid parent node path.');
     }
     // Basic validation for node name (avoid empty or path-like names)
     if (!args.nodeName || args.nodeName.includes('/') || args.nodeName.includes('\\')) {
        return this.createErrorResponse('Invalid node name.');
     }


    try {
      const operationArgs = {
        scene_path: args.scenePath,
        parent_node_path: args.parentNodePath || 'root', // Default to 'root'
        node_type: args.nodeType,
        node_name: args.nodeName,
      };
      const { stdout, stderr } = await this.executeOperation('add_node', operationArgs, args.projectPath);

      if (stderr && stderr.toLowerCase().includes('error')) {
         console.error(`Godot stderr indicates potential error during node addition: ${stderr}`);
         const errorMatch = stderr.match(/ERROR: (.+)/);
         const specificError = errorMatch ? errorMatch[1] : stderr;
         return this.createErrorResponse(`Godot reported an error while adding node: ${specificError}`);
      }

      if (stdout.includes('Node added successfully')) {
         const addedNodePath = stdout.split('at path: ')[1]?.trim();
         return {
           content: [{ type: 'text', text: `Node '${args.nodeName}' added successfully${addedNodePath ? ` at path: ${addedNodePath}` : ''}. Remember to save the scene.` }],
           nodePath: addedNodePath // Return the actual path if available
         };
      } else {
         console.warn(`Add node process completed, but success message not found. Stdout: ${stdout}`);
         return {
            content: [{ type: 'text', text: `Add node process completed for ${args.nodeName}. Verify and save the scene.` }],
         };
      }
    } catch (error: any) {
      console.error(`Error adding node: ${error.message}`);
      const stderrMatch = error.message.match(/Stderr: (.+)/);
      const godotError = stderrMatch ? stderrMatch[1] : 'Check server logs for details.';
      return this.createErrorResponse(`Failed to add node: ${godotError}`);
    }
  }

  /**
   * Handle the load_sprite tool
   */
  private async handleLoadSprite(args: any) {
     this.logDebug(`Handling load_sprite: ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
       return this.createErrorResponse(
         'Project path, scene path, node path, and texture path are required',
         ['Provide `projectPath`, `scenePath`, `nodePath`, and `texturePath`.']
       );
     }
      if (!this.validatePath(args.projectPath)) {
         return this.createErrorResponse('Invalid project path provided.');
      }
      if (args.scenePath.includes('..') || (!args.scenePath.endsWith('.tscn') && !args.scenePath.endsWith('.scn'))) {
          return this.createErrorResponse('Invalid scene path.');
      }
      if (args.nodePath.includes('..')) {
          return this.createErrorResponse('Invalid node path.');
      }
      if (!args.texturePath.startsWith('res://') || args.texturePath.includes('..')) {
         return this.createErrorResponse('Invalid texture path. Must start with res:// and not contain "..".');
      }


     try {
       const operationArgs = {
         scene_path: args.scenePath,
         node_path: args.nodePath,
         texture_path: args.texturePath,
       };
       const { stdout, stderr } = await this.executeOperation('load_sprite', operationArgs, args.projectPath);

       if (stderr && stderr.toLowerCase().includes('error')) {
          console.error(`Godot stderr indicates potential error during sprite loading: ${stderr}`);
          const errorMatch = stderr.match(/ERROR: (.+)/);
          const specificError = errorMatch ? errorMatch[1] : stderr;
          return this.createErrorResponse(`Godot reported an error while loading sprite: ${specificError}`);
       }

       if (stdout.includes('Sprite loaded successfully')) {
          return { content: [{ type: 'text', text: `Sprite texture '${args.texturePath}' loaded onto node '${args.nodePath}' successfully. Remember to save the scene.` }] };
       } else {
          console.warn(`Load sprite process completed, but success message not found. Stdout: ${stdout}`);
          return { content: [{ type: 'text', text: `Load sprite process completed for ${args.nodePath}. Verify and save the scene.` }] };
       }
     } catch (error: any) {
       console.error(`Error loading sprite: ${error.message}`);
       const stderrMatch = error.message.match(/Stderr: (.+)/);
       const godotError = stderrMatch ? stderrMatch[1] : 'Check server logs for details.';
       return this.createErrorResponse(`Failed to load sprite: ${godotError}`);
     }
   }

  /**
   * Handle the export_mesh_library tool
   */
  private async handleExportMeshLibrary(args: any) {
     this.logDebug(`Handling export_mesh_library: ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!args.projectPath || !args.scenePath || !args.meshItemNames || !Array.isArray(args.meshItemNames) || args.meshItemNames.length === 0 || !args.outputPath) {
       return this.createErrorResponse(
         'Project path, scene path, a non-empty array of mesh item names, and output path are required',
         ['Provide `projectPath`, `scenePath`, `meshItemNames` (array), and `outputPath` (res:// path ending in .meshlib).']
       );
     }
      if (!this.validatePath(args.projectPath)) {
         return this.createErrorResponse('Invalid project path provided.');
      }
      if (args.scenePath.includes('..') || (!args.scenePath.endsWith('.tscn') && !args.scenePath.endsWith('.scn'))) {
          return this.createErrorResponse('Invalid scene path.');
      }
      if (!args.outputPath.startsWith('res://') || !args.outputPath.endsWith('.meshlib') || args.outputPath.includes('..')) {
         return this.createErrorResponse('Invalid output path. Must start with res://, end with .meshlib, and not contain "..".');
      }
      // Validate mesh item names (basic check)
      if (args.meshItemNames.some((name: string) => !name || name.includes('/') || name.includes('\\') || name.includes('..'))) {
         return this.createErrorResponse('Invalid mesh item name found in the array.');
      }


     try {
       const operationArgs = {
         scene_path: args.scenePath,
         mesh_item_names: args.meshItemNames,
         output_path: args.outputPath,
       };
       const { stdout, stderr } = await this.executeOperation('export_mesh_library', operationArgs, args.projectPath);

       if (stderr && stderr.toLowerCase().includes('error')) {
          console.error(`Godot stderr indicates potential error during mesh library export: ${stderr}`);
          const errorMatch = stderr.match(/ERROR: (.+)/);
          const specificError = errorMatch ? errorMatch[1] : stderr;
          return this.createErrorResponse(`Godot reported an error during mesh library export: ${specificError}`);
       }

       if (stdout.includes('MeshLibrary exported successfully')) {
          const exportedPath = stdout.split('to: ')[1]?.trim() || args.outputPath;
          return {
             content: [{ type: 'text', text: `MeshLibrary exported successfully to: ${exportedPath}` }],
             outputPath: exportedPath
          };
       } else {
          console.warn(`Export mesh library process completed, but success message not found. Stdout: ${stdout}`);
          return {
             content: [{ type: 'text', text: `MeshLibrary export process completed for ${args.outputPath}. Verify the file.` }],
             outputPath: args.outputPath
          };
       }
     } catch (error: any) {
       console.error(`Error exporting mesh library: ${error.message}`);
       const stderrMatch = error.message.match(/Stderr: (.+)/);
       const godotError = stderrMatch ? stderrMatch[1] : 'Check server logs for details.';
       return this.createErrorResponse(`Failed to export mesh library: ${godotError}`);
     }
   }

  /**
   * Handle the save_scene tool
   */
  private async handleSaveScene(args: any) {
     this.logDebug(`Handling save_scene: ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!args.projectPath || !args.scenePath) {
       return this.createErrorResponse(
         'Project path and scene path are required',
         ['Provide `projectPath` and `scenePath`.']
       );
     }
      if (!this.validatePath(args.projectPath)) {
         return this.createErrorResponse('Invalid project path provided.');
      }
      if (args.scenePath.includes('..') || (!args.scenePath.endsWith('.tscn') && !args.scenePath.endsWith('.scn'))) {
          return this.createErrorResponse('Invalid scene path.');
      }
      if (args.newPath && (args.newPath.includes('..') || (!args.newPath.endsWith('.tscn') && !args.newPath.endsWith('.scn')))) {
         return this.createErrorResponse('Invalid new scene path for saving.');
      }


     try {
       const operationArgs: OperationParams = {
         scene_path: args.scenePath,
       };
       if (args.newPath) {
         operationArgs.new_path = args.newPath;
       }

       const { stdout, stderr } = await this.executeOperation('save_scene', operationArgs, args.projectPath);

       if (stderr && stderr.toLowerCase().includes('error')) {
          console.error(`Godot stderr indicates potential error during scene save: ${stderr}`);
          const errorMatch = stderr.match(/ERROR: (.+)/);
          const specificError = errorMatch ? errorMatch[1] : stderr;
          return this.createErrorResponse(`Godot reported an error while saving scene: ${specificError}`);
       }

       if (stdout.includes('Scene saved successfully')) {
          const savedPath = stdout.split('to: ')[1]?.trim() || args.newPath || args.scenePath;
          return {
             content: [{ type: 'text', text: `Scene saved successfully to: ${savedPath}` }],
             savedPath: savedPath
          };
       } else {
          console.warn(`Save scene process completed, but success message not found. Stdout: ${stdout}`);
          return {
             content: [{ type: 'text', text: `Save scene process completed for ${args.newPath || args.scenePath}.` }],
             savedPath: args.newPath || args.scenePath
          };
       }
     } catch (error: any) {
       console.error(`Error saving scene: ${error.message}`);
       const stderrMatch = error.message.match(/Stderr: (.+)/);
       const godotError = stderrMatch ? stderrMatch[1] : 'Check server logs for details.';
       return this.createErrorResponse(`Failed to save scene: ${godotError}`);
     }
   }

  /**
   * Handle the get_uid tool
   */
  private async handleGetUid(args: any) {
     this.logDebug(`Handling get_uid: ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!args.projectPath || !args.filePath) {
       return this.createErrorResponse(
         'Project path and file path are required',
         ['Provide `projectPath` and `filePath` (res:// path).']
       );
     }
      if (!this.validatePath(args.projectPath)) {
         return this.createErrorResponse('Invalid project path provided.');
      }
      if (!args.filePath.startsWith('res://') || args.filePath.includes('..')) {
         return this.createErrorResponse('Invalid file path. Must start with res:// and not contain "..".');
      }


     try {
       const operationArgs = {
         file_path: args.filePath,
       };
       const { stdout, stderr } = await this.executeOperation('get_uid', operationArgs, args.projectPath);

       if (stderr && stderr.toLowerCase().includes('error')) {
          // Special case: "UID not found" might be expected, not necessarily a server error
          if (stderr.includes('UID not found')) {
             this.logDebug(`UID not found for path: ${args.filePath}`);
             return { content: [{ type: 'text', text: `UID not found for resource: ${args.filePath}` }], uid: null };
          } else {
             console.error(`Godot stderr indicates potential error during UID lookup: ${stderr}`);
             const errorMatch = stderr.match(/ERROR: (.+)/);
             const specificError = errorMatch ? errorMatch[1] : stderr;
             return this.createErrorResponse(`Godot reported an error while getting UID: ${specificError}`);
          }
       }

       // Expect UID in stdout, e.g., "UID: uid://...."
       const uidMatch = stdout.match(/UID: (uid:\/\/[a-zA-Z0-9]+)/);
       if (uidMatch && uidMatch[1]) {
          const uid = uidMatch[1];
          this.logDebug(`Found UID: ${uid} for path: ${args.filePath}`);
          return {
             content: [{ type: 'text', text: `UID for ${args.filePath}: ${uid}` }],
             uid: uid
          };
       } else {
          // If no UID found in stdout and no error in stderr, it might mean the resource doesn't have one yet
          console.warn(`Get UID process completed, but UID not found in stdout. Stdout: ${stdout}`);
          return { content: [{ type: 'text', text: `Could not extract UID for resource: ${args.filePath}. It might not exist or have a UID.` }], uid: null };
       }
     } catch (error: any) {
       console.error(`Error getting UID: ${error.message}`);
       const stderrMatch = error.message.match(/Stderr: (.+)/);
       const godotError = stderrMatch ? stderrMatch[1] : 'Check server logs for details.';
       return this.createErrorResponse(`Failed to get UID: ${godotError}`);
     }
   }

  /**
   * Handle the update_project_uids (resave_resources) tool
   */
  private async handleUpdateProjectUids(args: any) {
     this.logDebug(`Handling update_project_uids (resave_resources): ${JSON.stringify(args)}`);
     args = this.normalizeParameters(args); // Normalize parameters

     if (!args.projectPath) {
       return this.createErrorResponse(
         'Project path is required',
         ['Provide `projectPath`.']
       );
     }
      if (!this.validatePath(args.projectPath)) {
         return this.createErrorResponse('Invalid project path provided.');
      }

     // Add a confirmation step or strong warning? This is a potentially destructive operation.
     // For now, proceed directly based on the tool call.

     try {
       const operationArgs = {}; // No specific args needed for the script operation itself
       const { stdout, stderr } = await this.executeOperation('resave_resources', operationArgs, args.projectPath);

       if (stderr && stderr.toLowerCase().includes('error')) {
          console.error(`Godot stderr indicates potential error during resource resave: ${stderr}`);
          const errorMatch = stderr.match(/ERROR: (.+)/);
          const specificError = errorMatch ? errorMatch[1] : stderr;
          return this.createErrorResponse(`Godot reported an error during resource resave: ${specificError}`);
       }

       if (stdout.includes('Resources resaved successfully')) {
          return { content: [{ type: 'text', text: 'All project resources resaved successfully.' }] };
       } else {
          console.warn(`Resource resave process completed, but success message not found. Stdout: ${stdout}`);
          return { content: [{ type: 'text', text: 'Resource resave process completed. Check logs for details.' }] };
       }
     } catch (error: any) {
       console.error(`Error resaving resources: ${error.message}`);
       const stderrMatch = error.message.match(/Stderr: (.+)/);
       const godotError = stderrMatch ? stderrMatch[1] : 'Check server logs for details.';
       return this.createErrorResponse(`Failed to resave resources: ${godotError}`);
     }
   }


  /**
   * Start the MCP server
   */
  async run() {
    this.logDebug('Starting Godot MCP server...');
    // Perform initial Godot path detection on startup
    try {
       await this.detectGodotPath();
    } catch (error: any) {
       // Log the error but allow the server to start if not in strict mode
       console.error(`[Startup Error] Failed initial Godot path detection: ${error.message}`);
       if (this.strictPathValidation) {
          console.error("[Startup Error] Strict path validation enabled. Server cannot start without a valid Godot path.");
          process.exit(1); // Exit if strict validation fails
       } else {
          console.warn("[Startup Warning] Server starting without a confirmed valid Godot path due to non-strict mode.");
       }
    }

    const transport = new StdioServerTransport();
    // Use connect instead of listen
    await this.server.connect(transport);
    this.logDebug('Godot MCP server connected via stdio'); // Updated log message
  }
}

// --- Main Execution ---

// Create and run the server instance
const server = new GodotServer({
   // Example configuration:
   // godotPath: '/path/to/your/godot', // Optional: Override auto-detection
   // debugMode: true, // Optional: Force enable/disable server debug logs
   // godotDebugMode: true, // Optional: Force enable/disable Godot debug flags
   // strictPathValidation: true // Optional: Fail startup if Godot path isn't validated
});
server.run().catch((error) => {
  console.error('Failed to start Godot MCP server:', error);
  process.exit(1);
});
