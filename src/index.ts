#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import { fileURLToPath } from 'url';
import { join, dirname, basename, normalize, isAbsolute, relative, resolve, sep } from 'path';
import { existsSync, readdirSync, mkdirSync, readFileSync } from 'fs';
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';

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
const DEFAULT_SCENE_TIMEOUT_MS = 30000;
const DEFAULT_SCENE_TEST_TIMEOUT_MS = 60000;
const DEFAULT_SCREENSHOT_DELAY_FRAMES = 30;
const MAX_SCENE_TIMEOUT_MS = 2147483647;
const MAX_SCREENSHOT_DELAY_FRAMES = 3600;
const PROCESS_EXIT_WAIT_MS = 1000;
const SCREENSHOT_PROCESS_TIMEOUT_MS = 120000;
const SCENE_TEST_POLL_INTERVAL_MS = 25;
const SCENE_TEST_RAW_TAIL_LINES = 50;

const execFileAsync = promisify(execFile);

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface representing a running Godot process
 */
interface GodotProcess {
  process: ChildProcessWithoutNullStreams;
  output: string[];
  errors: string[];
  rawOutput: string;
  rawErrors: string;
  rawCombined: string;
  spawnError?: Error;
  timeout?: NodeJS.Timeout;
}

interface SceneTestResult {
  completed: boolean;
  passed: number;
  failed: number;
  passLines: string[];
  failLines: string[];
  rawTail: string[];
}

interface ScriptValidationError {
  file: string;
  line: number;
  message: string;
}

interface GodotCheckResult {
  exitCode: number;
  stdout: string;
  stderr: string;
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
  private screenshotScriptPath: string;
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
    this.screenshotScriptPath = join(__dirname, 'scripts', 'screenshot_runner.gd');
    if (debugMode) console.error(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

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
   * Using stderr instead of stdout to avoid interfering with JSON-RPC communication
   */
  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.error(`[DEBUG] ${message}`);
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
   * Validate a Godot class name to prevent arbitrary script instantiation.
   * Class names must be simple identifiers (e.g. "Node2D", "CharacterBody3D").
   * Rejects anything that looks like a path (res://, absolute paths, dots, slashes, colons).
   */
  private validateClassName(name: string): boolean {
    if (!name) return false;
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
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
      // Using execFileAsync with argument array to prevent command injection
      await execFileAsync(path, ['--version']);

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
        `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`
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
    console.error(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
    console.error(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

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
      console.error(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
      console.error(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
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
      await this.stopActiveGodotProcess();
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

      // Build argument array for execFile to prevent command injection
      // Using execFile with argument arrays avoids shell interpretation entirely
      const args = [
        '--headless',
        '--path',
        projectPath,  // Safe: passed as argument, not interpolated into shell command
        '--script',
        this.operationsScriptPath,
        operation,
        paramsJson,  // Safe: passed as argument, not interpreted by shell
      ];

      
      if (GODOT_DEBUG_MODE) {
        args.push('--debug-godot');
      }

      this.logDebug(`Executing: ${this.godotPath} ${args.join(' ')}`);

      const { stdout, stderr } = await execFileAsync(this.godotPath!, args);

      return { stdout: stdout ?? '', stderr: stderr ?? '' };
    } catch (error: unknown) {
      // If execFileAsync throws, it still contains stdout/stderr
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string };
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
        };
      }

      throw error;
    }
  }

  /**
   * Get the structure of a Godot project
   * @param projectPath Path to the Godot project
   * @returns Object representing the project structure
   */
  private async getProjectStructure(projectPath: string): Promise<any> {
    try {
      // Get top-level directories in the project
      const entries = readdirSync(projectPath, { withFileTypes: true });

      const structure: any = {
        scenes: [],
        scripts: [],
        assets: [],
        other: [],
      };

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirName = entry.name.toLowerCase();

          // Skip hidden directories
          if (dirName.startsWith('.')) {
            continue;
          }

          // Count files in common directories
          if (dirName === 'scenes' || dirName.includes('scene')) {
            structure.scenes.push(entry.name);
          } else if (dirName === 'scripts' || dirName.includes('script')) {
            structure.scripts.push(entry.name);
          } else if (
            dirName === 'assets' ||
            dirName === 'textures' ||
            dirName === 'models' ||
            dirName === 'sounds' ||
            dirName === 'music'
          ) {
            structure.assets.push(entry.name);
          } else {
            structure.other.push(entry.name);
          }
        }
      }

      return structure;
    } catch (error) {
      this.logDebug(`Error getting project structure: ${error}`);
      return { error: 'Failed to get project structure' };
    }
  }

  /**
   * Find Godot projects in a directory
   * @param directory Directory to search
   * @param recursive Whether to search recursively
   * @returns Array of Godot projects
   */
  private findGodotProjects(directory: string, recursive: boolean): Array<{ path: string; name: string }> {
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
      this.logDebug(`Error searching directory ${directory}: ${error}`);
    }

