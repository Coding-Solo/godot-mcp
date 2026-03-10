#!/usr/bin/env node
/**
 * MCP Configuration Wizard
 * Automatically generates MCP configuration files for various AI clients
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Supported AI clients configuration
 */
const CLIENTS = {
  // IDE clients
  'trae-cn': {
    name: 'Trae CN',
    type: 'ide',
    configPaths: {
      win32: path.join(process.env.APPDATA || '', 'Trae CN', 'User', 'mcp.json'),
      darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Trae CN', 'User', 'mcp.json'),
      linux: path.join(os.homedir(), '.config', 'Trae CN', 'User', 'mcp.json'),
    },
  },
  'cursor': {
    name: 'Cursor',
    type: 'ide',
    configPaths: {
      win32: path.join(process.env.APPDATA || '', 'Cursor', 'User', 'mcp.json'),
      darwin: path.join(os.homedir(), '.cursor', 'mcp.json'),
      linux: path.join(os.homedir(), '.cursor', 'mcp.json'),
    },
  },
  'windsurf': {
    name: 'Windsurf',
    type: 'ide',
    configPaths: {
      win32: path.join(process.env.APPDATA || '', 'Codeium', 'windsurf', 'mcp_config.json'),
      darwin: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
      linux: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    },
  },
  'claude-desktop': {
    name: 'Claude Desktop',
    type: 'ide',
    configPaths: {
      win32: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
      darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      linux: path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
    },
  },
  'cline': {
    name: 'Cline (VS Code)',
    type: 'ide',
    configPaths: {
      win32: path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      linux: path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    },
  },
};

/**
 * CLI commands for different CLI tools
 */
const CLI_COMMANDS = {
  'claude-cli': {
    name: 'Claude CLI (Claude Code)',
    command: (serverPath, scope = 'user') => 
      `claude mcp add --scope ${scope} --transport stdio godot-mcp node "${serverPath}"`,
  },
  'codex-cli': {
    name: 'Codex CLI',
    command: (serverPath, scope = 'user') => 
      `codex mcp add --scope ${scope} --transport stdio godot-mcp node "${serverPath}"`,
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    command: (serverPath, scope = 'user') => 
      `gemini mcp add --scope ${scope} --transport stdio godot-mcp node "${serverPath}"`,
  },
};

/**
 * Get the build output path
 */
function getServerPath() {
  const scriptDir = __dirname;
  return path.join(scriptDir, '..', 'build', 'index.js');
}

/**
 * Generate MCP configuration for a client
 */
function generateConfig(serverPath, httpPort = null) {
  const config = {
    mcpServers: {
      'godot-mcp': {
        command: 'node',
        args: [serverPath],
        env: {
          DEBUG: 'false',
        },
      },
    },
  };

  if (httpPort) {
    config.mcpServers['godot-mcp'].env.MCP_TRANSPORT = 'http';
    config.mcpServers['godot-mcp'].env.MCP_HTTP_PORT = httpPort.toString();
  }

  return config;
}

/**
 * Merge with existing configuration
 */
function mergeConfig(existingConfig, newConfig) {
  if (!existingConfig) return newConfig;
  
  const merged = { ...existingConfig };
  merged.mcpServers = {
    ...(existingConfig.mcpServers || {}),
    ...newConfig.mcpServers,
  };
  return merged;
}

/**
 * Configure a specific IDE client
 */
