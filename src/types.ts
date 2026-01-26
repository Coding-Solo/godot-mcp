/**
 * Shared type definitions for the Godot MCP server
 */

/**
 * Interface representing a running Godot process
 */
export interface GodotProcess {
	process: any;
	output: string[];
	errors: string[];
}

/**
 * Interface for server configuration
 */
export interface GodotServerConfig {
	godotPath?: string;
	debugMode?: boolean;
	godotDebugMode?: boolean;
	strictPathValidation?: boolean;
}

/**
 * Interface for operation parameters
 */
export interface OperationParams {
	[key: string]: any;
}

/**
 * Interface for tool response content
 */
export interface ToolResponse {
	content: Array<{
		type: string;
		text: string;
	}>;
	isError?: boolean;
}

/**
 * Interface for error response content
 */
export interface ErrorResponse extends ToolResponse {
	isError: true;
}
