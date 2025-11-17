#!/usr/bin/env node

/**
 * Helper script to format tokens.json for Railway environment variable
 * Usage: node format-tokens-for-railway.js [path-to-tokens.json]
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default token path
const defaultTokenPath = path.join(
  os.homedir(),
  '.config',
  'google-calendar-mcp',
  'tokens.json'
);

const tokenPath = process.argv[2] || defaultTokenPath;

try {
  // Read tokens file
  const tokensContent = fs.readFileSync(tokenPath, 'utf-8');
  const tokens = JSON.parse(tokensContent);
  
  // Format as single-line JSON (Railway-friendly)
  const formatted = JSON.stringify(tokens);
  
  console.log('\n=== Copy this value to Railway GOOGLE_CALENDAR_TOKENS variable ===\n');
  console.log(formatted);
  console.log('\n=== End of value ===\n');
  
  console.log('Instructions:');
  console.log('1. Copy the JSON above (everything between the === lines)');
  console.log('2. Go to Railway → Your MCP service → Variables');
  console.log('3. Add new variable: GOOGLE_CALENDAR_TOKENS');
  console.log('4. Paste the JSON as the value');
  console.log('5. Save and redeploy\n');
  
} catch (error) {
  console.error('Error reading tokens file:', error.message);
  console.error('\nUsage: node format-tokens-for-railway.js [path-to-tokens.json]');
  console.error('Default path:', defaultTokenPath);
  process.exit(1);
}

