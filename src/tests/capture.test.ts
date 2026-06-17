/**
 * Integration tests for capture_screenshot and capture_scene_screenshot tools.
 *
 * These tests require:
 * - A Godot 4.x executable reachable via GODOT_PATH or the default system path.
 * - A real display (not --headless). On headless Linux, run under xvfb-run.
 *
 * Run with: npm test
 */

import { test, describe, before, skip } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { handleCaptureScreenshot, handleCaptureSceneScreenshot } from '../tools/capture.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fixture Godot project: tests/fixtures/capture-test-project (relative to project root).
// From build/tests/capture.test.js, go up two levels to reach the project root.
const FIXTURE_PROJECT = join(__dirname, '..', '..', 'tests', 'fixtures', 'capture-test-project');
const FIXTURE_SCENE = 'res://scenes/main.tscn';

function resolveGodotPath(): string | null {
  if (process.env.GODOT_PATH) return process.env.GODOT_PATH;
  const defaults: Record<string, string[]> = {
    darwin: [
      '/Applications/Godot.app/Contents/MacOS/Godot',
      '/Applications/Godot_v4.app/Contents/MacOS/Godot',
    ],
    win32: [
      'C:\\Program Files\\Godot\\Godot.exe',
      'C:\\Program Files (x86)\\Godot\\Godot.exe',
    ],
    linux: ['godot4', 'godot'],
  };
  const candidates = defaults[process.platform] ?? ['godot'];
  for (const p of candidates) {
    if (p.includes('\\') || p.includes('/')) {
      if (existsSync(p)) return p;
    } else {
      return p; // Rely on PATH lookup; if missing, the test fails with a clear error.
    }
  }
  return null;
}

describe('capture tools', () => {
  let godotPath: string;
  let godotAvailable = false;

  before(async () => {
    const detected = resolveGodotPath();
    if (!detected) {
      console.log('SKIP: Godot not found. Set GODOT_PATH to run capture tests.');
      return;
    }
    // Quick smoke-test: can Godot run --version?
    try {
      await execFileAsync(detected, ['--version'], { timeout: 5000 });
      godotPath = detected;
      godotAvailable = true;
    } catch {
      console.log(`SKIP: Godot at "${detected}" could not run --version. Skipping capture tests.`);
    }
  });

  test('fixture project exists', () => {
    assert.ok(
      existsSync(join(FIXTURE_PROJECT, 'project.godot')),
      `Fixture project not found at ${FIXTURE_PROJECT}`
    );
    assert.ok(
      existsSync(join(FIXTURE_PROJECT, 'scenes', 'main.tscn')),
      'Fixture scene main.tscn not found'
    );
  });

  test('capture_scene_screenshot returns image content for fixture scene', async () => {
    if (!godotAvailable) {
      skip('Godot not available');
      return;
    }

    const result = await handleCaptureSceneScreenshot(
      { projectPath: FIXTURE_PROJECT, scenePath: FIXTURE_SCENE, timeoutMs: 20000 },
      {
        godotPath,
        operationsScriptPath: join(__dirname, '..', 'scripts', 'godot_operations.gd'),
      }
    ) as Record<string, unknown>;

    assert.ok(!result.isError, `Expected success but got error: ${JSON.stringify(result)}`);

    const content = result.content as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(content), 'content must be an array');

    const imageBlock = content.find((c) => c.type === 'image');
    assert.ok(imageBlock, 'Expected an image block in content');

    const base64 = imageBlock.data as string;
    assert.ok(typeof base64 === 'string' && base64.length > 0, 'base64 data must be non-empty');
    assert.equal(imageBlock.mimeType, 'image/png', 'mimeType must be image/png');

    // Verify the PNG header bytes (89 50 4E 47) appear in the decoded data.
    const buf = Buffer.from(base64, 'base64');
    assert.equal(buf[0], 0x89, 'PNG magic byte 0 mismatch');
    assert.equal(buf[1], 0x50, 'PNG magic byte 1 mismatch (P)');
    assert.equal(buf[2], 0x4E, 'PNG magic byte 2 mismatch (N)');
    assert.equal(buf[3], 0x47, 'PNG magic byte 3 mismatch (G)');
  });

  test('capture_screenshot returns image content using main scene', async () => {
    if (!godotAvailable) {
      skip('Godot not available');
      return;
    }

    const result = await handleCaptureScreenshot(
      { projectPath: FIXTURE_PROJECT, waitFrames: 5, timeoutMs: 20000 },
      {
        godotPath,
        operationsScriptPath: join(__dirname, '..', 'scripts', 'godot_operations.gd'),
      }
    ) as Record<string, unknown>;

    assert.ok(!result.isError, `Expected success but got error: ${JSON.stringify(result)}`);

    const content = result.content as Array<Record<string, unknown>>;
    const imageBlock = content.find((c) => c.type === 'image');
    assert.ok(imageBlock, 'Expected an image block in content');

    const buf = Buffer.from(imageBlock.data as string, 'base64');
    assert.equal(buf[0], 0x89, 'Response must be a valid PNG');
  });

  test('capture_scene_screenshot returns error for a non-existent scene', async () => {
    if (!godotAvailable) {
      skip('Godot not available');
      return;
    }

    const result = await handleCaptureSceneScreenshot(
      {
        projectPath: FIXTURE_PROJECT,
        scenePath: 'res://scenes/does_not_exist.tscn',
        timeoutMs: 10000,
      },
      {
        godotPath,
        operationsScriptPath: join(__dirname, '..', 'scripts', 'godot_operations.gd'),
      }
    ) as Record<string, unknown>;

    assert.ok(result.isError === true, 'Expected isError=true for missing scene');
  });
});
