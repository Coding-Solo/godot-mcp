#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import { fileURLToPath } from 'url';
import { GodotOpServer } from './godotOpServer.js';
import { join, dirname, basename, normalize, isAbsolute } from 'path';
import { existsSync, readdirSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { spawn, execFile } from 'child_process';
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

const execFileAsync = promisify(execFile);

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
  /** Warm resident-process pool for authoring ops (opt-in via GODOT_RESIDENT=1). */
  private opServer: GodotOpServer | null = null;

  /**
   * GDScript template for capture_level_overview. Tokens (__TARGET__, __OUT__,
   * __MAXW__, __MAXH__, __PAD__) are substituted at runtime. Instances the target
   * scene, computes the level's world AABB, frames a fitted Camera2D, and saves one
   * real rendered frame. Lines are flush-left on purpose — GDScript is
   * indentation-sensitive, so no host-code indentation may leak in.
   */
  private static readonly CAPTURE_GD = String.raw`extends Node2D
# Studio Leon — whole-level overview capture (auto-generated; safe to delete).
const TARGET_SCENE := "__TARGET__"
const OUT_PATH := "__OUT__"
const MAX_W := __MAXW__
const MAX_H := __MAXH__
const PAD := __PAD__

func _ready() -> void:
    var packed = ResourceLoader.load(TARGET_SCENE)
    if packed == null or not (packed is PackedScene):
        push_error("LEON_CAPTURE: cannot load scene " + TARGET_SCENE)
        get_tree().quit(2)
        return
    var inst = packed.instantiate()
    add_child(inst)
    # let the instanced scene's _ready run and tilemaps populate
    await get_tree().process_frame
    await get_tree().process_frame
    var b := _bounds(inst)
    if b.size.x <= 1.0 or b.size.y <= 1.0:
        b = Rect2(Vector2.ZERO, Vector2(1152.0, 648.0))
    b = b.grow(maxf(b.size.x, b.size.y) * PAD)
    var ar := b.size.x / b.size.y
    var ow := MAX_W
    var oh := int(round(float(MAX_W) / ar))
    if oh > MAX_H:
        oh = MAX_H
        ow = int(round(float(MAX_H) * ar))
    ow = maxi(ow, 16)
    oh = maxi(oh, 16)
    DisplayServer.window_set_size(Vector2i(ow, oh))
    var vp := get_viewport()
    var cam := Camera2D.new()
    add_child(cam)
    cam.position = b.position + b.size * 0.5
    var z: float = minf(float(ow) / b.size.x, float(oh) / b.size.y)
    cam.zoom = Vector2(z, z)
    cam.make_current()
    # settle the window resize + camera, then grab exactly one drawn frame
    for i in range(5):
        await get_tree().process_frame
    await RenderingServer.frame_post_draw
    var img := vp.get_texture().get_image()
    if img == null:
        push_error("LEON_CAPTURE: viewport image was null")
        get_tree().quit(4)
        return
    var err := img.save_png(OUT_PATH)
    if err != OK:
        push_error("LEON_CAPTURE: save_png failed err=" + str(err))
        get_tree().quit(3)
        return
    print("LEON_CAPTURE_DONE ", OUT_PATH, " ", ow, "x", oh, " bounds=", b)
    get_tree().quit(0)

func _xf_rect(xf: Transform2D, r: Rect2) -> Rect2:
    var p0 := xf * r.position
    var p1 := xf * (r.position + Vector2(r.size.x, 0.0))
    var p2 := xf * (r.position + Vector2(0.0, r.size.y))
    var p3 := xf * (r.position + r.size)
    var mn := Vector2(minf(minf(p0.x, p1.x), minf(p2.x, p3.x)), minf(minf(p0.y, p1.y), minf(p2.y, p3.y)))
    var mx := Vector2(maxf(maxf(p0.x, p1.x), maxf(p2.x, p3.x)), maxf(maxf(p0.y, p1.y), maxf(p2.y, p3.y)))
    return Rect2(mn, mx - mn)

func _bounds(root: Node) -> Rect2:
    var acc := Rect2()
    var has := false
    var stack: Array = [root]
    while not stack.is_empty():
        var n = stack.pop_back()
        # a level overview is the world, not the HUD — skip UI overlays
        if n is CanvasLayer:
            continue
        for c in n.get_children():
            stack.push_back(c)
        var rr := Rect2()
        var ok := false
        if n is Camera2D:
            var cam := n as Camera2D
            if cam.limit_left > -10000000 and cam.limit_right < 10000000 and cam.limit_right > cam.limit_left and cam.limit_bottom > cam.limit_top:
                rr = Rect2(Vector2(cam.limit_left, cam.limit_top), Vector2(cam.limit_right - cam.limit_left, cam.limit_bottom - cam.limit_top))
                ok = true
        elif n is TileMapLayer:
            var tl := n as TileMapLayer
            var used := tl.get_used_rect()
            if used.size.x > 0 and used.size.y > 0 and tl.tile_set != null:
                var ts := Vector2(tl.tile_set.tile_size)
                var local := Rect2(Vector2(used.position) * ts, Vector2(used.size) * ts)
                rr = _xf_rect(tl.global_transform, local)
                ok = true
        elif n is Sprite2D:
            var sp := n as Sprite2D
            if sp.texture != null:
                rr = _xf_rect(sp.global_transform, sp.get_rect())
                ok = true
        elif n is AnimatedSprite2D:
            var asp := n as AnimatedSprite2D
            var fr := asp.sprite_frames
            if fr != null and asp.animation != "" and fr.get_frame_count(asp.animation) > 0:
                var tex := fr.get_frame_texture(asp.animation, asp.frame)
                if tex != null:
                    var sz := tex.get_size()
                    rr = _xf_rect(asp.global_transform, Rect2(-sz * 0.5, sz))
                    ok = true
        if ok:
            acc = rr if not has else acc.merge(rr)
            has = true
    return acc if has else Rect2()
`;
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
    if (debugMode) console.error(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

    // Warm resident pool for authoring ops — opt-in (GODOT_RESIDENT=1) so it never changes
    // behavior unless enabled; when on, authoring ops reuse a warm process and fall back to
    // spawn-per-op on any resident failure.
    if (process.env.GODOT_RESIDENT === '1') {
      this.opServer = new GodotOpServer(
        () => this.godotPath,
        this.operationsScriptPath,
        (m) => this.logDebug(m),
      );
      if (debugMode) console.error('[DEBUG] Resident op-server ENABLED (GODOT_RESIDENT=1)');
    }

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
      this.activeProcess.process.kill();
      this.activeProcess = null;
    }
    this.opServer?.killAll();
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
          name: 'batch_author',
          description:
            "Apply an ORDERED list of authoring ops against ONE scene in a SINGLE Godot boot (instead of one boot per op) — the fast path for authoring a whole scene. The scene is loaded once and saved once; if any op fails, the process aborts BEFORE saving so the .tscn is left unchanged (no partial writes). Each ops[] entry is { op: <tool name>, ...that tool's params } (e.g. {op:'add_collision_shape', parentPath:'Player', shape:'rectangle', size:{x:16,y:24}}). Use it for the scene-authoring ops (add_node, add_collision_shape, add_animation, add_animated_sprite, paint_tilemap, add_area2d, set_camera_limits, add_particles, connect_signal, attach_script, set_node_property, instance_scene, remove_node).",
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'The .tscn all ops target (res:// or project-relative). Loaded once, saved once.' },
              ops: {
                type: 'array',
                description: "Ordered ops. Each is an object: { op: '<tool name>', ...that op's params }. Applied in order against the one loaded scene.",
                items: {
                  type: 'object',
                  properties: { op: { type: 'string', description: 'The authoring op name, e.g. "add_collision_shape"' } },
                  required: ['op'],
                },
              },
            },
            required: ['projectPath', 'scenePath', 'ops'],
          },
        },
        {
          name: 'capture_level_overview',
          description:
            "Render a whole-LEVEL overview PNG of a scene — the top-down \"level-designer's view\" of the entire level (all tilemaps/sprites framed to fit), NOT the in-game camera. Computes the level's world bounds (Camera2D limits if authored, else the union of TileMapLayer/Sprite2D extents), frames an orthographic camera to fit, and captures one real (non-headless) rendered frame. Use it to eyeball level layout, coverage, and composition the way you would in the Godot editor.",
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scene: { type: 'string', description: 'Scene to capture — a res:// path or project-relative .tscn (e.g. "res://levels/level1.tscn")' },
              outputPath: { type: 'string', description: 'Where to write the PNG (absolute, or relative to the project). Default: <project>/.studio/shots/level-overview.png' },
              maxWidth: { type: 'number', description: 'Max output width in px (default 1920). The level aspect is preserved within maxWidth×maxHeight.' },
              maxHeight: { type: 'number', description: 'Max output height in px (default 1080).' },
              padding: { type: 'number', description: 'Fractional margin around the level bounds, 0–0.5 (default 0.06).' },
            },
            required: ['projectPath', 'scene'],
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
          name: 'add_animation',
          description: 'Author an AnimationPlayer + a keyframed value-track Animation (walk/idle/attack). Use this instead of hand-rolling animation in _process.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Scene file (relative to project)' },
              animationName: { type: 'string', description: 'Name of the animation (e.g. "walk")' },
              playerParent: { type: 'string', description: 'Node to hold the AnimationPlayer (default "root")' },
              length: { type: 'number', description: 'Animation length in seconds' },
              loop: { type: 'boolean' },
              tracks: { type: 'array', description: 'Value tracks: [{ path: "Node:property" e.g. ".:position:y", keys: [{time, value}], interp?: "nearest" }]' },
            },
            required: ['projectPath', 'scenePath', 'animationName'],
          },
        },
        {
          name: 'add_collision_shape',
          description: 'Add a CollisionShape2D with a real shape to a body (CharacterBody2D/StaticBody2D/RigidBody2D). Fixes floating/no-collision characters.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              parentPath: { type: 'string', description: 'The body to attach the shape to' },
              shape: { type: 'string', enum: ['rectangle', 'circle', 'capsule'] },
              size: { type: 'array', description: '[w,h] for rectangle' },
              radius: { type: 'number' },
              height: { type: 'number' },
              position: { type: 'array', description: '[x,y] offset' },
              name: { type: 'string' },
            },
            required: ['projectPath', 'scenePath', 'parentPath'],
          },
        },
        {
          name: 'set_camera_limits',
          description: 'Set Camera2D limits (clamp the view to the map so it never scrolls past the edge). Creates the Camera2D if absent.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              cameraPath: { type: 'string' },
              cameraParent: { type: 'string', description: 'where to create the Camera2D if none (default root)' },
              limits: { type: 'object', description: '{ left, top, right, bottom }' },
              smoothing: { type: 'number', description: 'position smoothing speed (optional)' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'connect_signal',
          description: 'Persistently connect a signal into the scene (serialized to the .tscn) — wire nodes, do not hand-poll.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              fromPath: { type: 'string', description: 'node emitting the signal' },
              signal: { type: 'string' },
              toPath: { type: 'string', description: 'node with the handler method' },
              method: { type: 'string' },
            },
            required: ['projectPath', 'scenePath', 'fromPath', 'signal', 'toPath', 'method'],
          },
        },
        {
          name: 'add_animated_sprite',
          description: 'Add an AnimatedSprite2D + SpriteFrames built from a sprite-sheet grid — real frame animation from an atlas.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              parentPath: { type: 'string' },
              texture: { type: 'string', description: 'res:// path to the sprite sheet' },
              frameWidth: { type: 'number' },
              frameHeight: { type: 'number' },
              animations: { type: 'array', description: '[{ name, frames: [frameIndex,...], fps?, loop? }]' },
              autoplay: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['projectPath', 'scenePath', 'parentPath', 'texture'],
          },
        },
        {
          name: 'paint_tilemap',
          description: 'Add a TileMapLayer with a TileSet built from an atlas texture, and paint cells. Use for levels instead of hand-placing sprites.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              parentPath: { type: 'string' },
              texture: { type: 'string', description: 'res:// path to the tileset atlas' },
              tileSize: { type: 'number' },
              cells: { type: 'array', description: '[{ x, y, atlasX, atlasY }]' },
              name: { type: 'string' },
            },
            required: ['projectPath', 'scenePath', 'parentPath', 'texture'],
          },
        },
        {
          name: 'add_area2d',
          description: 'Add an Area2D + nested CollisionShape2D — hitboxes, hurtboxes, triggers, pickups (with collision layer/mask).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              parentPath: { type: 'string' },
              shape: { type: 'string', enum: ['rectangle', 'circle', 'capsule'] },
              size: { type: 'array' },
              radius: { type: 'number' },
              height: { type: 'number' },
              position: { type: 'array' },
              collisionLayer: { type: 'number' },
              collisionMask: { type: 'number' },
              name: { type: 'string' },
            },
            required: ['projectPath', 'scenePath', 'parentPath'],
          },
        },
        {
          name: 'add_particles',
          description: 'Add a GPUParticles2D + ParticleProcessMaterial — cheap juice (bursts, trails, dust).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              parentPath: { type: 'string' },
              amount: { type: 'number' },
              lifetime: { type: 'number' },
              texture: { type: 'string' },
              gravity: { type: 'number' },
              spread: { type: 'number' },
              velocity: { type: 'number' },
              oneShot: { type: 'boolean' },
              explosiveness: { type: 'number' },
              name: { type: 'string' },
            },
            required: ['projectPath', 'scenePath', 'parentPath'],
          },
        },
        {
          name: 'attach_script',
          description: 'Attach an existing GDScript (write the .gd first) to a node — this is where game behavior lives.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              nodePath: { type: 'string', description: 'e.g. "root" or "root/Player"' },
              scriptPath: { type: 'string', description: 'res:// path to the .gd file' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'scriptPath'],
          },
        },
        {
          name: 'set_node_property',
          description: 'Set properties on an existing node (res:// values are loaded as resources).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              nodePath: { type: 'string' },
              properties: { type: 'object' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
          },
        },
        {
          name: 'remove_node',
          description: 'Remove a node from a scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
              nodePath: { type: 'string' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'instance_scene',
          description: 'Instance a sub-scene (a PackedScene / prefab .tscn) as a child — the Godot way to compose (e.g. drop a Player prefab into a Level).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string', description: 'the parent scene to add into' },
              subScene: { type: 'string', description: 'res:// path to the .tscn to instance' },
              parentPath: { type: 'string' },
              name: { type: 'string' },
              position: { type: 'array', description: '[x,y]' },
            },
            required: ['projectPath', 'scenePath', 'subScene'],
          },
        },
        {
          name: 'get_scene_tree',
          description: 'Print a scene\'s node tree (name : type, + [script] markers) — inspect what exists before editing.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              scenePath: { type: 'string' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'add_input_action',
          description: 'Define an InputMap action in project.godot (so Input.is_action_pressed works). Fixes the "verb bound to nothing" bug — declare move/jump/attack here.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              action: { type: 'string', description: 'action name, e.g. "jump"' },
              events: { type: 'array', description: '[{type:"key", key:"Z"} | {type:"joy_button", button:0} | {type:"mouse_button", button:1}]' },
              deadzone: { type: 'number' },
            },
            required: ['projectPath', 'action'],
          },
        },
        {
          name: 'set_project_setting',
          description: 'Set project.godot settings — main scene (application/run/main_scene), window size, stretch mode, physics tick, etc. Run this so the game actually launches at a modern resolution.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              settings: { type: 'object', description: '{ "application/run/main_scene":"res://main.tscn", "display/window/size/viewport_width":1280, ... }' },
            },
            required: ['projectPath', 'settings'],
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
        case 'capture_level_overview':
          return await this.handleCaptureLevelOverview(request.params.arguments);
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
        case 'add_animation':
          return await this.handleAuthoringOp('add_animation', request.params.arguments, ['animationName']);
        case 'add_collision_shape':
          return await this.handleAuthoringOp('add_collision_shape', request.params.arguments, ['parentPath']);
        case 'set_camera_limits':
          return await this.handleAuthoringOp('set_camera_limits', request.params.arguments, []);
        case 'connect_signal':
          return await this.handleAuthoringOp('connect_signal', request.params.arguments, ['fromPath', 'signal', 'toPath', 'method']);
        case 'add_animated_sprite':
          return await this.handleAuthoringOp('add_animated_sprite', request.params.arguments, ['parentPath', 'texture']);
        case 'paint_tilemap':
          return await this.handleAuthoringOp('paint_tilemap', request.params.arguments, ['parentPath', 'texture']);
        case 'batch_author':
          return await this.handleAuthoringOp('batch_author', request.params.arguments, ['ops']);
        case 'add_area2d':
          return await this.handleAuthoringOp('add_area2d', request.params.arguments, ['parentPath']);
        case 'add_particles':
          return await this.handleAuthoringOp('add_particles', request.params.arguments, ['parentPath']);
        case 'attach_script':
          return await this.handleAuthoringOp('attach_script', request.params.arguments, ['nodePath', 'scriptPath']);
        case 'set_node_property':
          return await this.handleAuthoringOp('set_node_property', request.params.arguments, ['nodePath', 'properties']);
        case 'remove_node':
          return await this.handleAuthoringOp('remove_node', request.params.arguments, ['nodePath']);
        case 'instance_scene':
          return await this.handleAuthoringOp('instance_scene', request.params.arguments, ['subScene']);
        case 'get_scene_tree':
          // returns the tree on stdout, not a TCP ack — must stay spawn-per-op
          return await this.handleAuthoringOp('get_scene_tree', request.params.arguments, [], true, false);
        case 'add_input_action':
          return await this.handleAuthoringOp('add_input_action', request.params.arguments, ['action'], false);
        case 'set_project_setting':
          return await this.handleAuthoringOp('set_project_setting', request.params.arguments, ['settings'], false);
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

      // Kill any existing process
      if (this.activeProcess) {
        this.logDebug('Killing existing Godot process before starting a new one');
        this.activeProcess.process.kill();
      }

      // Reduce cross-instance contention when multiple teams/subagents run Godot at
      // once: silence audio (avoid the shared audio device) and spread the window so
      // concurrent instances don't perfectly overlap. Keep a real (non-headless)
      // render so rendering bugs are still visible — headless uses the dummy renderer.
      const px = 40 + Math.floor(Math.random() * 400);
      const py = 40 + Math.floor(Math.random() * 200);
      const cmdArgs = ['-d', '--path', args.projectPath, '--audio-driver', 'Dummy', '--position', `${px},${py}`];
      if (args.scene && this.validatePath(args.scene)) {
        this.logDebug(`Adding scene parameter: ${args.scene}`);
        cmdArgs.push(args.scene);
      }

      this.logDebug(`Running Godot project: ${args.projectPath}`);
      const process = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
      const output: string[] = [];
      const errors: string[] = [];

      process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        output.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stdout] ${line}`);
        });
      });

      process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        errors.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stderr] ${line}`);
        });
      });

      process.on('exit', (code: number | null) => {
        this.logDebug(`Godot process exited with code ${code}`);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot process:', err);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      this.activeProcess = { process, output, errors };

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
   * Handle the capture_level_overview tool — render the WHOLE level (the
   * "level-designer's view"), not the in-game camera. We generate a tiny throwaway
   * capture scene into the project that: instances the target scene, computes the
   * level's world AABB (authored Camera2D limits if present, else the union of
   * TileMapLayer/Sprite2D extents), frames an orthographic Camera2D to fit, and grabs
   * exactly one REAL (non-headless) rendered frame to a PNG. Headless is useless here —
   * the dummy renderer produces blank frames — so this runs with the real renderer,
   * same as run_project. Temp files are cleaned up afterwards.
   */
  private async handleCaptureLevelOverview(args: any) {
    if (!args || !args.projectPath) {
      return this.createErrorResponse('Project path is required', ['Provide a valid path to a Godot project directory']);
    }
    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse('Invalid project path', ['Provide a valid path without ".." or other potentially unsafe characters']);
    }
    if (!args.scene) {
      return this.createErrorResponse('scene is required', ['Provide the .tscn to capture, e.g. "res://levels/level1.tscn"']);
    }
    const projectFile = join(args.projectPath, 'project.godot');
    if (!existsSync(projectFile)) {
      return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
        'Ensure the path points to a directory containing a project.godot file',
      ]);
    }

    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        return this.createErrorResponse('Could not find a Godot executable', ['Set GODOT_PATH to your Godot binary']);
      }
    }

    // Normalise the scene to a res:// path.
    let resScene: string = String(args.scene);
    if (!resScene.startsWith('res://')) resScene = 'res://' + resScene.replace(/^\/+/, '');

    // Output PNG — default into the studio shot convention.
    let outPath: string = args.outputPath ? String(args.outputPath) : join(args.projectPath, '.studio', 'shots', 'level-overview.png');
    if (!isAbsolute(outPath)) outPath = join(args.projectPath, outPath);
    try {
      mkdirSync(dirname(outPath), { recursive: true });
    } catch {}

    const maxW = Math.min(Math.max(parseInt(String(args.maxWidth ?? 1920), 10) || 1920, 128), 4096);
    const maxH = Math.min(Math.max(parseInt(String(args.maxHeight ?? 1080), 10) || 1080, 128), 4096);
    const pad = Math.min(Math.max(Number(args.padding ?? 0.06) || 0.06, 0), 0.5);

    // Throwaway capture scene + script written into the project (so res:// resolves).
    const stamp = Date.now().toString(36);
    const gdName = `__leon_capture_${stamp}.gd`;
    const tscnName = `__leon_capture_${stamp}.tscn`;
    const gdAbs = join(args.projectPath, gdName);
    const tscnAbs = join(args.projectPath, tscnName);
    const gdSource = GodotServer.CAPTURE_GD
      .replace(/__TARGET__/g, resScene)
      .replace(/__OUT__/g, outPath.replace(/\\/g, '/'))
      .replace(/__MAXW__/g, String(maxW))
      .replace(/__MAXH__/g, String(maxH))
      .replace(/__PAD__/g, String(pad));
    const tscnSource =
      `[gd_scene load_steps=2 format=3]\n\n` +
      `[ext_resource type="Script" path="res://${gdName}" id="1_cap"]\n\n` +
      `[node name="LeonCapture" type="Node2D"]\n` +
      `script = ExtResource("1_cap")\n`;

    const cleanup = () => {
      for (const f of [gdAbs, tscnAbs, `${gdAbs}.uid`, `${tscnAbs}.uid`, `${gdAbs}.import`, `${tscnAbs}.import`]) {
        try { unlinkSync(f); } catch {}
      }
    };

    try {
      writeFileSync(gdAbs, gdSource, 'utf8');
      writeFileSync(tscnAbs, tscnSource, 'utf8');

      // Kill any of OUR older capture/run before spawning (avoid piling up windows).
      if (this.activeProcess) {
        try { this.activeProcess.process.kill(); } catch {}
        this.activeProcess = null;
      }

      const px = 40 + Math.floor(Math.random() * 400);
      const py = 40 + Math.floor(Math.random() * 200);
      const cmdArgs = ['-d', '--path', args.projectPath, '--audio-driver', 'Dummy', '--position', `${px},${py}`, `res://${tscnName}`];
      this.logDebug(`Capturing level overview: ${resScene} -> ${outPath}`);

      const result = await new Promise<{ code: number | null; out: string; err: string; timedOut: boolean }>((resolve) => {
        const proc = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
        let out = '';
        let err = '';
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          try { proc.kill('SIGKILL'); } catch {}
        }, 60000);
        proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
        proc.on('exit', (code: number | null) => { clearTimeout(timer); resolve({ code, out, err, timedOut }); });
        proc.on('error', (e: Error) => { clearTimeout(timer); resolve({ code: -1, out, err: `${err}\n${e.message}`, timedOut }); });
      });

      const produced = existsSync(outPath);
      const doneLine = (result.out.split('\n').find((l) => l.includes('LEON_CAPTURE_DONE')) || '').trim();

      if (!produced) {
        const tail = (result.err || result.out).split('\n').filter(Boolean).slice(-12).join('\n');
        return this.createErrorResponse(
          `Level overview capture produced no PNG${result.timedOut ? ' (timed out after 60s)' : ` (exit ${result.code})`}`,
          [
            'Confirm the scene path is correct and the scene loads standalone',
            'The scene needs some visible TileMapLayer/Sprite2D content (or a Camera2D with limits) to frame',
            'A real display/renderer is required — headless produces blank frames',
            tail ? `Godot said:\n${tail}` : 'No output captured from Godot',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                savedTo: outPath,
                scene: resScene,
                detail: doneLine || `captured (exit ${result.code})`,
                note: 'Whole-level overview (level-designer view), not the in-game camera. Read the PNG and judge it like an art director.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to capture level overview: ${msg}`, [
        'Ensure Godot is installed and GODOT_PATH is correct',
        'Verify the project path and scene are accessible',
      ]);
    } finally {
      cleanup();
    }
  }

  /**
   * Handle the get_debug_output tool
   */
  private async handleGetDebugOutput() {
    // Return GRACEFULLY (not an error) when there's no active process. An error
    // tool_result here surfaces to the Agent SDK as `error_during_execution` and
    // KILLS the whole session — especially under concurrency, when another run
    // replaced/killed this one. A benign "no active process" is safe.
    if (!this.activeProcess) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                output: [],
                errors: [],
                note: 'No active Godot process — it may have finished, been stopped, or been replaced by another run (concurrency). Use run_project to start one.',
              },
              null,
              2
            ),
          },
        ],
      };
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
    // Graceful (not an error) — see handleGetDebugOutput: an error here can kill the session.
    if (!this.activeProcess) {
      return {
        content: [{ type: 'text', text: 'No active Godot process to stop (already stopped, exited, or replaced by another run).' }],
      };
    }

    this.logDebug('Stopping active Godot process');
    this.activeProcess.process.kill();
    const output = this.activeProcess.output;
    const errors = this.activeProcess.errors;
    this.activeProcess = null;

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
  // Generic handler for the headless AUTHORING-LAYER ops (animation, collision,
  // camera limits, signals, animated sprites, tilemaps, areas, particles). Each
  // validates the project + scene, then drives godot_operations.gd via executeOperation.
  private async handleAuthoringOp(operation: string, args: any, required: string[], needsScene = true, residentOk = true) {
    args = this.normalizeParameters(args);
    const need = ['projectPath', ...(needsScene ? ['scenePath'] : []), ...required];
    for (const key of need) {
      if (args[key] === undefined || args[key] === null || args[key] === '') {
        return this.createErrorResponse(`Missing required parameter: ${key}`, [
          `Provide: ${need.join(', ')}`,
        ]);
      }
    }
    if (!this.validatePath(args.projectPath) || (needsScene && !this.validatePath(args.scenePath))) {
      return this.createErrorResponse('Invalid path', [
        'Provide valid paths without ".." or other unsafe characters',
      ]);
    }
    if (!existsSync(join(args.projectPath, 'project.godot'))) {
      return this.createErrorResponse(`Not a valid Godot project: ${args.projectPath}`, [
        'The path must contain a project.godot file',
      ]);
    }
    if (needsScene && !existsSync(join(args.projectPath, args.scenePath))) {
      return this.createErrorResponse(`Scene file does not exist: ${args.scenePath}`, [
        'Create it with create_scene first',
      ]);
    }
    const params: any = { ...args };
    delete params.projectPath;

    // Prefer the warm resident when enabled. It's a pure accelerator: on success we return;
    // on an INFRA failure (resident died/unavailable — which also covers a handler that
    // crashed the process BEFORE its save, so nothing persisted) we transparently fall
    // through to spawn-per-op, which re-runs cleanly and reports the real error. A resident
    // TIMEOUT is NOT retried (the op may have run), it's surfaced as an error.
    if (this.opServer && residentOk && needsScene) {
      const rr = await this.opServer
        .call(args.projectPath, operation, params)
        .catch((e: unknown) => ({ ok: false, error: String((e as Error)?.message ?? e), stdout: '' }));
      if (rr.ok) {
        return { content: [{ type: 'text', text: `${operation} completed (resident).\n${rr.stdout}`.trim() }] };
      }
      const err = rr.error ?? '';
      const infraFailure = /resident died|not available|ready|become ready|process exited|no Godot|socket closed/.test(err);
      if (!infraFailure) {
        return this.createErrorResponse(
          `${operation} failed: ${err || 'resident error'}`,
          [
            'Check the node paths (parentPath/fromPath/toPath) exist in the scene',
            'Verify any referenced texture path is a res:// resource',
            rr.stdout ? `Resident output:\n${rr.stdout.slice(-400)}` : '',
          ].filter(Boolean),
        );
      }
      // infra failure — fall through to the spawn-per-op path below
    }

    try {
      const { stdout, stderr } = await this.executeOperation(operation, params, args.projectPath);
      if (stderr && /Failed to|not found|does not exist|has no signal/.test(stderr)) {
        return this.createErrorResponse(`${operation} failed: ${stderr.trim().slice(-400)}`, [
          'Check the node paths (parentPath/fromPath/toPath) exist in the scene',
          'Verify any referenced texture path is a res:// resource',
        ]);
      }
      return { content: [{ type: 'text', text: `${operation} completed.\n${stdout}`.trim() }] };
    } catch (e: any) {
      return this.createErrorResponse(`${operation} error: ${e?.message ?? String(e)}`, []);
    }
  }

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