function configureClient(clientId, serverPath, httpPort = null) {
  const client = CLIENTS[clientId];
  if (!client) {
    console.error(`Unknown client: ${clientId}`);
    console.log(`Available clients: ${Object.keys(CLIENTS).join(', ')}`);
    return false;
  }

  const configPath = client.configPaths[process.platform];
  if (!configPath) {
    console.error(`Platform ${process.platform} is not supported for ${client.name}`);
    return false;
  }

  const newConfig = generateConfig(serverPath, httpPort);
  
  // Read existing config if it exists
  let existingConfig = null;
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      existingConfig = JSON.parse(content);
      console.log(`Found existing configuration at: ${configPath}`);
    } catch (error) {
      console.log(`Could not parse existing config, will create new one`);
    }
  }

  // Merge configurations
  const finalConfig = mergeConfig(existingConfig, newConfig);

  // Ensure directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`Created directory: ${configDir}`);
  }

  // Write configuration
  fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2), 'utf8');
  console.log(`✅ Configuration written to: ${configPath}`);
  console.log(`   Client: ${client.name}`);
  console.log(`   Server: ${serverPath}`);
  
  if (httpPort) {
    console.log(`   Transport: HTTP (port ${httpPort})`);
  } else {
    console.log(`   Transport: stdio`);
  }

  return true;
}

/**
 * Print CLI commands
 */
function printCliCommands(serverPath) {
  console.log('\n📋 CLI Configuration Commands:\n');
  console.log('Copy and run these commands in your terminal:\n');
  
  for (const [id, cli] of Object.entries(CLI_COMMANDS)) {
    console.log(`# ${cli.name}`);
    console.log(cli.command(serverPath, 'user'));
    console.log('');
  }
}

/**
 * Print all available clients
 */
function printAvailableClients() {
  console.log('\n📦 Available IDE Clients:\n');
  for (const [id, client] of Object.entries(CLIENTS)) {
    const configPath = client.configPaths[process.platform];
    const exists = configPath && fs.existsSync(configPath);
    const status = exists ? '✅ (config exists)' : '❌ (not configured)';
    console.log(`  ${id.padEnd(15)} - ${client.name} ${status}`);
  }

  console.log('\n📡 Available CLI Tools:\n');
  for (const [id, cli] of Object.entries(CLI_COMMANDS)) {
    console.log(`  ${id.padEnd(15)} - ${cli.name}`);
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const serverPath = getServerPath();

  // Check if server build exists
  if (!fs.existsSync(serverPath)) {
    console.error('❌ Server build not found. Please run "npm run build" first.');
    process.exit(1);
  }

  console.log('🔧 Godot MCP Configuration Wizard\n');
  console.log(`Server path: ${serverPath}`);
  console.log(`Platform: ${process.platform}\n`);

  // Parse arguments
  let targetClient = null;
  let httpPort = null;
  let showCli = false;
  let listMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--client' || arg === '-c') {
      targetClient = args[++i];
    } else if (arg === '--http' || arg === '-h') {
      httpPort = parseInt(args[++i]) || 3000;
    } else if (arg === '--cli') {
      showCli = true;
    } else if (arg === '--list' || arg === '-l') {
      listMode = true;
    } else if (arg === '--help') {
      console.log(`
Usage: node configure.js [options]

Options:
  --client, -c <id>    Configure a specific IDE client
  --http, -h <port>    Use HTTP transport (default port: 3000)
  --cli                Show CLI configuration commands
  --list, -l           List all available clients
  --help               Show this help message

Examples:
  node configure.js --client cursor
  node configure.js --client trae-cn --http 3000
  node configure.js --cli
  node configure.js --list
`);
      process.exit(0);
    }
  }

  // List mode
  if (listMode) {
    printAvailableClients();
    process.exit(0);
  }

  // Show CLI commands
  if (showCli) {
    printCliCommands(serverPath);
    process.exit(0);
  }

  // Configure specific client
  if (targetClient) {
    configureClient(targetClient, serverPath, httpPort);
    process.exit(0);
  }

  // Interactive mode - configure all common clients
  console.log('Configuring common IDE clients...\n');
  
  const commonClients = ['trae-cn', 'cursor', 'claude-desktop'];
  for (const clientId of commonClients) {
    console.log(`\n--- Configuring ${CLIENTS[clientId]?.name || clientId} ---`);
    configureClient(clientId, serverPath, httpPort);
  }

  // Also show CLI commands
  printCliCommands(serverPath);

  console.log('\n✨ Configuration complete! Restart your IDE to apply changes.\n');
}

main();
