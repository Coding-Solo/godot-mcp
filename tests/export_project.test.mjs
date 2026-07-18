import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
    { name: 'export-project-integration-test', version: '1.0.0' },
    { capabilities: {} }
  );
  return { client, transport };
}

test('export_project exposes its schema and explains missing export configuration', {
  skip: skipReason,
  timeout: 60000,
}, async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'godot-mcp-export-missing-'));
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const listedTools = await client.listTools();
    const exportProjectTool = listedTools.tools.find((tool) => tool.name === 'export_project');
    assert.ok(exportProjectTool, 'export_project should be exposed by tools/list');
    assert.deepEqual(
      exportProjectTool.inputSchema.required,
      ['projectPath', 'preset', 'outputPath']
    );
    assert.equal(exportProjectTool.inputSchema.properties.debug.default, undefined);

    const invalidDebug = await client.callTool({
      name: 'export_project',
      arguments: {
        projectPath: fixturePath,
        preset: '__MISSING_PRESET__',
        outputPath: path.join(temporaryDirectory, 'invalid.pck'),
        debug: 'yes',
      },
    });
    assert.match(getText(invalidDebug), /debug must be a boolean/);

    const missingPreset = await client.callTool({
      name: 'export_project',
      arguments: {
        projectPath: fixturePath,
        preset: '__MISSING_PRESET__',
        outputPath: path.join(temporaryDirectory, 'missing.pck'),
      },
    });
    assert.match(getText(missingPreset), /No export presets are configured/);
    assert.match(getText(missingPreset), /Project > Export/);
  } finally {
    await client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('export_project creates a Web export for an external Godot project', {
  skip: skipReason || !externalProjectPath || !existsSync(externalProjectPath)
    ? 'Set GODOT_PATH and GODOT_TEST_PROJECT to run the external project test'
    : false,
  timeout: 120000,
}, async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'godot-mcp-export-web-'));
  const outputPath = path.join(temporaryDirectory, 'web', 'index.html');
  const { client, transport } = createClient();

  try {
    await client.connect(transport);
    const missingPreset = await client.callTool({
      name: 'export_project',
      arguments: {
        projectPath: externalProjectPath,
        preset: '__MISSING_PRESET__',
        outputPath: path.join(temporaryDirectory, 'missing.html'),
      },
    });
    assert.match(getText(missingPreset), /Export preset "__MISSING_PRESET__" was not found/);

    const result = await client.callTool({
      name: 'export_project',
      arguments: {
        projectPath: externalProjectPath,
        preset: 'Web',
        outputPath,
      },
    });
    const parsedResult = JSON.parse(getText(result));
    assert.equal(parsedResult.success, true);
    assert.equal(parsedResult.preset, 'Web');
    assert.equal(parsedResult.debug, false);
    assert.equal(path.normalize(parsedResult.outputPath), path.normalize(outputPath));
    assert.equal(existsSync(outputPath), true);
  } finally {
    await client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
