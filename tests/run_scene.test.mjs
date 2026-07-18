import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repositoryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(repositoryPath, 'tests', 'fixtures', 'run-scene-project');
const godotPath = process.env.GODOT_PATH;
const skipReason = !godotPath || !existsSync(godotPath)
  ? 'Set GODOT_PATH to a Godot executable to run the integration test'
  : false;

function getText(result) {
  const textContent = result.content.find((item) => item.type === 'text');
  assert.ok(textContent, 'Expected an MCP text response');
  return textContent.text;
}

async function waitForDebugOutput(client, marker) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await client.callTool({ name: 'get_debug_output', arguments: {} });
    const text = getText(result);
    if (text.includes(marker)) {
      return text;
    }
  }

  assert.fail(`Timed out waiting for debug marker: ${marker}`);
}

test('run_scene integrates with process and debug tools', {
  skip: skipReason,
  timeout: 60000,
}, async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repositoryPath, 'build', 'index.js')],
    env: { ...process.env, GODOT_PATH: godotPath },
  });
  const client = new Client(
    { name: 'run-scene-integration-test', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    const listedTools = await client.listTools();
    const runSceneTool = listedTools.tools.find((tool) => tool.name === 'run_scene');
    assert.ok(runSceneTool, 'run_scene should be exposed by tools/list');
    assert.deepEqual(runSceneTool.inputSchema.required, ['projectPath', 'scenePath']);
    assert.equal(runSceneTool.inputSchema.properties.timeoutMs.default, undefined);

    const invalidTimeout = await client.callTool({
      name: 'run_scene',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'res://tests/smoke_test.tscn',
        timeoutMs: 2147483648,
      },
    });
    assert.match(getText(invalidTimeout), /timeoutMs must be an integer/);

    const missingScene = await client.callTool({
      name: 'run_scene',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'res://tests/missing.tscn',
      },
    });
    assert.match(getText(missingScene), /Scene does not exist/);

    const startedScene = await client.callTool({
      name: 'run_scene',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'tests/smoke_test.tscn',
      },
    });
    assert.match(getText(startedScene), /Godot scene tests\/smoke_test\.tscn started/);
    assert.match(getText(startedScene), /after 30000 ms/);
    assert.match(await waitForDebugOutput(client, 'RUN_SCENE_TEST_OK'), /RUN_SCENE_TEST_OK/);

    const replacedWithProject = await client.callTool({
      name: 'run_project',
      arguments: {
        projectPath: fixturePath,
        scene: 'res://tests/smoke_test.tscn',
      },
    });
    assert.match(getText(replacedWithProject), /Godot project started/);
    assert.match(await waitForDebugOutput(client, 'RUN_SCENE_TEST_OK'), /RUN_SCENE_TEST_OK/);

    const stoppedProject = await client.callTool({ name: 'stop_project', arguments: {} });
    assert.match(getText(stoppedProject), /Godot project stopped/);

    await client.callTool({
      name: 'run_scene',
      arguments: {
        projectPath: fixturePath,
        scenePath: 'res://tests/smoke_test.tscn',
        timeoutMs: 500,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const afterTimeout = await client.callTool({ name: 'get_debug_output', arguments: {} });
    assert.match(getText(afterTimeout), /No active Godot process/);
  } finally {
    try {
      await client.callTool({ name: 'stop_project', arguments: {} });
    } catch {
      // The process may already be stopped or the transport may already be closed.
    }
    await client.close();
  }
});
