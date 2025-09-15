const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running Vercel build script...');

// Create necessary directories
const dirs = [
  path.join(process.cwd(), 'dist'),
  path.join(process.cwd(), 'dist', 'public'),
  path.join(process.cwd(), 'dist', 'server')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Run the build script
try {
  console.log('Running build script...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Copy client files to the correct location
  if (fs.existsSync(path.join(process.cwd(), 'dist', 'public'))) {
    console.log('Copying client files...');
    const clientFiles = fs.readdirSync(path.join(process.cwd(), 'dist', 'public'));
    
    clientFiles.forEach(file => {
      const src = path.join(process.cwd(), 'dist', 'public', file);
      const dest = path.join(process.cwd(), '.vercel', 'output', 'static', file);
      
      // Create destination directory if it doesn't exist
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Copy file
      fs.copyFileSync(src, dest);
    });
  }
  
  console.log('Build completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
