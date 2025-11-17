# MCP Server Deployment Guide

This guide explains how to deploy the modified MCP server (with HTTP server wrapper) to Railway or Render.

## Problem

The `mcp-google` directory contains modifications (like the HTTP server wrapper) that aren't in the original repository. Since `mcp-google/` is in `.gitignore`, these changes aren't tracked in your main repository.

## Solution Options

### Option 1: Include mcp-google in Your Repository (Recommended)

This is the simplest approach - include the modified mcp-google directory in your main repository.

#### Steps:

1. **Remove mcp-google from .gitignore:**
   ```bash
   # Edit .gitignore and remove or comment out:
   # mcp-google/
   ```

2. **Add mcp-google to git:**
   ```bash
   git add mcp-google/
   git commit -m "Add modified mcp-google with HTTP server"
   ```

3. **Deploy as part of your main project:**
   - Railway/Render will clone your entire repository
   - The modified mcp-google will be included
   - Deploy it as a separate service

#### Pros:
- ✅ Simple - everything in one repository
- ✅ Modifications are version controlled
- ✅ Easy to deploy

#### Cons:
- ⚠️ Larger repository size
- ⚠️ Need to manually update when upstream changes

### Option 2: Fork and Use as Submodule

Fork the mcp-google repository, add your modifications, and use it as a git submodule.

#### Steps:

1. **Fork the repository:**
   - Go to https://github.com/199-mcp/mcp-google
   - Click "Fork"
   - Fork to your GitHub account

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-google.git
   cd mcp-google
   ```

3. **Add your modifications:**
   - Copy your `build/http-server.js` or recreate `src/http-server.ts`
   - Update `package.json` if needed
   - Update `scripts/build.js` to build http-server

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "Add HTTP server wrapper"
   git push origin main
   ```

5. **Add as submodule to your main repo:**
   ```bash
   cd /path/to/calendar-agent
   git submodule add https://github.com/YOUR_USERNAME/mcp-google.git mcp-google
   git commit -m "Add mcp-google as submodule"
   ```

6. **Deploy:**
   - Railway/Render will clone with submodules
   - Deploy mcp-google as a separate service

#### Pros:
- ✅ Clean separation
- ✅ Can track upstream changes
- ✅ Modifications are in your fork

#### Cons:
- ⚠️ More complex setup
- ⚠️ Need to manage submodules

### Option 3: Deploy from Build Directory Only

If you only have the built `http-server.js` file, you can deploy just what's needed.

#### Steps:

1. **Create a minimal deployment structure:**
   ```bash
   mkdir mcp-server-deploy
   cd mcp-server-deploy
   
   # Copy necessary files
   cp -r ../mcp-google/build/http-server.js .
   cp ../mcp-google/package.json .
   # Copy any other needed files
   ```

2. **Create a minimal package.json:**
   ```json
   {
     "name": "mcp-google-http-server",
     "version": "1.0.0",
     "type": "module",
     "scripts": {
       "start": "node http-server.js"
     },
     "dependencies": {
       "express": "^4.18.2",
       "googleapis": "^144.0.0",
       "google-auth-library": "^9.15.0"
     }
   }
   ```

3. **Include in your repository:**
   ```bash
   # Add to your main repo
   git add mcp-server-deploy/
   git commit -m "Add MCP server deployment files"
   ```

4. **Deploy:**
   - Deploy `mcp-server-deploy` as a separate service
   - Set start command: `npm start`

#### Pros:
- ✅ Minimal - only what's needed
- ✅ No need for full mcp-google repo

#### Cons:
- ⚠️ Can't rebuild from source
- ⚠️ Harder to update

### Option 4: Recreate http-server.ts Source File

If you have the built `http-server.js`, you can recreate the source file (or keep using the built file).

#### Steps:

1. **Create src/http-server.ts** (if you have the source code)
   - Or keep using the built file directly

2. **Update build script** to include http-server:
   ```javascript
   // In scripts/build.js, add:
   const httpServerBuildOptions = {
     entryPoints: [join(__dirname, '../src/http-server.ts')],
     bundle: true,
     platform: 'node',
     target: 'node18',
     outfile: join(__dirname, '../build/http-server.js'),
     format: 'esm',
     packages: 'external',
     sourcemap: true,
   };
   
   // Add to build:
   await esbuild.build(httpServerBuildOptions);
   ```

3. **Include in repository:**
   - Remove mcp-google from .gitignore
   - Commit the changes

## Recommended: Option 1 (Include in Repository)

For simplicity, I recommend **Option 1** - just include the modified mcp-google directory in your repository.

### Quick Setup:

1. **Edit .gitignore:**
   ```bash
   # Comment out or remove this line:
   # mcp-google/
   ```

2. **Add to git:**
   ```bash
   git add mcp-google/
   git commit -m "Include modified mcp-google with HTTP server"
   git push
   ```

3. **Deploy to Railway/Render:**
   - Create a new service for MCP server
   - Set working directory: `mcp-google`
   - Set build command: `npm install && npm run build`
   - Set start command: `npm run http-server`
   - Add environment variables (OAuth credentials, etc.)

## Deployment Configuration

### Railway

Create a new service in your Railway project:

1. **Add Service** → **GitHub Repo** → Select your repo
2. **Root Directory:** `mcp-google`
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm run http-server`
5. **Environment Variables:**
   - `PORT=3000`
   - Any MCP-specific variables

### Render

1. **New +** → **Background Worker**
2. **Root Directory:** `mcp-google`
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm run http-server`
5. **Environment Variables:** Same as Railway

## Important Notes

1. **OAuth Tokens:**
   - Tokens are stored in `mcp-google/tokens/`
   - You need persistent storage (volumes) or re-authenticate after each deployment
   - Consider using environment variables for OAuth if supported

2. **OAuth Credentials:**
   - `gcp-oauth.keys.json` should NOT be committed
   - Set credentials via environment variables or secure storage
   - Use Railway/Render secrets for sensitive data

3. **Internal Service URL:**
   - Railway: Use the internal service URL (e.g., `mcp-server-production.up.railway.app`)
   - Render: Use the internal service URL
   - Update `MCP_URL` in your Flask service to point to the MCP service

## Troubleshooting

**Build fails:**
- Check that all dependencies are in `package.json`
- Verify Node.js version (18+)
- Check build logs for errors

**http-server.js not found:**
- Make sure `npm run build` runs successfully
- Check that `build/http-server.js` exists
- Verify build script includes http-server

**Connection issues:**
- Verify MCP service is running
- Check internal service URL
- Ensure `MCP_URL` is correct in Flask service

