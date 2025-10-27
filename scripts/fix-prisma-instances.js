const fs = require('fs');
const path = require('path');

// Function to recursively find all TypeScript files
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

// Function to update a single file
function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Replace import statements
    if (content.includes('import { dbConnection } from "../utils/database"') || 
        content.includes('import { dbConnection } from "../../utils/database"') ||
        content.includes('import { dbConnection } from "../../../utils/database"')) {
      content = content.replace(
        /import\s*{\s*dbConnection\s*}\s*from\s*["']\.\.?\/.*?\/utils\/database["']/g,
        'import { prisma } from "../utils/database"'
      );
      modified = true;
    }
    
    // Replace dbConnection.getPrismaClient() with prisma
    if (content.includes('dbConnection.getPrismaClient()')) {
      content = content.replace(/dbConnection\.getPrismaClient\(\)/g, 'prisma');
      modified = true;
    }
    
    // Replace const prisma = dbConnection.getPrismaClient(); with import
    if (content.includes('const prisma = dbConnection.getPrismaClient();')) {
      content = content.replace(/const prisma = dbConnection\.getPrismaClient\(\);\s*\n?/g, '');
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
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

console.log(`\n🎉 Updated ${updatedCount} files out of ${tsFiles.length} total files`);
console.log('✅ All Prisma client instances now use the single global instance!');
