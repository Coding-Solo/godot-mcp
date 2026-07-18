import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repositoryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(repositoryPath, 'tests', 'fixtures', 'run-scene-project');
const godotPath = process.env.GODOT_PATH;
const externalProjectPath = process.env.GODOT_TEST_PROJECT;
const persistentScreenshotPath = process.env.GODOT_SCREENSHOT_OUTPUT;
const skipReason = !godotPath || !existsSync(godotPath)
  ? 'Set GODOT_PATH to a Godot executable to run the integration test'
  : false;

function getText(result) {
  const textContent = result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text);
  assert.ok(textContent.length > 0, 'Expected an MCP text response');
  return textContent.join('\n');
}

function createClient() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repositoryPath, 'build', 'index.js')],
    env: { ...process.env, GODOT_PATH: godotPath },
  });
  const client = new Client(
    { name: 'capture-game-screenshot-integration-test', version: '1.0.0' },
    { capabilities: {} }
  );
  return { client, transport };
}

function assertPng(filePath) {
  const data = readFileSync(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(data.subarray(0, 8).equals(signature), true);
  return data;
}

test('capture_game_screenshot validates input and captures a rendered fixture', {
  skip: skipReason,
  timeout: 120000,
}, async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'godot-mcp-screenshot-fixture-'));
  const outputPath = path.join(temporaryDirectory, 'nested', 'fixture.png');
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const listedTools = await client.listTools();
    const screenshotTool = listedTools.tools.find(
      (tool) => tool.name === 'capture_game_screenshot'
    );
    assert.ok(screenshotTool, 'capture_game_screenshot should be exposed by tools/list');
    assert.deepEqual(
      screenshotTool.inputSchema.required,
      ['projectPath', 'scenePath', 'outputPath']
    );
    assert.equal(screenshotTool.inputSchema.properties.delayFrames.default, undefined);

    const invalidDelay = await client.callTool({
      name: 'capture_game_screenshot',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'res://tests/screenshot_test.tscn',
        outputPath,
        delayFrames: 3601,
      },
    });
    assert.match(getText(invalidDelay), /delayFrames must be an integer/);

    const invalidExtension = await client.callTool({
      name: 'capture_game_screenshot',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'res://tests/screenshot_test.tscn',
        outputPath: path.join(temporaryDirectory, 'fixture.jpg'),
      },
    });
    assert.match(getText(invalidExtension), /outputPath must end in \.png/);

    const missingScene = await client.callTool({
      name: 'capture_game_screenshot',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'res://tests/missing.tscn',
        outputPath,
      },
    });
    assert.match(getText(missingScene), /Scene does not exist/);

    const result = await client.callTool({
      name: 'capture_game_screenshot',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'tests/screenshot_test.tscn',
        outputPath,
        delayFrames: 2,
      },
    });
    const parsedResult = JSON.parse(getText(result));
    assert.equal(parsedResult.success, true);
    assert.equal(parsedResult.width, 320);
    assert.equal(parsedResult.height, 180);
    assert.equal(parsedResult.delayFrames, 2);
    assert.equal(existsSync(outputPath), true);
    assert.equal(assertPng(outputPath).length, parsedResult.bytes);
  } finally {
    await client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('capture_game_screenshot captures an external Godot scene', {
  skip: skipReason || !externalProjectPath || !existsSync(externalProjectPath)
    ? 'Set GODOT_PATH and GODOT_TEST_PROJECT to run the external project test'
    : false,
  timeout: 120000,
}, async () => {
  const temporaryDirectory = persistentScreenshotPath
    ? null
    : mkdtempSync(path.join(tmpdir(), 'godot-mcp-screenshot-external-'));
  const outputPath = persistentScreenshotPath
    ? path.resolve(persistentScreenshotPath)
    : path.join(temporaryDirectory, 'pixel-smoke.png');
  const { client, transport } = createClient();

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: 'capture_game_screenshot',
      arguments: {
        projectPath: externalProjectPath,
        scenePath: 'res://tests/smoke_test.tscn',
        outputPath,
      },
    });
    const parsedResult = JSON.parse(getText(result));
    assert.equal(parsedResult.success, true);
    assert.ok(parsedResult.width > 0);
    assert.ok(parsedResult.height > 0);
    assert.equal(parsedResult.delayFrames, 30);
    assert.equal(existsSync(outputPath), true);
    assert.equal(assertPng(outputPath).length, parsedResult.bytes);
  } finally {
    await client.close();
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
});
