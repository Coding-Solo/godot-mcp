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
  
  const scriptsToCopy = [
    'godot_operations.gd',
    'capture_screenshot.gd',
  ];

  for (const scriptName of scriptsToCopy) {
    fs.copyFileSync(
      path.join(__dirname, '..', 'src', 'scripts', scriptName),
      path.join(__dirname, '..', 'build', 'scripts', scriptName)
    );
  }
  
  console.log(`Successfully copied ${scriptsToCopy.join(', ')} to build/scripts`);
} catch (error) {
  console.error('Error copying scripts:', error);
  process.exit(1);
}

console.log('Build scripts completed successfully!');
