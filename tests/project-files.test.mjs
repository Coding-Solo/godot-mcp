import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { listProjectFiles } from '../build/project-files.js';

const repositoryPath = fileURLToPath(new URL('..', import.meta.url));

function createFixture() {
  const projectPath = mkdtempSync(join(tmpdir(), 'godot-mcp-project-files-'));

  mkdirSync(join(projectPath, 'actors', 'enemies'), { recursive: true });
  mkdirSync(join(projectPath, 'levels'), { recursive: true });
  mkdirSync(join(projectPath, 'materials'), { recursive: true });
  mkdirSync(join(projectPath, '.godot'), { recursive: true });

  writeFileSync(join(projectPath, 'project.godot'), 'config_version=5\n');
  writeFileSync(join(projectPath, 'main.tscn'), '[gd_scene]\n');
  writeFileSync(join(projectPath, 'levels', 'arena.scn'), 'binary-placeholder\n');
  writeFileSync(join(projectPath, 'actors', 'player.gd'), 'extends Node\n');
  writeFileSync(join(projectPath, 'actors', 'enemies', 'slime.gd'), 'extends Node\n');
  writeFileSync(join(projectPath, 'materials', 'player.tres'), '[gd_resource]\n');
  writeFileSync(join(projectPath, 'materials', 'outline.gdshader'), 'shader_type canvas_item;\n');
  writeFileSync(join(projectPath, 'icon.svg'), '<svg></svg>\n');
  writeFileSync(join(projectPath, '.godot', 'generated.gd'), 'extends Node\n');

  return projectPath;
}

test('lists Godot project files by category and ignores generated metadata', () => {
  const projectPath = createFixture();

  try {
    assert.deepEqual(listProjectFiles(projectPath), {
      scenes: ['levels/arena.scn', 'main.tscn'],
      scripts: ['actors/enemies/slime.gd', 'actors/player.gd'],
      resources: ['materials/outline.gdshader', 'materials/player.tres'],
      total: 6,
    });
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
});

test('filters by type and glob pattern using project-relative paths', () => {
  const projectPath = createFixture();

  try {
    assert.deepEqual(
      listProjectFiles(projectPath, { type: 'script', pattern: 'actors/**' }),
      {
        scenes: [],
        scripts: ['actors/enemies/slime.gd', 'actors/player.gd'],
        resources: [],
        total: 2,
      }
    );

    assert.deepEqual(listProjectFiles(projectPath, { pattern: '**/*.tscn' }), {
      scenes: ['main.tscn'],
      scripts: [],
      resources: [],
      total: 1,
    });
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
});

test('exposes list_project_files through MCP', async () => {
  const projectPath = createFixture();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(repositoryPath, 'build', 'index.js')],
    env: { ...process.env, GODOT_PATH: process.execPath },
  });
  const client = new Client(
    { name: 'project-files-test', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    const listedTools = await client.listTools();
    const tool = listedTools.tools.find((candidate) => candidate.name === 'list_project_files');
    assert.ok(tool, 'list_project_files should be exposed by tools/list');
    assert.deepEqual(tool.inputSchema.required, ['projectPath']);

    const response = await client.callTool({
      name: 'list_project_files',
      arguments: {
        projectPath,
        pattern: 'actors/**',
        type: 'script',
      },
    });
    const textContent = response.content.find((item) => item.type === 'text');
    assert.ok(textContent, 'Expected an MCP text response');
    assert.deepEqual(JSON.parse(textContent.text), {
      scenes: [],
      scripts: ['actors/enemies/slime.gd', 'actors/player.gd'],
      resources: [],
      total: 2,
    });
  } finally {
    await client.close();
    rmSync(projectPath, { recursive: true, force: true });
  }
});
