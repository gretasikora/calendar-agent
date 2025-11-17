#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [join(__dirname, '../src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: join(__dirname, '../build/index.js'),
  format: 'esm',
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  packages: 'external', // Don't bundle node_modules
  sourcemap: true,
};

/** @type {import('esbuild').BuildOptions} */
const authServerBuildOptions = {
  entryPoints: [join(__dirname, '../src/auth-server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: join(__dirname, '../build/auth-server.js'),
  format: 'esm',
  packages: 'external', // Don't bundle node_modules
  sourcemap: true,
};

/** @type {import('esbuild').BuildOptions} */
const httpServerBuildOptions = {
  entryPoints: [join(__dirname, '../src/http-server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: join(__dirname, '../build/http-server.js'),
  format: 'esm',
  packages: 'external', // Don't bundle node_modules
  sourcemap: true,
};

if (isWatch) {
  const context = await esbuild.context(buildOptions);
  const authContext = await esbuild.context(authServerBuildOptions);
  const httpContext = await esbuild.context(httpServerBuildOptions);
  await Promise.all([context.watch(), authContext.watch(), httpContext.watch()]);
  console.log('Watching for changes...');
} else {
  const builds = [
    esbuild.build(buildOptions),
    esbuild.build(authServerBuildOptions)
  ];
  
  // Try to build http-server if source exists
  try {
    const httpServerPath = join(__dirname, '../src/http-server.ts');
    const { access } = await import('fs/promises');
    await access(httpServerPath);
    builds.push(esbuild.build(httpServerBuildOptions));
  } catch {
    console.log('Note: http-server.ts not found, skipping build (using pre-built version)');
  }
  
  await Promise.all(builds);
  
  // Make the file executable on non-Windows platforms
  if (process.platform !== 'win32') {
    const { chmod } = await import('fs/promises');
    await chmod(buildOptions.outfile, 0o755);
  }
} 