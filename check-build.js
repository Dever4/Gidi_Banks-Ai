const fs = require('fs');
const path = require('path');

// Check if the admin panel build directory exists
const buildPath = path.join(__dirname, 'admin-panel', 'build');
console.log(`Checking if build directory exists at: ${buildPath}`);

if (fs.existsSync(buildPath)) {
  console.log('✅ Build directory exists!');
  
  // Check if index.html exists
  const indexPath = path.join(buildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log('✅ index.html exists!');
  } else {
    console.log('❌ index.html does not exist!');
  }
  
  // List files in the build directory
  console.log('\nFiles in build directory:');
  const files = fs.readdirSync(buildPath);
  files.forEach(file => {
    console.log(`- ${file}`);
  });
  
  // Check static directory
  const staticPath = path.join(buildPath, 'static');
  if (fs.existsSync(staticPath)) {
    console.log('\n✅ static directory exists!');
    console.log('\nFiles in static directory:');
    const staticFiles = fs.readdirSync(staticPath);
    staticFiles.forEach(file => {
      console.log(`- ${file}`);
    });
  } else {
    console.log('\n❌ static directory does not exist!');
  }
} else {
  console.log('❌ Build directory does not exist!');
}
