import * as esbuild from 'esbuild';
import { packExtension } from '@anthropic-ai/mcpb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const stagingDir = path.join(root, 'mcpb-staging');

const buildIndex = path.join(root, 'build', 'index.js');
const buildGd = path.join(root, 'build', 'scripts', 'godot_operations.gd');

if (!fs.existsSync(buildIndex)) {
  console.error('Error: build/index.js not found. Run "npm run build" first.');
  process.exit(1);
}
if (!fs.existsSync(buildGd)) {
  console.error('Error: build/scripts/godot_operations.gd not found. Run "npm run build" first.');
  process.exit(1);
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(path.join(stagingDir, 'server', 'scripts'), { recursive: true });

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Manifest version: ${pkg.version}`);

  console.log('Bundling with esbuild...');
  await esbuild.build({
    entryPoints: [buildIndex],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: path.join(stagingDir, 'server', 'index.js'),
  });

  fs.copyFileSync(buildGd, path.join(stagingDir, 'server', 'scripts', 'godot_operations.gd'));

  const iconSrc = path.join(root, 'icon_color.png');
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(stagingDir, 'icon_color.png'));
    console.log('Copied icon_color.png');
  } else {
    console.warn('Warning: icon_color.png not found');
  }

  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  const outputFile = path.join(root, 'build', 'godot-mcp.mcpb');
  console.log('Packing MCPB...');
  const success = await packExtension({ extensionPath: stagingDir, outputPath: outputFile });
  if (!success) process.exit(1);
  console.log('\nMCPB bundle created: build/godot-mcp.mcpb');
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
