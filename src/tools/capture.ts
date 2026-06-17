import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface CaptureConfig {
  godotPath: string;
  operationsScriptPath: string;
}

function makeTempPath(): string {
  return join(tmpdir(), `godot-mcp-capture-${Date.now()}.png`);
}

function cleanupTemp(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Ignore cleanup errors.
  }
}

function captureErrorResponse(message: string, solutions: string[]): object {
  return {
    content: [
      { type: 'text', text: message },
      { type: 'text', text: 'Possible solutions:\n- ' + solutions.join('\n- ') },
    ],
    isError: true,
  };
}

/**
 * Run a scene (or the project main scene) and capture one rendered frame as a PNG.
 * Godot is launched WITHOUT --headless so a real rendering context is used.
 */
export async function handleCaptureScreenshot(
  args: Record<string, unknown>,
  config: CaptureConfig
): Promise<object> {
  const projectPath = args.projectPath as string;
  const scenePath = (args.scenePath ?? '') as string;
  const waitFrames = (args.waitFrames ?? 10) as number;
  const timeoutMs = (args.timeoutMs ?? 15000) as number;

  const outputPath = makeTempPath();

  // Pass snake_case keys directly to the GDScript operation.
  const params: Record<string, unknown> = {
    output_path: outputPath,
    scene_path: scenePath,
    wait_frames: waitFrames,
  };

  // NOTE: No --headless. Capture requires a real rendering context.
  const godotArgs = [
    '--path', projectPath,
    '--script', config.operationsScriptPath,
    'capture_screenshot',
    JSON.stringify(params),
  ];

  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    await execFileAsync(config.godotPath, godotArgs, {
      signal: controller.signal as AbortSignal,
    });
  } catch (err: unknown) {
    cleanupTemp(outputPath);
    if (timedOut) {
      return {
        content: [{
          type: 'text',
          text: `Capture timed out after ${timeoutMs}ms. The scene may be loading slowly or Godot may have crashed.`,
        }],
        isError: true,
      };
    }
    // Non-zero exit: Godot printed an error via [ERROR]. Check for PNG anyway.
    if (!existsSync(outputPath)) {
      const msg = err instanceof Error ? err.message : String(err);
      return captureErrorResponse(`Capture failed: ${msg}`, [
        'Ensure Godot is installed and GODOT_PATH is set correctly',
        'On headless Linux, wrap Godot in xvfb-run for a virtual display',
        'Verify projectPath contains a project.godot file',
        'Check that scenePath (if provided) exists as a res:// path in the project',
      ]);
    }
  } finally {
    clearTimeout(timer);
  }

  if (!existsSync(outputPath)) {
    return captureErrorResponse(
      'Godot exited without writing a screenshot. The scene may have failed to load or no display is available.',
      [
        'Run on a machine with a display (not in --headless mode)',
        'On headless Linux, use xvfb-run (see README)',
        'Verify the scene loads correctly with run_project first',
      ]
    );
  }

  const imageData = readFileSync(outputPath).toString('base64');
  cleanupTemp(outputPath);

  const sceneLabel = scenePath ? scenePath : 'main scene';
  return {
    content: [
      {
        type: 'text',
        text: `Screenshot captured from ${sceneLabel} after ${waitFrames} frames.`,
      },
      { type: 'image', data: imageData, mimeType: 'image/png' },
    ],
  };
}

/**
 * Load a specific .tscn file, instance it in the viewport, and capture one frame.
 * Godot is launched WITHOUT --headless so a real rendering context is used.
 */
export async function handleCaptureSceneScreenshot(
  args: Record<string, unknown>,
  config: CaptureConfig
): Promise<object> {
  const projectPath = args.projectPath as string;
  const scenePath = args.scenePath as string;
  const timeoutMs = (args.timeoutMs ?? 15000) as number;

  const outputPath = makeTempPath();

  const params: Record<string, unknown> = {
    output_path: outputPath,
    scene_path: scenePath,
  };

  // NOTE: No --headless. Capture requires a real rendering context.
  const godotArgs = [
    '--path', projectPath,
    '--script', config.operationsScriptPath,
    'capture_scene_screenshot',
    JSON.stringify(params),
  ];

  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    await execFileAsync(config.godotPath, godotArgs, {
      signal: controller.signal as AbortSignal,
    });
  } catch (err: unknown) {
    cleanupTemp(outputPath);
    if (timedOut) {
      return {
        content: [{
          type: 'text',
          text: `Scene screenshot timed out after ${timeoutMs}ms.`,
        }],
        isError: true,
      };
    }
    if (!existsSync(outputPath)) {
      const msg = err instanceof Error ? err.message : String(err);
      return captureErrorResponse(`Scene capture failed: ${msg}`, [
        'Verify scenePath is a valid res:// path (e.g. res://scenes/main.tscn)',
        'Ensure a display is available (use xvfb-run on headless Linux)',
        'Confirm projectPath contains a project.godot file',
      ]);
    }
  } finally {
    clearTimeout(timer);
  }

  if (!existsSync(outputPath)) {
    return captureErrorResponse(
      'Godot exited without writing a scene screenshot. The scene may have failed to load or no display is available.',
      [
        'Run on a machine with a display (not in --headless mode)',
        'On headless Linux, use xvfb-run (see README)',
        'Check that scenePath exists in the project: ' + scenePath,
      ]
    );
  }

  const imageData = readFileSync(outputPath).toString('base64');
  cleanupTemp(outputPath);

  return {
    content: [
      {
        type: 'text',
        text: `Scene screenshot captured: ${scenePath}`,
      },
      { type: 'image', data: imageData, mimeType: 'image/png' },
    ],
  };
}
