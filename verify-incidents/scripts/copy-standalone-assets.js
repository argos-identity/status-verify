#!/usr/bin/env node

/**
 * Post-build script to copy necessary assets to Next.js standalone build
 *
 * Next.js standalone build doesn't automatically copy:
 * 1. public/ folder (images, logos, static files)
 * 2. .next/static/ folder (CSS, JS bundles)
 * 3. .env.local file (environment variables)
 *
 * This script automates the copying process after each build.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function copyDirectory(src, dest) {
  try {
    // Use cp -r for recursive copy
    execSync(`cp -r "${src}" "${dest}"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Failed to copy ${src} to ${dest}:`, error.message);
    return false;
  }
}

function copyFile(src, dest) {
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch (error) {
    console.error(`Failed to copy ${src} to ${dest}:`, error.message);
    return false;
  }
}

function findStandaloneDir(baseDir) {
  const serverJs = path.join(baseDir, 'server.js');
  if (fs.existsSync(serverJs)) return baseDir;
  try {
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = findStandaloneDir(path.join(baseDir, entry.name));
        if (found) return found;
      }
    }
  } catch (_) {}
  return null;
}

function main() {
  log('\n📦 Copying standalone build assets...', 'blue');

  const projectRoot = process.cwd();
  const standaloneBase = path.join(projectRoot, '.next', 'standalone');

  const standaloneDir = findStandaloneDir(standaloneBase);

  if (!standaloneDir) {
    log('❌ Standalone directory not found. Make sure you have output: "standalone" in next.config.ts', 'red');
    process.exit(1);
  }

  log(`   📂 Standalone dir: ${standaloneDir}`, 'blue');

  let successCount = 0;
  let failCount = 0;

  // 1. Copy public folder
  log('\n1️⃣  Copying public/ folder...', 'yellow');
  const publicSrc = path.join(projectRoot, 'public');
  const publicDest = path.join(standaloneDir, 'public');

  if (fs.existsSync(publicSrc)) {
    if (copyDirectory(publicSrc, publicDest)) {
      log('   ✅ public/ copied successfully', 'green');
      successCount++;
    } else {
      failCount++;
    }
  } else {
    log('   ⚠️  public/ folder not found, skipping', 'yellow');
  }

  // 2. Copy .next/static folder
  log('\n2️⃣  Copying .next/static/ folder...', 'yellow');
  const staticSrc = path.join(projectRoot, '.next', 'static');
  const staticDest = path.join(standaloneDir, '.next', 'static');

  if (fs.existsSync(staticSrc)) {
    if (copyDirectory(staticSrc, staticDest)) {
      log('   ✅ .next/static/ copied successfully', 'green');
      successCount++;
    } else {
      failCount++;
    }
  } else {
    log('   ⚠️  .next/static/ folder not found, skipping', 'yellow');
  }

  // 3. Copy .env.local to standalone/.env
  log('\n3️⃣  Copying .env.local file...', 'yellow');
  const envSrc = path.join(projectRoot, '.env.local');
  const envDest = path.join(standaloneDir, '.env');

  if (fs.existsSync(envSrc)) {
    if (copyFile(envSrc, envDest)) {
      log('   ✅ .env.local copied to .env successfully', 'green');
      successCount++;
    } else {
      failCount++;
    }
  } else {
    log('   ⚠️  .env.local file not found, skipping', 'yellow');
  }

  // 4. Fix server.js default port to 3006
  log('\n4️⃣  Fixing server.js default port...', 'yellow');
  const serverJsPath = path.join(standaloneDir, 'server.js');

  if (fs.existsSync(serverJsPath)) {
    try {
      let serverContent = fs.readFileSync(serverJsPath, 'utf8');

      // Replace default port 3000 with 3006
      const originalContent = serverContent;
      serverContent = serverContent.replace(
        /const currentPort = parseInt\(process\.env\.PORT, 10\) \|\| 3000/g,
        'const currentPort = parseInt(process.env.PORT, 10) || 3006'
      );

      if (serverContent !== originalContent) {
        fs.writeFileSync(serverJsPath, serverContent, 'utf8');
        log('   ✅ server.js default port updated to 3006', 'green');
        successCount++;
      } else {
        log('   ℹ️  server.js already has correct port (3006)', 'blue');
        successCount++;
      }
    } catch (error) {
      log(`   ❌ Failed to update server.js: ${error.message}`, 'red');
      failCount++;
    }
  } else {
    log('   ❌ server.js not found', 'red');
    failCount++;
  }

  // Summary
  log('\n' + '='.repeat(50), 'blue');
  log(`📊 Summary: ${successCount} succeeded, ${failCount} failed`, 'blue');
  log('='.repeat(50) + '\n', 'blue');

  if (failCount > 0) {
    log('⚠️  Some assets failed to copy. Check the errors above.', 'yellow');
    process.exit(1);
  } else {
    log('🎉 All assets copied successfully!', 'green');
    log(`\n📍 Standalone build location: ${standaloneDir}\n`, 'blue');
  }
}

// Run the script
main();
