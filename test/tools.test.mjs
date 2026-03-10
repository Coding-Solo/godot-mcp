import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const defaultGodotPath = 'D:/repos/Godot_v4.6.1-stable_mono_win64/Godot_v4.6.1-stable_mono_win64/Godot_v4.6.1-stable_mono_win64.exe';

test('tools list exposes capture_screenshot', async (t) => {
  const godotPath = process.env.GODOT_PATH ?? defaultGodotPath;

  if (!existsSync(godotPath)) {
    t.skip(`Godot executable not found: ${godotPath}`);
    return;
  }

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/index.js'],
    env: {
      ...process.env,
      GODOT_PATH: godotPath,
      DEBUG: 'false',
    },
    stderr: 'ignore',
  });

  const client = new Client(
    {
      name: 'godot-mcp-test',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  try {
    const result = await client.listTools();
    const toolNames = result.tools.map((tool) => tool.name);

    assert.ok(toolNames.includes('get_project_info'));
    assert.ok(toolNames.includes('capture_screenshot'));
  } finally {
    await transport.close();
  }
});
