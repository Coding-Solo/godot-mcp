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

// Copy the addon directory to the build directory
try {
  const addonSrcPath = path.join(__dirname, '..', 'src', 'addon');
  const addonDestPath = path.join(__dirname, '..', 'build', 'addon');
  
  if (fs.existsSync(addonSrcPath)) {
    // Ensure the build/addon directory exists and copy recursively
    fs.ensureDirSync(addonDestPath);
    fs.copySync(addonSrcPath, addonDestPath, { overwrite: true });
    console.log('Successfully copied addon to build/addon');
  }
} catch (error) {
  console.error('Error copying addon:', error);
  // Don't exit - addon is optional
}

console.log('Build scripts completed successfully!');
