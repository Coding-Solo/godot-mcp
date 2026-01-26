#!/usr/bin/env node
/**
 * Godot MCP Server Entry Point
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import { GodotMCPServer } from './server.js';

// Create and run the server
const server = new GodotMCPServer();
server.run().catch((error: unknown) => {
	const errorMessage = error instanceof Error ? error.message : 'Unknown error';
	console.error('Failed to run server:', errorMessage);
	process.exit(1);
});
