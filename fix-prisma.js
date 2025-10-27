const fs = require('fs');
const path = require('path');

// Find all TypeScript files
function findTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      findTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

// Update a single file
function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Replace dbConnection.getPrismaClient() with prisma
    if (content.includes('dbConnection.getPrismaClient()')) {
      content = content.replace(/dbConnection\.getPrismaClient\(\)/g, 'prisma');
      modified = true;
    }
    
    // Replace import statements
    if (content.includes('import { dbConnection }')) {
      content = content.replace(
        /import\s*{\s*dbConnection\s*}\s*from\s*['\"][^'\"]*\/utils\/database['\"]/g,
        'import { prisma } from \'../utils/database\''
      );
      modified = true;
    }
    
    // Remove const prisma = dbConnection.getPrismaClient(); lines
    if (content.includes('const prisma = dbConnection.getPrismaClient();')) {
      content = content.replace(/const prisma = dbConnection\.getPrismaClient\(\);\s*\n?/g, '');
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log('✅ Updated:', filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error:', filePath, error.message);
    return false;
  }
}

// Main execution
console.log('🔧 Fixing Prisma client instances...');
const srcDir = path.join(__dirname, 'src');
const tsFiles = findTsFiles(srcDir);

let updatedCount = 0;
tsFiles.forEach(file => {
  if (updateFile(file)) {
    updatedCount++;
  }
});

console.log('🎉 Updated', updatedCount, 'files');
