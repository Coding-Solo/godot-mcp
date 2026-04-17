import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Make the build/index.js file executable
fs.chmodSync(path.join(__dirname, '..', 'build', 'index.js'), '755');

// Copy the scripts directory to the build directory
try {
  // Ensure the build/scripts directory exists
  fs.ensureDirSync(path.join(__dirname, '..', 'build', 'scripts'));

  // Copy the godot_operations.gd file
  fs.copyFileSync(
    path.join(__dirname, '..', 'src', 'scripts', 'godot_operations.gd'),
    path.join(__dirname, '..', 'build', 'scripts', 'godot_operations.gd')
  );

  console.log('Successfully copied godot_operations.gd to build/scripts');

  // Copy the visual-test harness addon (used by install_test_harness)
  const harnessSrc = path.join(__dirname, '..', 'src', 'scripts', 'addons', 'godot_mcp_harness');
  const harnessDest = path.join(__dirname, '..', 'build', 'scripts', 'addons', 'godot_mcp_harness');
  if (fs.existsSync(harnessSrc)) {
    fs.ensureDirSync(path.dirname(harnessDest));
    fs.copySync(harnessSrc, harnessDest, { overwrite: true });
    console.log('Successfully copied godot_mcp_harness addon to build/scripts/addons');
  } else {
    console.warn(`Warning: harness addon source not found at ${harnessSrc}`);
  }
} catch (error) {
  console.error('Error copying scripts:', error);
  process.exit(1);
}

console.log('Build scripts completed successfully!');