    return projects;
  }

  /**
   * Set up the tool handlers for the MCP server
   */
  private setupToolHandlers() {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'launch_editor',
          description: 'Launch Godot editor for a specific project',
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
          name: 'run_scene',
          description: 'Run a specific Godot scene and capture output',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Scene to run, as a res:// path or a path relative to the project',
              },
              timeoutMs: {
                type: 'integer',
                description: 'Time in milliseconds before the scene is stopped automatically (default: 30000)',
                minimum: 1,
                maximum: MAX_SCENE_TIMEOUT_MS,
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'run_scene_test',
          description: 'Run a Godot test scene and return structured pass/fail results',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Test scene to run, as a res:// path or a path relative to the project',
              },
              timeoutMs: {
                type: 'integer',
                description: 'Maximum time to wait for test completion in milliseconds (default: 60000)',
                minimum: 1,
                maximum: MAX_SCENE_TIMEOUT_MS,
              },
              passPattern: {
                type: 'string',
                description: 'Text identifying a passing test line (default: ✔)',
              },
              failPattern: {
                type: 'string',
                description: 'Text identifying a failing test line (default: ✘)',
              },
              donePattern: {
                type: 'string',
                description: 'Text identifying test completion (default: SONUÇ:)',
              },
              autoQuit: {
                type: 'boolean',
                description: 'Stop the scene when the completion pattern is seen (default: true)',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'export_project',
          description: 'Export a Godot project using a configured export preset',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              preset: {
                type: 'string',
                description: 'Name of an export preset configured in export_presets.cfg',
              },
              outputPath: {
                type: 'string',
                description: 'Export file path, absolute or relative to the project directory',
              },
              debug: {
                type: 'boolean',
                description: 'Use a debug export instead of a release export (default: false)',
              },
            },
            required: ['projectPath', 'preset', 'outputPath'],
          },
        },
        {
          name: 'capture_game_screenshot',
          description: 'Run a Godot scene and save a rendered viewport screenshot as PNG',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Scene to capture, as a res:// path or a path relative to the project',
              },
              outputPath: {
                type: 'string',
                description: 'PNG output path, absolute or relative to the project directory',
              },
              delayFrames: {
                type: 'integer',
                description: 'Rendered frames to wait before capture (default: 30)',
                minimum: 0,
                maximum: MAX_SCREENSHOT_DELAY_FRAMES,
              },
            },
            required: ['projectPath', 'scenePath', 'outputPath'],
          },
        },
        {
          name: 'validate_script',
          description: 'Validate one or all GDScript files in a Godot project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Single .gd file to validate, as a res:// path or path relative to the project',
              },
              all: {
                type: 'boolean',
                description: 'Validate every .gd file in the project',
              },
            },
            required: ['projectPath'],
            oneOf: [
              { required: ['scriptPath'] },
              {
                properties: { all: { const: true } },
                required: ['all'],
              },
            ],
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
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logDebug(`Handling tool request: ${request.params.name}`);
      switch (request.params.name) {
        case 'launch_editor':
          return await this.handleLaunchEditor(request.params.arguments);
        case 'run_project':
          return await this.handleRunProject(request.params.arguments);
        case 'run_scene':
          return await this.handleRunScene(request.params.arguments);
        case 'run_scene_test':
          return await this.handleRunSceneTest(request.params.arguments);
        case 'export_project':
          return await this.handleExportProject(request.params.arguments);
        case 'capture_game_screenshot':
          return await this.handleCaptureGameScreenshot(request.params.arguments);
        case 'validate_script':
          return await this.handleValidateScript(request.params.arguments);
        case 'get_debug_output':
          return await this.handleGetDebugOutput();
        case 'stop_project':
          return await this.handleStopProject();
        case 'get_godot_version':
          return await this.handleGetGodotVersion();
        case 'list_projects':
          return await this.handleListProjects(request.params.arguments);
        case 'get_project_info':
          return await this.handleGetProjectInfo(request.params.arguments);
        case 'create_scene':
          return await this.handleCreateScene(request.params.arguments);
        case 'add_node':
          return await this.handleAddNode(request.params.arguments);
        case 'load_sprite':
          return await this.handleLoadSprite(request.params.arguments);
        case 'export_mesh_library':
          return await this.handleExportMeshLibrary(request.params.arguments);
        case 'save_scene':
          return await this.handleSaveScene(request.params.arguments);
        case 'get_uid':
          return await this.handleGetUid(request.params.arguments);
        case 'update_project_uids':
          return await this.handleUpdateProjectUids(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  /**
   * Handle the launch_editor tool
   * @param args Tool arguments
   */
  private async handleLaunchEditor(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Launching Godot editor for project: ${args.projectPath}`);
      const process = spawn(this.godotPath, ['-e', '--path', args.projectPath], {
        stdio: 'pipe',
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot editor:', err);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Godot editor launched successfully for project at ${args.projectPath}.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to launch Godot editor: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the run_project tool
   * @param args Tool arguments
   */
  private async handleRunProject(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      const cmdArgs = ['-d', '--path', args.projectPath];
      if (args.scene && this.validatePath(args.scene)) {
        this.logDebug(`Adding scene parameter: ${args.scene}`);
        cmdArgs.push(args.scene);
      }

      this.logDebug(`Running Godot project: ${args.projectPath}`);
      await this.startGodotProcess(cmdArgs, 'project');

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
      return this.createErrorResponse(
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
   * Handle the run_scene tool
   * @param args Tool arguments
   */
  private async handleRunScene(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide projectPath and scenePath']
      );
    }

    const rawArgs = args as Record<string, unknown>;
    const projectPath = rawArgs.projectPath ?? rawArgs.project_path;
    const scenePath = rawArgs.scenePath ?? rawArgs.scene_path;
    const rawTimeoutMs = rawArgs.timeoutMs ?? rawArgs.timeout_ms;
    const timeoutMs = rawTimeoutMs === undefined ? DEFAULT_SCENE_TIMEOUT_MS : rawTimeoutMs;

    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (typeof scenePath !== 'string' || !scenePath.trim()) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a res:// scene path or a path relative to the project']
      );
    }

    if (
      typeof timeoutMs !== 'number'
      || !Number.isInteger(timeoutMs)
      || timeoutMs <= 0
      || timeoutMs > MAX_SCENE_TIMEOUT_MS
    ) {
      return this.createErrorResponse(
        `timeoutMs must be an integer between 1 and ${MAX_SCENE_TIMEOUT_MS}`,
        [`Provide timeoutMs in milliseconds, or omit it to use ${DEFAULT_SCENE_TIMEOUT_MS}`]
      );
    }

    if (!this.validatePath(projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    if (!this.validatePath(scenePath) || isAbsolute(scenePath)) {
      return this.createErrorResponse(
        'Invalid scene path',
        ['Provide a res:// scene path or a path relative to the project without ".."']
      );
    }

    if (!/\.(tscn|scn)$/i.test(scenePath)) {
      return this.createErrorResponse(
        'scenePath must point to a Godot scene file',
        ['Provide a .tscn or .scn file']
      );
    }

    try {
      const projectFile = join(projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      const projectRelativeScenePath = scenePath.startsWith('res://')
        ? scenePath.slice('res://'.length)
        : scenePath;
      const normalizedResourcePath = projectRelativeScenePath.split('\\').join('/');
      const sceneFile = join(projectPath, ...normalizedResourcePath.split('/'));
      if (!existsSync(sceneFile)) {
        return this.createErrorResponse(
          `Scene does not exist: ${scenePath}`,
          ['Ensure scenePath points to an existing scene in the project']
        );
      }

      const godotScenePath = `res://${normalizedResourcePath}`;
      const cmdArgs = ['-d', '--path', projectPath, godotScenePath];
      this.logDebug(`Running Godot scene: ${godotScenePath} in project: ${projectPath}`);
      await this.startGodotProcess(cmdArgs, `scene ${godotScenePath}`, timeoutMs);

      return {
        content: [
          {
            type: 'text',
            text: `Godot scene ${scenePath} started in debug mode. Use get_debug_output to see output or stop_project to stop it. The scene will stop automatically after ${timeoutMs} ms.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to run Godot scene: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project and scene paths are accessible',
        ]
      );
    }
  }

  /**
   * Handle the run_scene_test tool
   * @param args Tool arguments
   */
  private async handleRunSceneTest(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide projectPath and scenePath']
      );
    }

    const rawArgs = args as Record<string, unknown>;
    const projectPath = rawArgs.projectPath ?? rawArgs.project_path;
    const scenePath = rawArgs.scenePath ?? rawArgs.scene_path;
    const rawTimeoutMs = rawArgs.timeoutMs ?? rawArgs.timeout_ms;
    const timeoutMs = rawTimeoutMs === undefined ? DEFAULT_SCENE_TEST_TIMEOUT_MS : rawTimeoutMs;
    const rawPassPattern = rawArgs.passPattern !== undefined
      ? rawArgs.passPattern
      : rawArgs.pass_pattern;
    const rawFailPattern = rawArgs.failPattern !== undefined
      ? rawArgs.failPattern
      : rawArgs.fail_pattern;
    const rawDonePattern = rawArgs.donePattern !== undefined
      ? rawArgs.donePattern
      : rawArgs.done_pattern;
    const rawAutoQuit = rawArgs.autoQuit !== undefined ? rawArgs.autoQuit : rawArgs.auto_quit;
    const passPattern = rawPassPattern === undefined ? '✔' : rawPassPattern;
    const failPattern = rawFailPattern === undefined ? '✘' : rawFailPattern;
    const donePattern = rawDonePattern === undefined ? 'SONUÇ:' : rawDonePattern;
    const autoQuit = rawAutoQuit === undefined ? true : rawAutoQuit;

    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (typeof scenePath !== 'string' || !scenePath.trim()) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a res:// scene path or a path relative to the project']
      );
    }

    if (
      typeof timeoutMs !== 'number'
      || !Number.isInteger(timeoutMs)
      || timeoutMs <= 0
      || timeoutMs > MAX_SCENE_TIMEOUT_MS
    ) {
      return this.createErrorResponse(
        `timeoutMs must be an integer between 1 and ${MAX_SCENE_TIMEOUT_MS}`,
        [`Provide timeoutMs in milliseconds, or omit it to use ${DEFAULT_SCENE_TEST_TIMEOUT_MS}`]
      );
    }

    if (typeof passPattern !== 'string' || !passPattern) {
      return this.createErrorResponse(
        'passPattern must be a non-empty string',
        ['Provide literal text that appears in a passing test line']
      );
    }

    if (typeof failPattern !== 'string' || !failPattern) {
      return this.createErrorResponse(
        'failPattern must be a non-empty string',
        ['Provide literal text that appears in a failing test line']
      );
    }

    if (typeof donePattern !== 'string' || !donePattern) {
      return this.createErrorResponse(
        'donePattern must be a non-empty string',
        ['Provide literal text that appears in the test output']
      );
    }

    if (typeof autoQuit !== 'boolean') {
      return this.createErrorResponse(
        'autoQuit must be a boolean',
        ['Use true to stop the scene when donePattern is seen, or false to leave it running']
      );
    }

    if (!this.validatePath(projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    if (!this.validatePath(scenePath) || isAbsolute(scenePath)) {
      return this.createErrorResponse(
        'Invalid scene path',
        ['Provide a res:// scene path or a path relative to the project without ".."']
      );
    }

    if (!/\.(tscn|scn)$/i.test(scenePath)) {
      return this.createErrorResponse(
        'scenePath must point to a Godot scene file',
        ['Provide a .tscn or .scn file']
      );
    }

    try {
      const projectFile = join(projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      const projectRelativeScenePath = scenePath.startsWith('res://')
        ? scenePath.slice('res://'.length)
        : scenePath;
      const normalizedResourcePath = projectRelativeScenePath.split('\\').join('/');
      const sceneFile = join(projectPath, ...normalizedResourcePath.split('/'));
      if (!existsSync(sceneFile)) {
        return this.createErrorResponse(
          `Scene does not exist: ${scenePath}`,
          ['Ensure scenePath points to an existing scene in the project']
        );
      }

      const godotScenePath = `res://${normalizedResourcePath}`;
      const cmdArgs = ['-d', '--path', projectPath, godotScenePath];
      this.logDebug(`Running Godot test scene: ${godotScenePath} in project: ${projectPath}`);
      const godotProcess = await this.startGodotProcess(cmdArgs, `test scene ${godotScenePath}`);
      const deadline = Date.now() + timeoutMs;
      let completed = false;

      while (Date.now() < deadline) {
        if (godotProcess.rawOutput.includes(donePattern)) {
          completed = true;
          break;
        }

        if (
          godotProcess.spawnError
          ||
          godotProcess.process.exitCode !== null
          || godotProcess.process.signalCode !== null
        ) {
          break;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, SCENE_TEST_POLL_INTERVAL_MS));
      }

      completed = completed || godotProcess.rawOutput.includes(donePattern);

      if (autoQuit || !completed) {
        await this.stopGodotProcess(godotProcess);
      }

      if (godotProcess.spawnError) {
        throw godotProcess.spawnError;
      }

      const stdoutLines = godotProcess.rawOutput.split(/\r?\n/);
      const passLines = stdoutLines.filter((line) => line.includes(passPattern));
      const failLines = stdoutLines.filter((line) => line.includes(failPattern));
      const rawTail = godotProcess.rawCombined
        .split(/\r?\n/)
        .filter((line) => line.length > 0)
        .slice(-SCENE_TEST_RAW_TAIL_LINES);
      const result: SceneTestResult = {
        completed,
        passed: passLines.length,
        failed: failLines.length,
        passLines,
        failLines,
        rawTail,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to run Godot test scene: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project and scene paths are accessible',
        ]
      );
    }
  }

  /**
   * Handle the export_project tool
   * @param args Tool arguments
   */
  private async handleExportProject(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return this.createErrorResponse(
        'Project path, preset, and output path are required',
        ['Provide projectPath, preset, and outputPath']
      );
    }

    const rawArgs = args as Record<string, unknown>;
    const projectPath = rawArgs.projectPath ?? rawArgs.project_path;
    const preset = rawArgs.preset;
    const outputPath = rawArgs.outputPath ?? rawArgs.output_path;
    const debug = rawArgs.debug === undefined ? false : rawArgs.debug;

    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (typeof preset !== 'string' || !preset.trim()) {
      return this.createErrorResponse(
        'Export preset is required',
        ['Provide the exact name of a preset from export_presets.cfg']
      );
    }

    if (typeof outputPath !== 'string' || !outputPath.trim()) {
      return this.createErrorResponse(
        'Output path is required',
        ['Provide an export file path, such as export/web/index.html']
      );
    }

    if (typeof debug !== 'boolean') {
      return this.createErrorResponse(
        'debug must be a boolean',
        ['Use true for a debug export or false for a release export']
      );
    }

    if (!this.validatePath(projectPath) || !this.validatePath(outputPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide project and output paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      const projectFile = join(projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      const resolvedOutputPath = isAbsolute(outputPath)
        ? normalize(outputPath)
        : resolve(projectPath, outputPath);
      mkdirSync(dirname(resolvedOutputPath), { recursive: true });

      const exportFlag = debug ? '--export-debug' : '--export-release';
      const cmdArgs = [
        '--headless',
        '--path',
        projectPath,
        exportFlag,
        preset,
        resolvedOutputPath,
      ];
      this.logDebug(
        `Exporting Godot project with preset ${preset} to ${resolvedOutputPath}`
      );

      const { stdout, stderr } = await execFileAsync(this.godotPath!, cmdArgs);
      if (!existsSync(resolvedOutputPath)) {
        return this.createErrorResponse(
          `Godot finished without creating the expected export: ${resolvedOutputPath}`,
          [
            'Check the export preset output type and destination',
            'Open Project > Export in Godot and verify the preset configuration',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                preset,
                outputPath: resolvedOutputPath,
                debug,
                output: stdout.trim(),
                warnings: stderr.trim(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const execError = error instanceof Error
        ? error as Error & { stdout?: string | Buffer; stderr?: string | Buffer }
        : null;
      const stdout = execError?.stdout?.toString().trim() ?? '';
      const stderr = execError?.stderr?.toString().trim() ?? '';
      const errorMessage = execError?.message ?? 'Unknown error';
      const details = [stderr, stdout, errorMessage]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join('\n');

      if (/doesn'?t have an? [`']?export_presets\.cfg|no export presets/i.test(details)) {
        return this.createErrorResponse(
          'No export presets are configured for this project',
          [
            'Open the project in Godot and create a preset under Project > Export',
            'Commit export_presets.cfg if the preset should be shared with the project',
          ]
        );
      }

      if (
        /preset.*(?:not found|does not exist)|couldn'?t find.*preset|invalid export preset name/i
          .test(details)
      ) {
        return this.createErrorResponse(
          `Export preset "${preset}" was not found`,
          [
            'Open the project in Godot and create the preset under Project > Export',
            'Use the preset name exactly as it appears in export_presets.cfg',
          ]
        );
      }

      if (/export template|templates.*(?:missing|not found|not installed)/i.test(details)) {
        return this.createErrorResponse(
          `Export templates required by preset "${preset}" are not installed`,
          [
            'Install the matching templates from Editor > Manage Export Templates in Godot',
            'Retry the export after the templates are installed',
          ]
        );
      }

      return this.createErrorResponse(
        `Failed to export project with preset "${preset}": ${details}`,
        [
          'Open Project > Export in Godot and verify the preset configuration',
          'Ensure the output directory is writable',
          'Check if the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the capture_game_screenshot tool
   * @param args Tool arguments
   */
  private async handleCaptureGameScreenshot(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return this.createErrorResponse(
        'Project path, scene path, and output path are required',
        ['Provide projectPath, scenePath, and outputPath']
      );
    }

    const rawArgs = args as Record<string, unknown>;
    const projectPath = rawArgs.projectPath ?? rawArgs.project_path;
    const scenePath = rawArgs.scenePath ?? rawArgs.scene_path;
    const outputPath = rawArgs.outputPath ?? rawArgs.output_path;
    const rawDelayFrames = rawArgs.delayFrames !== undefined
      ? rawArgs.delayFrames
      : rawArgs.delay_frames;
    const delayFrames = rawDelayFrames === undefined
      ? DEFAULT_SCREENSHOT_DELAY_FRAMES
      : rawDelayFrames;

    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (typeof scenePath !== 'string' || !scenePath.trim()) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a res:// scene path or a path relative to the project']
      );
    }

    if (typeof outputPath !== 'string' || !outputPath.trim()) {
      return this.createErrorResponse(
        'Output path is required',
        ['Provide an absolute path or a path relative to the project ending in .png']
      );
    }

    if (
      typeof delayFrames !== 'number'
      || !Number.isInteger(delayFrames)
      || delayFrames < 0
      || delayFrames > MAX_SCREENSHOT_DELAY_FRAMES
    ) {
      return this.createErrorResponse(
        `delayFrames must be an integer between 0 and ${MAX_SCREENSHOT_DELAY_FRAMES}`,
        [`Provide delayFrames, or omit it to use ${DEFAULT_SCREENSHOT_DELAY_FRAMES}`]
      );
    }

    if (!this.validatePath(projectPath) || !this.validatePath(outputPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide project and output paths without ".." or other potentially unsafe characters']
      );
    }

    if (!this.validatePath(scenePath) || isAbsolute(scenePath)) {
      return this.createErrorResponse(
        'Invalid scene path',
        ['Provide a res:// scene path or a path relative to the project without ".."']
      );
    }

    if (!/\.(tscn|scn)$/i.test(scenePath)) {
      return this.createErrorResponse(
        'scenePath must point to a Godot scene file',
        ['Provide a .tscn or .scn file']
      );
    }

    if (!/\.png$/i.test(outputPath)) {
      return this.createErrorResponse(
        'outputPath must end in .png',
        ['Provide a PNG destination path']
      );
    }

    try {
      const projectFile = join(projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      const projectRelativeScenePath = scenePath.startsWith('res://')
        ? scenePath.slice('res://'.length)
        : scenePath;
      const normalizedResourcePath = projectRelativeScenePath.split('\\').join('/');
      const sceneFile = join(projectPath, ...normalizedResourcePath.split('/'));
      if (!existsSync(sceneFile)) {
        return this.createErrorResponse(
          `Scene does not exist: ${scenePath}`,
          ['Ensure scenePath points to an existing scene in the project']
        );
      }

      if (!existsSync(this.screenshotScriptPath)) {
        return this.createErrorResponse(
          `Screenshot runner is missing: ${this.screenshotScriptPath}`,
          ['Run npm run build before starting the MCP server']
        );
      }

      const resolvedOutputPath = isAbsolute(outputPath)
        ? normalize(outputPath)
        : resolve(projectPath, outputPath);
      mkdirSync(dirname(resolvedOutputPath), { recursive: true });
      const godotScenePath = `res://${normalizedResourcePath}`;
      const cmdArgs = [
        '--path',
        projectPath,
        '--script',
        this.screenshotScriptPath,
        '--',
        godotScenePath,
        resolvedOutputPath,
        String(delayFrames),
      ];
      this.logDebug(`Capturing ${godotScenePath} to ${resolvedOutputPath}`);

      const { stdout, stderr } = await execFileAsync(this.godotPath!, cmdArgs, {
        timeout: SCREENSHOT_PROCESS_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (!stdout.includes('SCREENSHOT_SAVED:')) {
        return this.createErrorResponse(
          'Godot exited without confirming that the screenshot was saved',
          [
            'Check the Godot output for viewport or image encoding errors',
            'Ensure screenshot_runner.gd matches the installed MCP build',
          ]
        );
      }

      if (!existsSync(resolvedOutputPath)) {
        return this.createErrorResponse(
          `Godot finished without creating a screenshot: ${resolvedOutputPath}`,
          [
            'Ensure the scene can run with the configured display driver',
            'Increase delayFrames if the scene needs more time to render',
          ]
        );
      }

      const pngData = readFileSync(resolvedOutputPath);
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (pngData.length < 24 || !pngData.subarray(0, 8).equals(pngSignature)) {
        return this.createErrorResponse(
          `Screenshot output is not a valid PNG: ${resolvedOutputPath}`,
          ['Check the Godot output for viewport or image encoding errors']
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                scenePath: godotScenePath,
                outputPath: resolvedOutputPath,
                delayFrames,
                width: pngData.readUInt32BE(16),
                height: pngData.readUInt32BE(20),
                bytes: pngData.length,
                output: stdout.trim(),
                warnings: stderr.trim(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const execError = error instanceof Error
        ? error as Error & { stdout?: string | Buffer; stderr?: string | Buffer; killed?: boolean }
        : null;
      const stdout = execError?.stdout?.toString().trim() ?? '';
      const stderr = execError?.stderr?.toString().trim() ?? '';
      const errorMessage = execError?.message ?? 'Unknown error';
      const details = [stderr, stdout, errorMessage]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join('\n');

      if (execError?.killed) {
        return this.createErrorResponse(
          `Screenshot capture timed out after ${SCREENSHOT_PROCESS_TIMEOUT_MS} ms`,
          [
            'Ensure the scene starts without blocking dialogs',
            'Reduce delayFrames or inspect the scene for startup errors',
          ]
        );
      }

      return this.createErrorResponse(
        `Failed to capture game screenshot: ${details}`,
        [
          'Ensure Godot can open a rendered window in the current environment',
          'Verify the project and scene paths are accessible',
          'Check if the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the validate_script tool
   * @param args Tool arguments
   */
  private async handleValidateScript(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return this.createErrorResponse(
        'Project path and a validation mode are required',
        ['Provide projectPath with either scriptPath or all: true']
      );
    }

    const rawArgs = args as Record<string, unknown>;
    const projectPath = rawArgs.projectPath ?? rawArgs.project_path;
    const scriptPath = rawArgs.scriptPath ?? rawArgs.script_path;
    const validateAll = rawArgs.all;

    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (scriptPath !== undefined && (typeof scriptPath !== 'string' || !scriptPath.trim())) {
      return this.createErrorResponse(
        'scriptPath must be a non-empty string',
        ['Provide a res:// .gd path or a path relative to the project']
      );
    }

    if (validateAll !== undefined && typeof validateAll !== 'boolean') {
      return this.createErrorResponse(
        'all must be a boolean',
        ['Use all: true to validate every .gd file in the project']
      );
    }

    const hasScriptPath = typeof scriptPath === 'string';
    if (hasScriptPath === (validateAll === true)) {
      return this.createErrorResponse(
        'Choose exactly one validation mode',
        ['Provide either scriptPath or all: true, but not both']
      );
    }

    if (!this.validatePath(projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    const projectFile = join(projectPath, 'project.godot');
    if (!existsSync(projectFile)) {
      return this.createErrorResponse(
        `Not a valid Godot project: ${projectPath}`,
        [
          'Ensure the path points to a directory containing a project.godot file',
          'Use list_projects to find valid Godot projects',
        ]
      );
    }

    try {
      const autoloadNames = this.getProjectAutoloadNames(projectFile);
      let scripts: string[];

      if (hasScriptPath) {
        if (!this.validatePath(scriptPath) || isAbsolute(scriptPath)) {
          return this.createErrorResponse(
            'Invalid script path',
            ['Provide a res:// .gd path or a path relative to the project without ".."']
          );
        }

        const resourcePath = this.toGodotResourcePath(scriptPath);
        if (!resourcePath.toLowerCase().endsWith('.gd')) {
          return this.createErrorResponse(
            'scriptPath must point to a .gd file',
            ['Provide the path of a GDScript file']
          );
        }

        const filePath = join(projectPath, resourcePath.slice('res://'.length));
        if (!existsSync(filePath)) {
          return this.createErrorResponse(
            `Script does not exist: ${scriptPath}`,
            ['Ensure scriptPath is correct and belongs to the project']
          );
        }
        scripts = [resourcePath];
      } else {
        scripts = this.findGodotScripts(projectPath);
      }

      const errors: ScriptValidationError[] = [];
      for (const resourcePath of scripts) {
        const result = await this.runGodotScriptCheck(projectPath, resourcePath);
        errors.push(...this.parseGodotScriptErrors(result, resourcePath, autoloadNames));
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                valid: errors.length === 0,
                errors,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to validate GDScript: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project and script paths are accessible',
        ]
      );
    }
  }

  /**
   * Convert a project-relative script path to Godot's res:// format.
   */
  private toGodotResourcePath(scriptPath: string): string {
    const relativePath = scriptPath.startsWith('res://')
      ? scriptPath.slice('res://'.length)
      : scriptPath;
    return `res://${relativePath.split('\\').join('/')}`;
  }

  /**
   * Find GDScript files in a project, excluding generated metadata directories.
   */
  private findGodotScripts(projectPath: string): string[] {
    const scripts: string[] = [];

    const scanDirectory = (directory: string): void => {
      const entries = readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === '.godot') {
          continue;
        }

        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) {
          scanDirectory(entryPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gd')) {
          const projectRelativePath = relative(projectPath, entryPath).split(sep).join('/');
          scripts.push(`res://${projectRelativePath}`);
        }
      }
    };

    scanDirectory(projectPath);
    return scripts;
  }

  /**
   * Read configured autoload singleton names from project.godot.
   */
  private getProjectAutoloadNames(projectFile: string): Set<string> {
    const autoloadNames = new Set<string>();
    const lines = readFileSync(projectFile, 'utf8').split(/\r?\n/);
    let inAutoloadSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        inAutoloadSection = trimmedLine === '[autoload]';
        continue;
      }

      if (!inAutoloadSection || !trimmedLine || trimmedLine.startsWith(';')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex > 0) {
        const name = trimmedLine.slice(0, separatorIndex).trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          autoloadNames.add(name);
        }
      }
    }

    return autoloadNames;
  }

  /**
   * Run Godot's check-only mode for a single GDScript file.
   */
  private runGodotScriptCheck(projectPath: string, resourcePath: string): Promise<GodotCheckResult> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(
        this.godotPath!,
        ['--headless', '--path', projectPath, '--check-only', '--script', resourcePath],
        { stdio: 'pipe' }
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      childProcess.stdout.on('data', (data: Buffer) => stdout.push(data));
      childProcess.stderr.on('data', (data: Buffer) => stderr.push(data));
      childProcess.on('error', reject);
      childProcess.on('close', (exitCode: number | null) => {
        resolve({
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        });
      });
    });
  }

  /**
   * Parse Godot script errors and ignore check-only autoload resolution false positives.
   */
  private parseGodotScriptErrors(
    result: GodotCheckResult,
    fallbackFile: string,
    autoloadNames: Set<string>
  ): ScriptValidationError[] {
    const errors: ScriptValidationError[] = [];
    const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/);
    let pendingError: { kind: string; message: string } | null = null;

    for (const line of lines) {
      const errorMatch = line.match(/^SCRIPT ERROR:\s+(Parse|Compile) Error:\s*(.+)$/);
      if (errorMatch) {
        pendingError = { kind: errorMatch[1], message: errorMatch[2].trim() };
        continue;
      }

      const locationMatch = line.match(/GDScript::reload\s+\((res:\/\/.+):(\d+)\)/);
      if (!pendingError || !locationMatch) {
        continue;
      }

      const missingIdentifier = pendingError.message.match(/^Identifier not found:\s*([A-Za-z_][A-Za-z0-9_]*)$/);
      const isAutoloadFalsePositive = pendingError.kind === 'Compile'
        && missingIdentifier !== null
        && autoloadNames.has(missingIdentifier[1]);

      if (!isAutoloadFalsePositive) {
        errors.push({
          file: locationMatch[1],
          line: Number.parseInt(locationMatch[2], 10),
          message: pendingError.message,
        });
      }
      pendingError = null;
    }

    if (pendingError) {
      errors.push({ file: fallbackFile, line: 0, message: pendingError.message });
    } else if (result.exitCode !== 0 && errors.length === 0) {
      const fallbackMessage = result.stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('WARNING:'));

      if (fallbackMessage && !fallbackMessage.startsWith('SCRIPT ERROR:')) {
        errors.push({ file: fallbackFile, line: 0, message: fallbackMessage });
      }
    }

    return errors;
  }

  /**
   * Start a Godot process and capture its output for the debug tools.
   */
  private async startGodotProcess(
    cmdArgs: string[],
    description: string,
    timeoutMs?: number
  ): Promise<GodotProcess> {
    if (this.activeProcess) {
      this.logDebug('Killing existing Godot process before starting a new one');
      await this.stopActiveGodotProcess();
    }

    const childProcess = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
    const output: string[] = [];
    const errors: string[] = [];
    const godotProcess: GodotProcess = {
      process: childProcess,
      output,
      errors,
      rawOutput: '',
      rawErrors: '',
      rawCombined: '',
    };
    this.activeProcess = godotProcess;

    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      godotProcess.rawOutput += chunk;
      godotProcess.rawCombined += chunk;
      const lines = chunk.split('\n');
      output.push(...lines);
      lines.forEach((line: string) => {
        if (line.trim()) this.logDebug(`[Godot stdout] ${line}`);
      });
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      godotProcess.rawErrors += chunk;
      godotProcess.rawCombined += chunk;
      const lines = chunk.split('\n');
      errors.push(...lines);
      lines.forEach((line: string) => {
        if (line.trim()) this.logDebug(`[Godot stderr] ${line}`);
      });
    });

    childProcess.on('exit', (code: number | null) => {
      this.logDebug(`Godot ${description} process exited with code ${code}`);
      if (godotProcess.timeout) {
        clearTimeout(godotProcess.timeout);
      }
      if (this.activeProcess?.process === childProcess) {
        this.activeProcess = null;
      }
    });

    childProcess.on('error', (err: Error) => {
      godotProcess.spawnError = err;
      console.error(`Failed to start Godot ${description} process:`, err);
      if (godotProcess.timeout) {
        clearTimeout(godotProcess.timeout);
      }
      if (this.activeProcess?.process === childProcess) {
        this.activeProcess = null;
      }
    });

    if (timeoutMs !== undefined) {
      godotProcess.timeout = setTimeout(() => {
        if (this.activeProcess?.process === childProcess) {
          this.logDebug(`Stopping Godot ${description} process after ${timeoutMs} ms timeout`);
          childProcess.kill();
        }
      }, timeoutMs);
    }

    return godotProcess;
  }

  /**
   * Stop a specific Godot process without affecting a newer active process.
   */
  private async stopGodotProcess(godotProcess: GodotProcess): Promise<void> {
    if (this.activeProcess === godotProcess) {
      await this.stopActiveGodotProcess();
      return;
    }

    const childProcess = godotProcess.process;
    if (childProcess.exitCode === null && childProcess.signalCode === null) {
      try {
        childProcess.kill();
      } catch {
        // The process may have exited between the state check and kill call.
      }
    }
  }

  /**
   * Stop the active Godot process and wait briefly for it to release resources.
   */
  private async stopActiveGodotProcess(): Promise<void> {
    const godotProcess = this.activeProcess;
    if (!godotProcess) {
      return;
    }

    if (godotProcess.timeout) {
      clearTimeout(godotProcess.timeout);
    }

    const childProcess = godotProcess.process;
    if (childProcess.exitCode === null && childProcess.signalCode === null) {
      await new Promise<void>((resolve) => {
        let settled = false;
        let waitTimeout: NodeJS.Timeout | undefined;

        const finish = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          if (waitTimeout) {
            clearTimeout(waitTimeout);
          }
          childProcess.removeListener('exit', finish);
          resolve();
        };

        waitTimeout = setTimeout(finish, PROCESS_EXIT_WAIT_MS);
        childProcess.once('exit', finish);

        try {
          if (!childProcess.kill()) {
            finish();
          }
        } catch {
          finish();
        }
      });
    }

    if (this.activeProcess === godotProcess) {
      this.activeProcess = null;
    }
  }

  /**
   * Handle the get_debug_output tool
   */
  private async handleGetDebugOutput() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process.',
        [
          'Use run_project or run_scene to start a Godot process first',
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
  private async handleStopProject() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process to stop.',
        [
          'Use run_project or run_scene to start a Godot process first',
          'The process may have already terminated',
        ]
      );
    }

    this.logDebug('Stopping active Godot process');
    const output = this.activeProcess.output;
    const errors = this.activeProcess.errors;
    await this.stopActiveGodotProcess();

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
  private async handleGetGodotVersion() {
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      this.logDebug('Getting Godot version');
      const { stdout } = await execFileAsync(this.godotPath!, ['--version']);
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
      return this.createErrorResponse(
        `Failed to get Godot version: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the list_projects tool
   */
  private async handleListProjects(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.directory) {
      return this.createErrorResponse(
        'Directory is required',
        ['Provide a valid directory path to search for Godot projects']
      );
    }

    if (!this.validatePath(args.directory)) {
      return this.createErrorResponse(
        'Invalid directory path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      this.logDebug(`Listing Godot projects in directory: ${args.directory}`);
      if (!existsSync(args.directory)) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
        `Failed to list projects: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the directory exists and is accessible',
          'Check if you have permission to read the directory',
        ]
      );
    }
  }

  /**
   * Get the structure of a Godot project asynchronously by counting files recursively
   * @param projectPath Path to the Godot project
   * @returns Promise resolving to an object with counts of scenes, scripts, assets, and other files
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
        this.logDebug(`Error getting project structure asynchronously: ${error}`);
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
   * Handle the get_project_info tool
   */
  private async handleGetProjectInfo(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }
  
    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }
  
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }
  
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }
  
      this.logDebug(`Getting project info for: ${args.projectPath}`);
  
      // Get Godot version
      const execOptions = { timeout: 10000 }; // 10 second timeout
      const { stdout } = await execFileAsync(this.godotPath!, ['--version'], execOptions);
  
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
          this.logDebug(`Found project name in config: ${projectName}`);
        }
      } catch (error) {
        this.logDebug(`Error reading project file: ${error}`);
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
      return this.createErrorResponse(
        `Failed to get project info: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_scene tool
   */
  private async handleCreateScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide valid paths for both the project and the scene']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    const rootNodeType = args.rootNodeType || 'Node2D';
    if (!this.validateClassName(rootNodeType)) {
      return this.createErrorResponse(
        'Invalid rootNodeType',
        ['rootNodeType must be a built-in Godot class name (no paths, no file extensions)']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
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
        rootNodeType,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
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
  private async handleAddNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodeType, and nodeName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    if (!this.validateClassName(args.nodeType)) {
      return this.createErrorResponse(
        'Invalid nodeType',
        ['nodeType must be a built-in Godot class name (no paths, no file extensions)']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
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
        return this.createErrorResponse(
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
      const { stdout, stderr } = await this.executeOperation('add_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
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
  private async handleLoadSprite(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and texturePath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.nodePath) ||
      !this.validatePath(args.texturePath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
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
        return this.createErrorResponse(
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
        return this.createErrorResponse(
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
      const { stdout, stderr } = await this.executeOperation('load_sprite', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
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
  private async handleExportMeshLibrary(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.outputPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and outputPath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.outputPath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
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
        return this.createErrorResponse(
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
      const { stdout, stderr } = await this.executeOperation('export_mesh_library', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
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
  private async handleSaveScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    // If newPath is provided, validate it
    if (args.newPath && !this.validatePath(args.newPath)) {
      return this.createErrorResponse(
        'Invalid new path',
        ['Provide a valid new path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
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
        return this.createErrorResponse(
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
      const { stdout, stderr } = await this.executeOperation('save_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
        `Failed to save scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_uid tool
   */
  private async handleGetUid(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.filePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and filePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.filePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
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
        return this.createErrorResponse(
          `File does not exist: ${args.filePath}`,
          ['Ensure the file path is correct']
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execFileAsync(this.godotPath!, ['--version']);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
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
      const { stdout, stderr } = await this.executeOperation('get_uid', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
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
  private async handleUpdateProjectUids(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execFileAsync(this.godotPath!, ['--version']);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
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
      const { stdout, stderr } = await this.executeOperation('resave_resources', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
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
      return this.createErrorResponse(
        `Failed to update project UIDs: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Run the MCP server
   */
  async run() {
    try {
      // Detect Godot path before starting the server
      await this.detectGodotPath();

      if (!this.godotPath) {
        console.error('[SERVER] Failed to find a valid Godot executable path');
        console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
        process.exit(1);
      }

      // Check if the path is valid
      const isValid = await this.isValidGodotPath(this.godotPath);

      if (!isValid) {
        if (this.strictPathValidation) {
          // In strict mode, exit if the path is invalid
          console.error(`[SERVER] Invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
          process.exit(1);
        } else {
          // In compatibility mode, warn but continue with the default path
          console.error(`[SERVER] Warning: Using potentially invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] This may cause issues when executing Godot commands');
          console.error('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
        }
      }

      console.error(`[SERVER] Using Godot at: ${this.godotPath}`);

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

// Create and run the server
const server = new GodotServer();
server.run().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Failed to run server:', errorMessage);
  process.exit(1);
});
