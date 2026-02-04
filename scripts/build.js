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
} catch (error) {
  console.error('Error copying scripts:', error);
  process.exit(1);
}

// Copy the godot_mcp_input addon to the build directory
try {
  const addonSrcDir = path.join(__dirname, '..', 'src', 'addons', 'godot_mcp_input');
  const addonDestDir = path.join(__dirname, '..', 'build', 'addons', 'godot_mcp_input');

  // Ensure the build/addons/godot_mcp_input directory exists
  fs.ensureDirSync(addonDestDir);

  // Copy addon files
  const addonFiles = ['godot_mcp_input.gd', 'plugin.cfg'];
  for (const file of addonFiles) {
    const srcPath = path.join(addonSrcDir, file);
    const destPath = path.join(addonDestDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log('Successfully copied godot_mcp_input addon to build/addons');
} catch (error) {
  console.error('Error copying addon:', error);
  process.exit(1);
}

console.log('Build scripts completed successfully!');
