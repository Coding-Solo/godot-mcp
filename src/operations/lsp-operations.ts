/**
 * LSP operation handlers (diagnostics, references, native classes)
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import type { ToolResponse } from '../types.js';
import { GodotLSPClient } from '../lsp-client.js';
import { ParameterMapper } from '../utils/parameters.js';
import { createErrorResponse, validatePath, logDebug } from '../utils/validation.js';

/**
 * LSPOperations handles all LSP-related operations
 */
export class LSPOperations {
	private godotPath: string;
	private lspClient: GodotLSPClient | null = null;
	private headlessLspProcess: any = null;

	constructor(godotPath: string) {
		this.godotPath = godotPath;
	}

	/**
	 * Update the Godot path
	 */
	setGodotPath(godotPath: string): void {
		this.godotPath = godotPath;
	}

	/**
	 * Start a headless Godot LSP server process
	 */
	async startHeadlessLspServer(projectPath: string): Promise<void> {
		// Don't start if already running
		if (this.headlessLspProcess) {
			logDebug('Headless LSP server already running');
			return;
		}

		logDebug(`Starting headless Godot LSP server on port 6010 for project: ${projectPath}`);

		// Spawn Godot in headless mode with LSP enabled on port 6010
		this.headlessLspProcess = spawn(
			this.godotPath,
			['--headless', '--editor', '--lsp-port', '6010', '--path', projectPath],
			{
				stdio: ['ignore', 'pipe', 'pipe'],
			}
		);

		// Log output for debugging
		if (this.headlessLspProcess.stdout) {
			this.headlessLspProcess.stdout.on('data', (data: Buffer) => {
				logDebug(`[Headless LSP] ${data.toString().trim()}`);
			});
		}

		if (this.headlessLspProcess.stderr) {
			this.headlessLspProcess.stderr.on('data', (data: Buffer) => {
				logDebug(`[Headless LSP Error] ${data.toString().trim()}`);
			});
		}

		this.headlessLspProcess.on('exit', (code: number) => {
			logDebug(`Headless LSP server exited with code ${code}`);
			this.headlessLspProcess = null;
		});

		// Wait a bit for the LSP server to start up
		await new Promise(resolve => setTimeout(resolve, 2000));
		logDebug('Headless LSP server started');
	}

	/**
	 * Stop the headless Godot LSP server process
	 */
	stopHeadlessLspServer(): void {
		if (this.headlessLspProcess) {
			logDebug('Stopping headless LSP server');
			this.headlessLspProcess.kill();
			this.headlessLspProcess = null;
		}
	}

	/**
	 * Cleanup LSP resources
	 */
	cleanup(): void {
		if (this.lspClient) {
			logDebug('Disconnecting LSP client');
			this.lspClient.disconnect();
			this.lspClient = null;
		}
		this.stopHeadlessLspServer();
	}

	/**
	 * Format diagnostics response for a single file
	 */
	private formatDiagnosticsResponse(filePath: string, diagnostics: any[], isSingleFile: boolean): ToolResponse {
		if (diagnostics.length === 0) {
			return {
				content: [
					{
						type: 'text',
						text: isSingleFile
							? `No diagnostics found for ${filePath}. The file has no errors, warnings, or hints.`
							: 'No diagnostics found for any files in the project.',
					},
				],
			};
		}

		const severityNames = ['', 'Error', 'Warning', 'Information', 'Hint'];
		let output = isSingleFile
			? `Diagnostics for ${filePath}:\n\n`
			: `Found ${diagnostics.length} diagnostic(s):\n\n`;

		const errors = diagnostics.filter(d => d.severity === 1).length;
		const warnings = diagnostics.filter(d => d.severity === 2).length;
		const info = diagnostics.filter(d => d.severity === 3).length;
		const hints = diagnostics.filter(d => d.severity === 4).length;

		output += `Summary:\n`;
		if (errors > 0) output += `  ❌ ${errors} error(s)\n`;
		if (warnings > 0) output += `  ⚠️  ${warnings} warning(s)\n`;
		if (info > 0) output += `  ℹ️  ${info} info message(s)\n`;
		if (hints > 0) output += `  💡 ${hints} hint(s)\n`;
		output += '\n';

		diagnostics.forEach((diagnostic, index) => {
			const severity = severityNames[diagnostic.severity || 1];
			const line = diagnostic.range.start.line + 1; // Convert to 1-indexed for display
			const char = diagnostic.range.start.character;

			output += `${index + 1}. [${severity}] Line ${line}:${char}\n`;
			output += `   ${diagnostic.message}\n`;
			if (diagnostic.code) {
				output += `   Code: ${diagnostic.code}\n`;
			}
			output += '\n';
		});

		return {
			content: [
				{
					type: 'text',
					text: output.trim(),
				},
			],
		};
	}

