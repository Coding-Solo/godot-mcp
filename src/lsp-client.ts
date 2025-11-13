/**
 * Godot LSP Client
 *
 * This module provides a client for communicating with the Godot Language Server Protocol (LSP).
 * The Godot LSP server runs on port 6005 when the Godot editor is running.
 */

import { Socket } from 'net';

/**
 * LSP Position (line and character)
 */
export interface LSPPosition {
  line: number;
  character: number;
}

/**
 * LSP Range (start and end positions)
 */
export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

/**
 * LSP Text Document Identifier
 */
export interface LSPTextDocumentIdentifier {
  uri: string;
}

/**
 * LSP Text Document Position Params
 */
export interface LSPTextDocumentPositionParams {
  textDocument: LSPTextDocumentIdentifier;
  position: LSPPosition;
}

/**
 * LSP Hover Response
 */
export interface LSPHoverResult {
  contents: string | { language: string; value: string } | Array<string | { language: string; value: string }>;
  range?: LSPRange;
}

/**
 * LSP Diagnostic Severity
 */
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/**
 * LSP Diagnostic
 */
export interface LSPDiagnostic {
  range: LSPRange;
  severity?: DiagnosticSeverity;
  code?: string | number;
  source?: string;
  message: string;
  relatedInformation?: Array<{
    location: {
      uri: string;
      range: LSPRange;
    };
    message: string;
  }>;
}

/**
 * LSP Publish Diagnostics Params
 */
export interface LSPPublishDiagnosticsParams {
  uri: string;
  diagnostics: LSPDiagnostic[];
}

/**
 * LSP Location
 */
export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

/**
 * LSP Reference Context
 */
export interface LSPReferenceContext {
  includeDeclaration: boolean;
}

/**
 * LSP Reference Params
 */
export interface LSPReferenceParams {
  textDocument: LSPTextDocumentIdentifier;
  position: LSPPosition;
  context: LSPReferenceContext;
}

/**
 * LSP JSON-RPC Request
 */
interface LSPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any;
}

/**
 * LSP JSON-RPC Response
 */
interface LSPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// The fileUriToPath function begins below
/**
 * Parse a file URI to a local file path
 */
