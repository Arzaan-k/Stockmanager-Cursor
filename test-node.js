console.log('Node.js is working!');
console.log('Environment:');
console.log('- Node version:', process.version);
console.log('- Platform:', process.platform);
console.log('- Current directory:', process.cwd());

// Test basic file system access
import { readFile } from 'fs/promises';

try {
  const content = await readFile('./package.json', 'utf-8');
  console.log('Successfully read package.json');
  const pkg = JSON.parse(content);
  console.log('Project name:', pkg.name);
} catch (error) {
  console.error('Error reading package.json:', error.message);
}