	/**
	 * Format diagnostics response for all files
	 */
	private formatAllDiagnosticsResponse(allDiagnostics: Map<string, any[]>): ToolResponse {
		if (allDiagnostics.size === 0) {
			return {
				content: [
					{
						type: 'text',
						text: 'No diagnostics available. The LSP server has not reported any issues for any files.',
					},
				],
			};
		}

		let totalErrors = 0;
		let totalWarnings = 0;
		let totalInfo = 0;
		let totalHints = 0;
		let output = `Diagnostics for all files in project:\n\n`;

		const filesWithIssues: Array<{ uri: string; diagnostics: any[] }> = [];

		allDiagnostics.forEach((diagnostics, uri) => {
			if (diagnostics.length > 0) {
				filesWithIssues.push({ uri, diagnostics });
				diagnostics.forEach(d => {
					if (d.severity === 1) totalErrors++;
					else if (d.severity === 2) totalWarnings++;
					else if (d.severity === 3) totalInfo++;
					else if (d.severity === 4) totalHints++;
				});
			}
		});

		output += `Overall Summary:\n`;
		output += `  📁 ${filesWithIssues.length} file(s) with issues\n`;
		if (totalErrors > 0) output += `  ❌ ${totalErrors} error(s)\n`;
		if (totalWarnings > 0) output += `  ⚠️  ${totalWarnings} warning(s)\n`;
		if (totalInfo > 0) output += `  ℹ️  ${totalInfo} info message(s)\n`;
		if (totalHints > 0) output += `  💡 ${totalHints} hint(s)\n`;
		output += '\n';

		const severityNames = ['', 'Error', 'Warning', 'Information', 'Hint'];

		filesWithIssues.forEach(({ uri, diagnostics }) => {
			// Extract file name from URI
			const fileName = uri.replace(/^file:\/\/\//, '').replace(/%3A/g, ':');
			output += `\n📄 ${fileName} (${diagnostics.length} issue(s)):\n`;

			diagnostics.forEach((diagnostic, index) => {
				const severity = severityNames[diagnostic.severity || 1];
				const line = diagnostic.range.start.line + 1;
				const char = diagnostic.range.start.character;

				output += `  ${index + 1}. [${severity}] Line ${line}:${char} - ${diagnostic.message}\n`;
			});
		});

		return {
			content: [
				{
					type: 'text',
					text: output.trim(),
				},
			],
		};
	}

	/**
	 * Handle the get_file_diagnostics tool
	 */
	async handleGetFileDiagnostics(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath) {
			return createErrorResponse(
				'Missing required parameter: projectPath',
				['Provide a valid path to a Godot project directory']
			);
		}

		if (!validatePath(args.projectPath)) {
			return createErrorResponse(
				'Invalid project path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		if (args.filePath && !validatePath(args.filePath)) {
			return createErrorResponse(
				'Invalid file path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		try {
			// Check if the project directory exists and contains a project.godot file
			const projectFile = join(args.projectPath, 'project.godot');
			if (!existsSync(projectFile)) {
				return createErrorResponse(
					`Not a valid Godot project: ${args.projectPath}`,
					[
						'Ensure the path points to a directory containing a project.godot file',
						'Use list_projects to find valid Godot projects',
					]
				);
			}

			// Start headless LSP server if not already running
			await this.startHeadlessLspServer(args.projectPath);

			// Initialize LSP client if not already done
			if (!this.lspClient) {
				this.lspClient = new GodotLSPClient();
			}

			// Connect and initialize if needed
			if (!this.lspClient.isConnected()) {
				logDebug('Connecting to Godot LSP server...');
				await this.lspClient.connect();
			}

			if (!this.lspClient.isInitialized()) {
				logDebug('Initializing LSP client...');
				await this.lspClient.initialize(args.projectPath);
			}

			// Get diagnostics
			if (args.filePath) {
				// Get diagnostics for a specific file
				let pathForLSP = args.filePath;
				let pathForFileCheck = args.filePath;

				// Normalize path separators
				pathForLSP = pathForLSP.replace(/\\/g, '/');
				pathForFileCheck = pathForFileCheck.replace(/\\/g, '/');
				const normalizedProjectPath = args.projectPath.replace(/\\/g, '/');

				// For file existence check, we need an absolute path
				if (!pathForFileCheck.startsWith('file://') &&
					!pathForFileCheck.match(/^[a-zA-Z]:/) &&
					!pathForFileCheck.startsWith('/')) {
					// Relative path - join with project path for file check
					pathForFileCheck = join(normalizedProjectPath, pathForFileCheck).replace(/\\/g, '/');
				}

				// Check if file exists (convert to local path for checking)
				let filePathToCheck = pathForFileCheck;
				if (filePathToCheck.startsWith('file://')) {
					filePathToCheck = filePathToCheck.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
					filePathToCheck = filePathToCheck.replace(/%3A/g, ':');
				}
				// Convert to platform-specific path for existence check
				if (process.platform === 'win32') {
					filePathToCheck = filePathToCheck.replace(/\//g, '\\');
				}

				if (!existsSync(filePathToCheck)) {
					return createErrorResponse(
						`File does not exist: ${args.filePath}`,
						[
							'Verify the file path is correct',
							'Use relative path from project root or absolute path',
							`Resolved to: ${filePathToCheck}`
						]
					);
				}

				// For LSP operations, pass the absolute path and let the LSP client normalize to res://
				// If it's a relative path, make it absolute for the LSP client to properly normalize
				if (!pathForLSP.startsWith('file://') &&
					!pathForLSP.match(/^[a-zA-Z]:/) &&
					!pathForLSP.startsWith('/') &&
					!pathForLSP.startsWith('res://')) {
					// Relative path - make absolute so LSP client can convert to res://
					pathForLSP = join(normalizedProjectPath, pathForLSP).replace(/\\/g, '/');
				}

				// Open the document to trigger analysis and diagnostics
				// The LSP client will normalize this to res:// protocol internally
				logDebug(`Opening document for analysis: ${pathForLSP}`);
				await this.lspClient.openDocument(pathForLSP);

				// Wait for diagnostics to be published
				logDebug('Waiting for diagnostics...');
				await new Promise(resolve => setTimeout(resolve, 1000));

				const diagnostics = this.lspClient.getDiagnostics(pathForLSP);

				// Close the document after getting diagnostics
				await this.lspClient.closeDocument(pathForLSP);

				return this.formatDiagnosticsResponse(args.filePath, diagnostics, true);
			} else {
				// Get diagnostics for all files - just return what's already cached
				// Note: This returns only files that have been previously opened
				const allDiagnostics = this.lspClient.getAllDiagnostics();

				if (allDiagnostics.size === 0) {
					return {
						content: [
							{
								type: 'text',
								text: 'No diagnostics available. To get diagnostics for a specific file, provide the filePath parameter. The LSP server only analyzes files that are explicitly opened.',
							},
						],
					};
				}

				return this.formatAllDiagnosticsResponse(allDiagnostics);
			}
		} catch (error: any) {
			// Provide helpful error messages
			let errorMessage = error?.message || 'Unknown error';
			const solutions = [
				'Ensure the Godot editor is running with the project open',
				'Verify that the LSP server is running on port 6010',
				'Wait a moment for the LSP server to analyze the project',
			];

			if (errorMessage.includes('ECONNREFUSED')) {
				errorMessage = 'Could not connect to Godot LSP server. Is the Godot editor running?';
			} else if (errorMessage.includes('timeout')) {
				errorMessage = 'Connection to LSP server timed out';
				solutions.push('The Godot editor may be busy or unresponsive');
			}

			return createErrorResponse(
				`Failed to get diagnostics: ${errorMessage}`,
				solutions
			);
		}
	}

	/**
	 * Handle the find_symbol_references tool
	 */
	async handleFindSymbolReferences(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.filePath || args.line === undefined || args.character === undefined) {
			return createErrorResponse(
				'Missing required parameters',
				['Provide projectPath, filePath, line, and character']
			);
		}

		if (!validatePath(args.projectPath) || !validatePath(args.filePath)) {
			return createErrorResponse(
				'Invalid path',
				['Provide valid paths without ".." or other potentially unsafe characters']
			);
		}

		try {
			// Check if the project directory exists
			const projectFile = join(args.projectPath, 'project.godot');
			if (!existsSync(projectFile)) {
				return createErrorResponse(
					`Not a valid Godot project: ${args.projectPath}`,
					[
						'Ensure the path points to a directory containing a project.godot file',
						'Use list_projects to find valid Godot projects',
					]
				);
			}

			// Resolve file path
			let absolutePath = args.filePath;
			absolutePath = absolutePath.replace(/\\/g, '/');
			const normalizedProjectPath = args.projectPath.replace(/\\/g, '/');

			if (!args.filePath.startsWith('file://') &&
				!absolutePath.match(/^[a-zA-Z]:/) &&
				!absolutePath.startsWith('/')) {
				absolutePath = join(normalizedProjectPath, absolutePath).replace(/\\/g, '/');
			}

			// Check if file exists
			let filePathToCheck = absolutePath;
			if (filePathToCheck.startsWith('file://')) {
				filePathToCheck = filePathToCheck.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
				filePathToCheck = filePathToCheck.replace(/%3A/g, ':');
			}
			if (process.platform === 'win32') {
				filePathToCheck = filePathToCheck.replace(/\//g, '\\');
			}

			if (!existsSync(filePathToCheck)) {
				return createErrorResponse(
					`File does not exist: ${args.filePath}`,
					[
						'Verify the file path is correct',
						'Use relative path from project root or absolute path',
						`Resolved to: ${filePathToCheck}`
					]
				);
			}

			// Start headless LSP server if not already running
			await this.startHeadlessLspServer(args.projectPath);

			// Initialize LSP client if not already done
			if (!this.lspClient) {
				this.lspClient = new GodotLSPClient();
			}

			// Connect and initialize if needed
			if (!this.lspClient.isConnected()) {
				logDebug('Connecting to Godot LSP server...');
				await this.lspClient.connect();
			}

			if (!this.lspClient.isInitialized()) {
				logDebug('Initializing LSP client...');
				await this.lspClient.initialize(args.projectPath);
			}

			// Open the document
			logDebug(`Opening document: ${absolutePath}`);
			await this.lspClient.openDocument(absolutePath);

			// Wait for the document to be processed
			await new Promise(resolve => setTimeout(resolve, 500));

			// Find references
			const includeDeclaration = args.includeDeclaration !== undefined ? args.includeDeclaration : true;
			logDebug(`Finding references at ${args.line}:${args.character}`);
			const references = await this.lspClient.findReferences(
				absolutePath,
				args.line,
				args.character,
				includeDeclaration
			);

			// Close the document
			await this.lspClient.closeDocument(absolutePath);

			// Format the response
			if (!references || references.length === 0) {
				return {
					content: [
						{
							type: 'text',
							text: `No references found for the symbol at line ${args.line}, character ${args.character} in ${args.filePath}.`,
						},
					],
				};
			}

			// Group references by file
			const referencesByFile = new Map<string, any[]>();
			references.forEach(ref => {
				const uri = ref.uri;
				if (!referencesByFile.has(uri)) {
					referencesByFile.set(uri, []);
				}
				referencesByFile.get(uri)!.push(ref);
			});

			// Format output
			let output = `Found ${references.length} reference(s) for symbol at ${args.filePath}:${args.line}:${args.character}\n\n`;

			referencesByFile.forEach((refs, uri) => {
				// Convert URI to readable path
				const filePath = uri.replace(/^file:\/\/\//, '').replace(/%3A/g, ':').replace(/\//g, '\\');
				output += `📄 ${filePath} (${refs.length} reference(s)):\n`;

				refs.forEach((ref, idx) => {
					const line = ref.range.start.line + 1; // Convert to 1-indexed
					const char = ref.range.start.character;
					output += `  ${idx + 1}. Line ${line}:${char}\n`;
				});
				output += '\n';
			});

			return {
				content: [
					{
						type: 'text',
						text: output.trim(),
					},
				],
			};
		} catch (error: any) {
			let errorMessage = error?.message || 'Unknown error';
			const solutions = [
				'Ensure the Godot editor is running with the project open',
				'Verify that the LSP server is running on port 6010',
				'Check that the file path and position are correct',
				'Make sure the symbol exists at the specified position',
			];

			if (errorMessage.includes('ECONNREFUSED')) {
				errorMessage = 'Could not connect to Godot LSP server. Is the Godot editor running?';
			} else if (errorMessage.includes('timeout')) {
				errorMessage = 'Connection to LSP server timed out';
				solutions.push('The Godot editor may be busy or unresponsive');
			}

			return createErrorResponse(
				`Failed to find symbol references: ${errorMessage}`,
				solutions
			);
		}
	}

	/**
	 * Handle the get_godot_native_class tool
	 */
	async handleGetGodotNativeClass(args: any): Promise<ToolResponse> {
		// Normalize parameters to camelCase
		args = ParameterMapper.normalizeParameters(args);

		if (!args.projectPath || !args.className) {
			return createErrorResponse(
				'Missing required parameters',
				['Provide projectPath and className']
			);
		}

		if (!validatePath(args.projectPath)) {
			return createErrorResponse(
				'Invalid project path',
				['Provide a valid path without ".." or other potentially unsafe characters']
			);
		}

		try {
			// Check if the project directory exists
			const projectFile = join(args.projectPath, 'project.godot');
			if (!existsSync(projectFile)) {
				return createErrorResponse(
					`Not a valid Godot project: ${args.projectPath}`,
					[
						'Ensure the path points to a directory containing a project.godot file',
						'Use list_projects to find valid Godot projects',
					]
				);
			}

			// Start headless LSP server if not already running
			await this.startHeadlessLspServer(args.projectPath);

			// Initialize LSP client if not already done
			if (!this.lspClient) {
				this.lspClient = new GodotLSPClient();
			}

			// Connect and initialize if needed
			if (!this.lspClient.isConnected()) {
				logDebug('Connecting to Godot LSP server...');
				await this.lspClient.connect();
			}

			if (!this.lspClient.isInitialized()) {
				logDebug('Initializing LSP client...');
				await this.lspClient.initialize(args.projectPath);
			}

			// Wait for native classes to be received
			await new Promise(resolve => setTimeout(resolve, 500));

			// Look up the class
			const classInfo = this.lspClient.getNativeClass(args.className);

			if (!classInfo) {
				// Try to search for similar classes
				const similarClasses = this.lspClient.searchNativeClasses(args.className);

				if (similarClasses.length === 0) {
					return createErrorResponse(
						`Godot class not found: ${args.className}`,
						['Check the class name spelling', 'Try a partial match (e.g., "Node" to find all Node classes)']
					);
				}

				let suggestions = 'Did you mean one of these?\n\n';
				similarClasses.slice(0, 10).forEach((cls, idx) => {
					suggestions += `${idx + 1}. ${cls.name}\n`;
				});

				return {
					content: [
						{
							type: 'text',
							text: suggestions,
						},
					],
				};
			}

			// Format the class information
			let output = `Godot Class: ${classInfo.name}\n\n`;

			if (classInfo.base_class) {
				output += `Base Class: ${classInfo.base_class}\n`;
			}

			if (classInfo.description) {
				output += `\nDescription:\n${classInfo.description}\n`;
			}

			// Add properties/members if available
			if (classInfo.properties && classInfo.properties.length > 0) {
				output += `\nProperties (${classInfo.properties.length}):\n`;
				classInfo.properties.slice(0, 15).forEach((prop: any, idx: number) => {
					const type = prop.type || 'unknown';
					const name = prop.name || 'unnamed';
					output += `  ${idx + 1}. ${name}: ${type}`;
					if (prop.description) {
						output += ` - ${prop.description}`;
					}
					output += '\n';
				});
				if (classInfo.properties.length > 15) {
					output += `  ... and ${classInfo.properties.length - 15} more properties\n`;
				}
			}

			// Add methods if available
			if (classInfo.methods && classInfo.methods.length > 0) {
				output += `\nMethods (${classInfo.methods.length}):\n`;
				classInfo.methods.slice(0, 15).forEach((method: any, idx: number) => {
					const name = method.name || 'unnamed';
					const returnType = method.return_type || 'void';
					output += `  ${idx + 1}. ${name}(): ${returnType}`;
					if (method.description) {
						output += ` - ${method.description}`;
					}
					output += '\n';
				});
				if (classInfo.methods.length > 15) {
					output += `  ... and ${classInfo.methods.length - 15} more methods\n`;
				}
			}

			// Add signals if available
			if (classInfo.signals && classInfo.signals.length > 0) {
				output += `\nSignals (${classInfo.signals.length}):\n`;
				classInfo.signals.slice(0, 10).forEach((signal: any, idx: number) => {
					const name = signal.name || 'unnamed';
					output += `  ${idx + 1}. ${name}`;
					if (signal.description) {
						output += ` - ${signal.description}`;
					}
					output += '\n';
				});
				if (classInfo.signals.length > 10) {
					output += `  ... and ${classInfo.signals.length - 10} more signals\n`;
				}
			}

			return {
				content: [
					{
						type: 'text',
						text: output.trim(),
					},
				],
			};
		} catch (error: any) {
			let errorMessage = error?.message || 'Unknown error';
			const solutions = [
				'Ensure the Godot editor is running with the project open',
				'Verify that the LSP server is running on port 6010',
			];

			if (errorMessage.includes('ECONNREFUSED')) {
				errorMessage = 'Could not connect to Godot LSP server. Is the Godot editor running?';
			} else if (errorMessage.includes('timeout')) {
				errorMessage = 'Connection to LSP server timed out';
				solutions.push('The Godot editor may be busy or unresponsive');
			}

			return createErrorResponse(
				`Failed to get Godot class description: ${errorMessage}`,
				solutions
			);
		}
	}
}
