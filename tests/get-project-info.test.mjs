import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = join(process.cwd(), 'build', 'index.js');

async function withServer(callback) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      GODOT_PATH: process.execPath,
    },
    stderr: 'ignore',
  });
  const client = new Client({
    name: 'get-project-info-test',
    version: '1.0.0',
  }, { capabilities: {} });

  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

async function createProject(root, directoryName, projectFile) {
  const projectPath = join(root, directoryName);
  await mkdir(projectPath);
  if (projectFile === 'directory') {
    await mkdir(join(projectPath, 'project.godot'));
  } else {
    await writeFile(join(projectPath, 'project.godot'), projectFile, 'utf8');
  }
  return projectPath;
}

async function getProjectInfo(projectPath) {
  return withServer(async (client) => {
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'get_project_info'));

    const result = await client.callTool({
      name: 'get_project_info',
      arguments: { projectPath },
    });
    assert.notEqual(result.isError, true);
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0]?.type, 'text');
    return JSON.parse(result.content[0].text);
  });
}

test('get_project_info uses config/name when it differs from the directory basename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'godot-mcp-get-project-info-'));
  try {
    const projectPath = await createProject(
      root,
      'project-folder',
      '[application]\nconfig/name="Configured Project"\n'
    );
    const info = await getProjectInfo(projectPath);

    assert.equal(info.name, 'Configured Project');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('get_project_info falls back to the directory basename when config/name is absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'godot-mcp-get-project-info-'));
  try {
    const projectPath = await createProject(root, 'project-without-name', '[application]\n');
    const info = await getProjectInfo(projectPath);

    assert.equal(info.name, basename(projectPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('get_project_info falls back to the directory basename when config/name is empty', async () => {
  const root = await mkdtemp(join(tmpdir(), 'godot-mcp-get-project-info-'));
  try {
    const projectPath = await createProject(
      root,
      'project-with-empty-name',
      '[application]\nconfig/name=""\n'
    );
    const info = await getProjectInfo(projectPath);

    assert.equal(info.name, basename(projectPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('get_project_info survives project.godot read errors and continues responding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'godot-mcp-get-project-info-'));
  try {
    const projectPath = await createProject(root, 'project-with-unreadable-config', 'directory');
    await withServer(async (client) => {
      const toolsBefore = await client.listTools();
      assert.ok(toolsBefore.tools.some((tool) => tool.name === 'get_project_info'));

      const result = await client.callTool({
        name: 'get_project_info',
        arguments: { projectPath },
      });
      assert.notEqual(result.isError, true);
      assert.ok(Array.isArray(result.content));
      assert.equal(result.content[0]?.type, 'text');
      const info = JSON.parse(result.content[0].text);
      assert.equal(info.name, basename(projectPath));

      const toolsAfter = await client.listTools();
      assert.ok(toolsAfter.tools.some((tool) => tool.name === 'get_project_info'));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
