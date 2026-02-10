/**
 * BridgeClient — WebSocket client + JSON-RPC transport for E2E TestBridge communication.
 *
 * Connects to TestBridge.gd running inside a Godot game instance via WebSocket,
 * exchanges JSON-RPC messages, and manages connection lifecycle.
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';

/**
 * Capabilities reported by TestBridge during the hello handshake.
 */
export interface BridgeCapabilities {
  protocol_version: string;
  capabilities: string[];
  unsafe_mode: boolean;
  godot_version: string;
  project_name: string;
  display_mode: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * WebSocket client that speaks JSON-RPC to TestBridge.gd.
 */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private capabilities: BridgeCapabilities | null = null;

  /**
   * Connect to a running TestBridge WebSocket server.
   * Performs the hello handshake and caches capabilities.
   */
  async connect(host: string = 'localhost', port: number = 9505, timeoutMs: number = 5000): Promise<BridgeCapabilities> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    return new Promise<BridgeCapabilities>((resolve, reject) => {
      const url = `ws://${host}:${port}`;
      let settled = false;

      const settle = (err?: Error, caps?: BridgeCapabilities) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectionTimeout);
        if (err) reject(err);
        else resolve(caps!);
      };

      const connectionTimeout = setTimeout(() => {
        if (this.ws) {
          this.ws.removeAllListeners();
          this.ws.terminate();
          this.ws = null;
        }
        settle(new Error(`Connection timeout after ${timeoutMs}ms — could not reach TestBridge at ${url}`));
      }, timeoutMs);

      this.ws = new WebSocket(url);

      this.ws.on('open', async () => {
        try {
          const caps = await this.send('hello', undefined, timeoutMs) as BridgeCapabilities;
          this.capabilities = caps;
          this.setupHandlers();
          settle(undefined, caps);
        } catch (err) {
          this.disconnect();
          settle(err instanceof Error ? err : new Error(String(err)));
        }
      });

      this.ws.on('error', (err) => {
        this.ws = null;
        settle(new Error(`WebSocket connection error: ${err.message}`));
      });

      this.ws.on('close', () => {
        this.ws = null;
        settle(new Error(`WebSocket connection closed before completing handshake`));
      });

      // Set up the message handler for the handshake phase
      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
    });
  }

  /**
   * Set up persistent event handlers after successful connection.
   */
  private setupHandlers(): void {
    if (!this.ws) return;

    // Remove the one-shot listeners from connect() and add persistent ones
    this.ws.removeAllListeners('close');
    this.ws.removeAllListeners('error');

    this.ws.on('close', () => {
      this.rejectAllPending(new Error('WebSocket connection closed'));
      this.ws = null;
      this.capabilities = null;
    });

    this.ws.on('error', (err) => {
      console.error(`[BRIDGE] WebSocket error: ${err.message}`);
      this.rejectAllPending(new Error(`WebSocket error: ${err.message}`));
      this.ws = null;
      this.capabilities = null;
    });
  }

  /**
   * Handle an incoming WebSocket message (JSON-RPC response).
   */
  private handleMessage(data: WebSocket.RawData): void {
    let parsed: any;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      console.error('[BRIDGE] Received malformed JSON, ignoring');
      return;
    }

    const id = parsed.id;
    if (id === undefined || id === null) {
      console.error('[BRIDGE] Received message without id, ignoring');
      return;
    }

    const pending = this.pendingRequests.get(String(id));
    if (!pending) {
      console.error(`[BRIDGE] Received response for unknown request id: ${id}`);
      return;
    }

    // Clear timeout and remove from pending map
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(String(id));

    if (parsed.error) {
      pending.reject(new Error(`TestBridge error [${parsed.error.code}]: ${parsed.error.message}`));
    } else {
      pending.resolve(parsed.result);
    }
  }

  /**
   * Close the WebSocket connection and reject all pending requests.
   */
  disconnect(): void {
    this.rejectAllPending(new Error('Disconnected from game'));
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.capabilities = null;
  }

  /**
   * Send a JSON-RPC request to TestBridge and await the response.
   *
   * @param method - The JSON-RPC method name
   * @param params - Optional parameters
   * @param timeoutMs - Per-request timeout (default 5000ms). For wait tools, callers
   *                    should pass params.timeout_ms + 2000 to avoid premature timeout.
   */
  send(method: string, params?: Record<string, unknown>, timeoutMs: number = 5000): Promise<unknown> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Not connected to game — call connect_to_game first'));
    }

    return new Promise((resolve, reject) => {
      const id = randomUUID();

      const timeout = setTimeout(() => {
        // Guard against race condition: if response already arrived, do nothing
        if (!this.pendingRequests.has(id)) return;
        this.pendingRequests.delete(id);
        reject(new Error(`Request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = JSON.stringify({ id, method, params: params ?? {} });
      this.ws!.send(message);
    });
  }

  /**
   * Check if the WebSocket is currently connected.
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get cached capabilities from the last hello handshake.
   */
  getCapabilities(): BridgeCapabilities | null {
    return this.capabilities;
  }

  /**
   * Reject all pending requests with the given error.
   */
  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
