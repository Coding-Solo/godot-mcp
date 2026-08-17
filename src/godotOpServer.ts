import { spawn, ChildProcess } from 'node:child_process';
import net from 'node:net';

/**
 * Manages a warm ("resident") Godot process per project, so a run of authoring ops costs
 * ONE Godot boot instead of one-per-op. Each resident runs godot_operations.gd in `__serve`
 * mode (a TCP request/reply loop). This class:
 *   - starts a resident on first op for a project, reads its port, connects,
 *   - SERIALIZES ops per project (one request in flight — respects Godot's concurrency limits),
 *   - correlates replies by id, times out, and
 *   - on any crash/close, fails the in-flight ops and drops the resident so the next call
 *     transparently restarts it. Callers fall back to spawn-per-op on failure, so the resident
 *     is always an optimization, never a hard dependency.
 * Note: the resident acks mutating ops (which persist their own .tscn). Ops that RETURN data
 * (e.g. get_scene_tree) should NOT be routed here — keep them spawn-per-op.
 */
export interface OpResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  /** recent resident stdout/stderr, for logging + fallback diagnostics */
  stdout: string;
}

interface Pending {
  resolve: (msg: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Resident {
  proc: ChildProcess;
  socket: net.Socket | null;
  ready: Promise<void>;
  port: number | null;
  buf: string;
  pending: Map<number, Pending>;
  nextId: number;
  tail: Promise<unknown>;
  idleTimer: ReturnType<typeof setTimeout> | null;
  dead: boolean;
  stdout: string[];
}

export class GodotOpServer {
  private residents = new Map<string, Resident>();

  constructor(
    private readonly getGodotPath: () => string | null,
    private readonly scriptPath: string,
    private readonly log: (m: string) => void,
    private readonly idleMs = 90_000,
    private readonly callTimeoutMs = 180_000,
    private readonly readyTimeoutMs = 30_000,
  ) {}

  /** Run one op on the project's resident (starting/serializing/restarting as needed). */
  async call(projectPath: string, op: string, params: unknown): Promise<OpResult> {
    const r = await this.ensure(projectPath);
    const run = () => this.send(r, op, params);
    const next = r.tail.then(run, run);
    r.tail = next.catch(() => {});
    return next as Promise<OpResult>;
  }

  private async ensure(projectPath: string): Promise<Resident> {
    const existing = this.residents.get(projectPath);
    if (existing && !existing.dead) {
      await existing.ready.catch(() => {});
      if (!existing.dead) return existing;
    }
    const r = this.startResident(projectPath);
    this.residents.set(projectPath, r);
    await r.ready;
    return r;
  }

  private startResident(projectPath: string): Resident {
    const godot = this.getGodotPath();
    if (!godot) throw new Error('no Godot path available for resident');
    const proc = spawn(
      godot,
      ['--headless', '--path', projectPath, '--script', this.scriptPath, '__serve', '{}'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const r: Resident = {
      proc, socket: null, port: null, buf: '', pending: new Map(), nextId: 1,
      tail: Promise.resolve(), idleTimer: null, dead: false, stdout: [],
      ready: undefined as unknown as Promise<void>,
    };
    let resolveReady!: () => void;
    let rejectReady!: (e: unknown) => void;
    r.ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });
    const readyTimer = setTimeout(() => {
      rejectReady(new Error('resident did not become ready in time'));
      this.markDead(projectPath, r, 'ready timeout');
    }, this.readyTimeoutMs);

    let outbuf = '';
    const pushLog = (line: string) => {
      if (!line.trim()) return;
      r.stdout.push(line);
      if (r.stdout.length > 200) r.stdout.splice(0, r.stdout.length - 200);
    };

    proc.stdout!.on('data', (d: Buffer) => {
      outbuf += d.toString();
      if (r.port == null) {
        const mp = outbuf.match(/LEON_OP_SERVER_PORT (\d+)/);
        if (mp) r.port = Number(mp[1]);
      }
      // Connect as soon as we know the port — the resident prints its READY marker only
      // AFTER accepting our connection, so waiting for READY before connecting deadlocks.
      if (r.port != null && !r.socket) {
        this.connect(projectPath, r, resolveReady, readyTimer);
      }
      const lines = outbuf.split('\n');
      outbuf = lines.pop() ?? '';
      for (const l of lines) pushLog(l);
    });
    proc.stderr!.on('data', (d: Buffer) => {
      for (const l of d.toString().split('\n')) pushLog(l.trim() ? '[gd] ' + l : '');
    });
    proc.on('exit', (code) => { clearTimeout(readyTimer); this.markDead(projectPath, r, `process exited (${code})`); });
    proc.on('error', (e) => { clearTimeout(readyTimer); rejectReady(e); this.markDead(projectPath, r, String(e)); });
    return r;
  }

  private connect(projectPath: string, r: Resident, resolveReady: () => void, readyTimer: ReturnType<typeof setTimeout>) {
    const sock = net.connect(r.port!, '127.0.0.1');
    r.socket = sock;
    sock.setNoDelay(true);
    sock.on('connect', () => { clearTimeout(readyTimer); resolveReady(); });
    sock.on('data', (buf: Buffer) => {
      r.buf += buf.toString();
      let i: number;
      while ((i = r.buf.indexOf('\n')) >= 0) {
        const line = r.buf.slice(0, i);
        r.buf = r.buf.slice(i + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const pend = r.pending.get(msg.id);
          if (pend) { clearTimeout(pend.timer); r.pending.delete(msg.id); pend.resolve(msg); }
        } catch { /* ignore malformed line */ }
      }
    });
    sock.on('error', () => { /* close handler does the cleanup */ });
    sock.on('close', () => this.markDead(projectPath, r, 'socket closed'));
  }

  // Parity with the spawn path, which flags an op as failed when Godot printed one of these
  // to stderr (a handler that couldn't find a node / resource logs but doesn't crash).
  private static readonly ERR_MARKERS = /Failed to|not found|does not exist|has no signal/;

  private send(r: Resident, op: string, params: unknown): Promise<OpResult> {
    return new Promise<OpResult>((resolve) => {
      const tail = () => r.stdout.slice(-25).join('\n');
      if (r.dead || !r.socket) { resolve({ ok: false, error: 'resident not available', stdout: tail() }); return; }
      const id = r.nextId++;
      // Remember where this op's output starts so we can scan only ITS lines for errors
      // (ops are serialized, so nothing else writes in between).
      const mark = r.stdout.length;
      const timer = setTimeout(() => {
        r.pending.delete(id);
        resolve({ ok: false, error: 'op timed out', stdout: tail() });
      }, this.callTimeoutMs);
      r.pending.set(id, {
        timer,
        resolve: (msg: any) => {
          // Let any trailing stderr land (stdout and the TCP reply are separate channels),
          // then apply the same error detection the spawn path uses.
          setTimeout(() => {
            const windowOut = r.stdout.slice(mark).join('\n');
            if (msg.ok && GodotOpServer.ERR_MARKERS.test(windowOut)) {
              resolve({ ok: false, error: windowOut.slice(-400), stdout: tail() });
            } else {
              resolve({ ok: !!msg.ok, result: msg.result, error: msg.error, stdout: tail() });
            }
          }, 25);
        },
      });
      this.resetIdle(r);
      try {
        r.socket.write(JSON.stringify({ id, op, params }) + '\n');
      } catch (e) {
        clearTimeout(timer);
        r.pending.delete(id);
        resolve({ ok: false, error: String(e), stdout: tail() });
      }
    });
  }

  private resetIdle(r: Resident) {
    if (r.idleTimer) clearTimeout(r.idleTimer);
    r.idleTimer = setTimeout(() => {
      if (r.socket && !r.dead) {
        try { r.socket.write(JSON.stringify({ id: -1, op: '__shutdown', params: {} }) + '\n'); } catch { /* it'll die on its own */ }
      }
    }, this.idleMs);
  }

  private markDead(projectPath: string, r: Resident, why: string) {
    if (r.dead) return;
    r.dead = true;
    if (r.idleTimer) clearTimeout(r.idleTimer);
    for (const [, p] of r.pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'resident died: ' + why }); }
    r.pending.clear();
    try { r.socket?.destroy(); } catch { /* noop */ }
    try { r.proc.kill(); } catch { /* noop */ }
    if (this.residents.get(projectPath) === r) this.residents.delete(projectPath);
    this.log(`[op-server] resident for ${projectPath} down: ${why}`);
  }

  kill(projectPath: string) {
    const r = this.residents.get(projectPath);
    if (r) this.markDead(projectPath, r, 'killed');
  }

  killAll() {
    for (const k of [...this.residents.keys()]) this.kill(k);
  }
}