function fileUriToPath(fileUri: string): string {
  let path = fileUri;

  // Handle res:// protocol
  if (path.startsWith('res://')) {
    // Get instance project root (should be initialized by now)
    const projectRoot = GodotLSPClient.instance?.projectRoot;
    if (projectRoot) {
      const relativePath = path.substring(6); // Remove 'res://'
      return projectRoot.replace(/\\/g, '/') + '/' + relativePath;
    }
  }

  // Remove file:// prefix
  if (path.startsWith('file://')) {
    path = path.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
  }

  // Decode URL encoding
  path = path.replace(/%3A/g, ':');
  path = path.replace(/%20/g, ' ');

  // Normalize slashes based on platform
  if (process.platform === 'win32') {
    // Convert to backslashes for Windows
    if (path.match(/^[a-zA-Z]:/)) {
      path = path.replace(/\//g, '\\');
    }
  }

  return path;
}

/**
 * Godot LSP Client
 */
export class GodotLSPClient {
  // Static instance for singleton access
  private static _instance: GodotLSPClient | null = null;

  private socket: Socket | null = null;
  private connected: boolean = false;
  private initialized: boolean = false;
  private requestId: number = 1;
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }> = new Map();
  private buffer: string = '';
  private host: string;
  private port: number;
  private diagnosticsMap: Map<string, LSPDiagnostic[]> = new Map();
  private lastOpenedDocument: string | null = null;
  private nativeClasses: any[] = [];
  public projectRoot: string = '';

  public static get instance(): GodotLSPClient | null {
    return GodotLSPClient._instance;
  }

  /**
   * Normalize a file path for use with Godot's LSP server
   *
   * If the path is within the project scope, it will be converted to res:// protocol
   * Otherwise, it will be normalized to a proper file:// URI
   */
  private normalizeToFileUri(path: string): string {
    // First normalize slashes and remove any URI prefix
    if (path.startsWith('file://')) {
      path = path.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
      path = path.replace(/%3A/g, ':');
    }

    // Normalize path separators to forward slashes
    path = path.replace(/\\/g, '/');

    // Remove any duplicate slashes
    path = path.replace(/\/+/g, '/');

    // Check if path is inside the project root
    const normalizedProjectRoot = this.projectRoot.replace(/\\/g, '/');

    if (path.startsWith(normalizedProjectRoot)) {
      // Convert to res:// protocol for files within project
      const relativePath = path.substring(normalizedProjectRoot.length).replace(/^\/+/, '');
      return `res://${relativePath}`;
    } else {
      // Use file:// protocol for files outside project
      // Windows absolute path (C:/...)
      if (path.match(/^[a-zA-Z]:/)) {
        return 'file:///' + path;
      }
      // Unix absolute path (/...)
      else if (path.startsWith('/')) {
        return 'file://' + path;
      }
      // Relative path - should be relative to project root
      else {
        return 'res://' + path;
      }
    }
  }

  constructor(host: string = 'localhost', port: number = 6005) {
    this.host = host;
    this.port = port;
    // Set the singleton instance
    GodotLSPClient._instance = this;
  }

  /**
   * Connect to the LSP server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new Socket();

        // Set up event handlers
        this.socket.on('data', (data) => this.handleData(data));
        this.socket.on('error', (error) => {
          console.error('[LSP] Socket error:', error);
          reject(error);
        });
        this.socket.on('close', () => {
          console.log('[LSP] Connection closed');
          this.connected = false;
          this.initialized = false;
        });

        // Connect to the server
        this.socket.connect(this.port, this.host, () => {
          console.log(`[LSP] Connected to Godot LSP server at ${this.host}:${this.port}`);
          this.connected = true;
          resolve();
        });

        // Set a timeout for connection
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming data from the LSP server
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete messages
    while (true) {
      // Look for Content-Length header
      const headerMatch = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) {
        break;
      }

      const contentLength = parseInt(headerMatch[1], 10);
      const headerLength = headerMatch[0].length;
      const totalLength = headerLength + contentLength;

      // Check if we have the complete message
      if (this.buffer.length < totalLength) {
        break;
      }

      // Extract the message
      const messageContent = this.buffer.substring(headerLength, totalLength);
      this.buffer = this.buffer.substring(totalLength);

      // Parse and handle the message
      try {
        const message = JSON.parse(messageContent);
        this.handleMessage(message);
      } catch (error) {
        console.error('[LSP] Failed to parse message:', error);
      }
    }
  }

  /**
   * Handle a parsed LSP message
   */
  private handleMessage(message: LSPResponse | any): void {
    // Handle response messages
    if ('id' in message && message.id !== null) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    }
    // Handle notification messages (no id)
    else if ('method' in message) {
      // Handle textDocument/publishDiagnostics notifications
      if (message.method === 'textDocument/publishDiagnostics') {
        this.handleDiagnosticsNotification(message.params as LSPPublishDiagnosticsParams);
      }
      // Handle gdscript/capabilities notifications (native classes)
      else if (message.method === 'gdscript/capabilities') {
        this.handleCapabilitiesNotification(message.params);
      } else {
        console.log('[LSP] Notification:', message.method);
      }
    }
  }

  /**
   * Handle capabilities notification from the server (native classes)
   */
  private handleCapabilitiesNotification(params: any): void {
    if (params?.native_classes) {
      this.nativeClasses = params.native_classes;
      console.log(`[LSP] Received ${this.nativeClasses.length} native Godot classes`);
    }
  }

  /**
   * Handle diagnostics notification from the server
   */
  private handleDiagnosticsNotification(params: LSPPublishDiagnosticsParams): void {
    let uri = params.uri;

    // Workaround: Godot LSP server sometimes sends diagnostics with URI "file:///"
    // If this happens and we have a recently opened document, use that URI instead
    if (uri === 'file:///' && this.lastOpenedDocument) {
      console.log(`[LSP] Fixing malformed URI from "file:///" to "${this.lastOpenedDocument}"`);
      uri = this.lastOpenedDocument;
    }

    // Store diagnostics for this file
    this.diagnosticsMap.set(uri, params.diagnostics);
    console.log(`[LSP] Received ${params.diagnostics.length} diagnostics for URI: ${uri}`);

    // Debug: show diagnostic details
    if (params.diagnostics.length > 0) {
      params.diagnostics.forEach((d, idx) => {
        console.log(`  ${idx + 1}. Line ${d.range.start.line + 1}: ${d.message}`);
      });
    }
  }

  /**
   * Send a JSON-RPC request to the LSP server
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to LSP server');
    }

    const id = this.requestId++;
    const request: LSPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    // Serialize the request
    const messageContent = JSON.stringify(request);
    const messageLength = Buffer.byteLength(messageContent, 'utf8');
    const header = `Content-Length: ${messageLength}\r\n\r\n`;
    const fullMessage = header + messageContent;

    // Send the request
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.socket!.write(fullMessage, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Set a timeout for the request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Initialize the LSP connection
   */
  async initialize(rootPath?: string): Promise<any> {
    this.projectRoot = rootPath || process.cwd();
    const params = {
      processId: process.pid,
      rootPath: this.projectRoot,
      rootUri: `file:///${this.projectRoot.replace(/\\/g, '/')}`,
      capabilities: {
        textDocument: {
          hover: {
            contentFormat: ['plaintext', 'markdown'],
          },
        },
      },
    };

    const result = await this.sendRequest('initialize', params);
    this.initialized = true;

    // Send initialized notification
    await this.sendNotification('initialized', {});

    console.log('[LSP] Initialized with capabilities:', result.capabilities);
    return result;
  }

  /**
   * Send a notification (no response expected)
   */
  private async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to LSP server');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const messageContent = JSON.stringify(notification);
    const messageLength = Buffer.byteLength(messageContent, 'utf8');
    const header = `Content-Length: ${messageLength}\r\n\r\n`;
    const fullMessage = header + messageContent;

    return new Promise((resolve, reject) => {
      this.socket!.write(fullMessage, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Open a document for analysis (triggers diagnostics)
   */
  async openDocument(fileUri: string, languageId: string = 'gdscript', fileContent?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized. Call initialize() first.');
    }

    // Normalize the file URI
    const normalizedUri = this.normalizeToFileUri(fileUri);

    // If no content provided, try to read the file
    if (!fileContent) {
      try {
        const fs = await import('fs');
        // Convert URI to local file path
        const filePath = fileUriToPath(normalizedUri);
        fileContent = fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        throw new Error(`Failed to read file for opening: ${error}`);
      }
    }

    const params = {
      textDocument: {
        uri: normalizedUri,
        languageId,
        version: 1,
        text: fileContent,
      },
    };

    await this.sendNotification('textDocument/didOpen', params);
    this.lastOpenedDocument = normalizedUri;
    console.log(`[LSP] Opened document: ${normalizedUri}`);
  }

  /**
   * Close a document
   */
  async closeDocument(fileUri: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized. Call initialize() first.');
    }

    // Normalize the file URI
    const normalizedUri = this.normalizeToFileUri(fileUri);

    const params = {
      textDocument: {
        uri: normalizedUri,
      },
    };

    await this.sendNotification('textDocument/didClose', params);
    if (this.lastOpenedDocument === normalizedUri) {
      this.lastOpenedDocument = null;
    }
    console.log(`[LSP] Closed document: ${normalizedUri}`);
  }

  /**
   * Find all references to a symbol at a specific position
   */
  async findReferences(
    fileUri: string,
    line: number,
    character: number,
    includeDeclaration: boolean = true
  ): Promise<LSPLocation[]> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized. Call initialize() first.');
    }

    // Normalize the file URI
    const normalizedUri = this.normalizeToFileUri(fileUri);

    const params: LSPReferenceParams = {
      textDocument: {
        uri: normalizedUri,
      },
      position: {
        line,
        character,
      },
      context: {
        includeDeclaration,
      },
    };

    const result = await this.sendRequest('textDocument/references', params);
    return result || [];
  }

  /**
   * Get information about a native Godot class
   */
  getNativeClass(className: string): any {
    return this.nativeClasses.find(c => c.name === className);
  }

  /**
   * Get all native Godot classes
   */
  getNativeClasses(): any[] {
    return this.nativeClasses;
  }

  /**
   * Search native classes by name (case-insensitive, supports partial match)
   */
  searchNativeClasses(query: string): any[] {
    const lowerQuery = query.toLowerCase();
    return this.nativeClasses.filter(c =>
      c.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get diagnostics for a specific file
   */
  getDiagnostics(fileUri: string): LSPDiagnostic[] {
    // Normalize the URI before lookup
    const normalizedUri = this.normalizeToFileUri(fileUri);
    return this.diagnosticsMap.get(normalizedUri) || [];
  }

  /**
   * Get all diagnostics across all files
   */
  getAllDiagnostics(): Map<string, LSPDiagnostic[]> {
    return new Map(this.diagnosticsMap);
  }

  /**
   * Clear diagnostics for a specific file
   */
  clearDiagnostics(fileUri: string): void {
    // Normalize the URI before deletion
    const normalizedUri = this.normalizeToFileUri(fileUri);
    this.diagnosticsMap.delete(normalizedUri);
  }

  /**
   * Clear all diagnostics
   */
  clearAllDiagnostics(): void {
    this.diagnosticsMap.clear();
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Disconnect from the LSP server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.initialized = false;
  }

  /**
   * Test the connection to the LSP server
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      if (!this.initialized) {
        await this.initialize();
      }

      return {
        success: true,
        message: 'Successfully connected and initialized LSP client',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
