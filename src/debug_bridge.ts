/**
 * Client for the in-game debug bridge (scripts/debug_remote.gd).
 *
 * The bridge speaks newline-delimited JSON over a localhost TCP socket and is
 * only active in debug builds. The connection is kept open for the lifetime of
 * this MCP server: the bridge releases every held input action when its client
 * disconnects, so a connect-per-command client could never hold the throttle
 * down between two tool calls.
 */

import net from 'net';

export const DEFAULT_BRIDGE_PORT = 8765;
const DEFAULT_TIMEOUT_MS = 15000;

export interface BridgeReply {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

interface PendingRequest {
  resolve: (reply: BridgeReply) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class BridgeError extends Error {
  constructor(message: string, public readonly hints: string[] = []) {
    super(message);
    this.name = 'BridgeError';
  }
}

export class DebugBridge {
  private socket: net.Socket | null = null;
  private connecting: Promise<net.Socket> | null = null;
  private abortConnect: ((error: Error) => void) | null = null;
  private closed = false;
  private buffer = '';
  private pending = new Map<string, PendingRequest>();
  private nextId = 1;

  constructor(
    private readonly host: string = '127.0.0.1',
    public readonly port: number = DEFAULT_BRIDGE_PORT,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  /**
   * Send one command and wait for its reply. Reconnects transparently if the
   * game was restarted since the last call.
   */
  async request(payload: Record<string, unknown>, timeoutMs?: number): Promise<BridgeReply> {
    const socket = await this.connect();
    const id = `mcp-${this.nextId++}`;

    return new Promise<BridgeReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new BridgeError(`The game did not answer '${payload.cmd}' within ${timeoutMs ?? this.timeoutMs}ms`, [
            'Check whether the game window is frozen or was closed',
            'Use get_debug_output to inspect the running project',
          ])
        );
      }, timeoutMs ?? this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      socket.write(`${JSON.stringify({ ...payload, id })}\n`, (error) => {
        if (error) {
          this.settle(id, undefined, new BridgeError(`Failed to send '${payload.cmd}': ${error.message}`));
        }
      });
    });
  }

  /** Send a command and fail loudly when the game reports an error. */
  async command(payload: Record<string, unknown>, timeoutMs?: number): Promise<BridgeReply> {
    const reply = await this.request(payload, timeoutMs);
    if (!reply.ok) {
      throw new BridgeError(reply.error ? String(reply.error) : `The game rejected '${payload.cmd}'`);
    }
    return reply;
  }

  close(): void {
    this.closed = true;
    this.teardown(new BridgeError('The debug bridge client was closed'));
  }

  private async connect(): Promise<net.Socket> {
    if (this.closed) {
      throw new BridgeError('The debug bridge client was closed');
    }
    if (this.socket && !this.socket.destroyed) {
      return this.socket;
    }
    if (this.connecting) {
      return this.connecting;
    }

    const unreachable = (detail: string) =>
      new BridgeError(`Cannot reach the game's debug bridge at ${this.host}:${this.port} (${detail})`, [
        'Start the project with run_project first',
        'Ensure scripts/debug_remote.gd is registered as an autoload in project.godot',
        'The bridge only listens in debug builds, and not when GODOT_REMOTE_INPUT=0',
      ]);

    const attempt = new Promise<net.Socket>((resolve, reject) => {
      const socket = net.connect({ host: this.host, port: this.port });
      socket.setEncoding('utf8');
      socket.setNoDelay(true);

      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      // Lets close() abandon an attempt that is still in flight.
      this.abortConnect = fail;

      const onConnectError = (error: NodeJS.ErrnoException) => fail(unreachable(error.code ?? error.message));
      // The per-request timeout only starts once the socket is up, so
      // without this a host that neither accepts nor refuses the connection
      // (a firewall drop) would hang the tool call indefinitely.
      const onConnectTimeout = () => fail(unreachable(`no response within ${this.timeoutMs}ms`));

      socket.setTimeout(this.timeoutMs, onConnectTimeout);
      socket.once('error', onConnectError);
      socket.once('connect', () => {
        socket.setTimeout(0);
        socket.off('error', onConnectError);
        socket.off('timeout', onConnectTimeout);
        this.abortConnect = null;
        if (this.closed) {
          socket.destroy();
          reject(new BridgeError('The debug bridge client was closed'));
          return;
        }
        socket.on('error', (error) => this.teardown(new BridgeError(`Debug bridge error: ${error.message}`)));
        socket.on('close', () => this.teardown(new BridgeError('The game closed the debug bridge connection')));
        socket.on('data', (chunk: string) => this.onData(chunk));
        this.socket = socket;
        this.buffer = '';
        resolve(socket);
      });
    });

    this.connecting = attempt;
    try {
      return await attempt;
    } finally {
      this.connecting = null;
      this.abortConnect = null;
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let cut: number;
    while ((cut = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut + 1);
      if (!line) continue;

      let reply: BridgeReply;
      try {
        reply = JSON.parse(line) as BridgeReply;
      } catch {
        continue;
      }
      const id = typeof reply.id === 'string' ? reply.id : undefined;
      if (id) {
        this.settle(id, reply);
      }
    }
  }

  private settle(id: string, reply?: BridgeReply, error?: Error): void {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    clearTimeout(request.timer);
    if (error) {
      request.reject(error);
    } else {
      request.resolve(reply as BridgeReply);
    }
  }

  private teardown(error: Error): void {
    const socket = this.socket;
    this.socket = null;
    this.buffer = '';
    if (socket) {
      socket.removeAllListeners();
      // destroy() can still emit 'error'; with every listener gone that
      // would be an unhandled 'error' event, taking the MCP server down.
      socket.on('error', () => {});
      socket.destroy();
    }
    // An attempt still in flight has to go too, or close() gets undone by a
    // socket that finishes connecting afterwards and keeps the process alive.
    const abortConnect = this.abortConnect;
    this.abortConnect = null;
    if (abortConnect) {
      abortConnect(error);
    }
    for (const [id] of this.pending) {
      this.settle(id, undefined, error);
    }
  }
}
