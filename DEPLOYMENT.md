# Deployment Guide

This guide explains how to deploy the Calendar Agent application to Railway or Render for public access with password protection.

## Overview

The Calendar Agent consists of:
1. **Flask API Server** - Python backend (port 5000)
2. **MCP HTTP Server** - Node.js server for Google Calendar API (port 3000)
3. **Frontend** - Static HTML/CSS/JS files (served by Flask)

## Prerequisites

- Git repository (GitHub, GitLab, etc.)
- Account on Railway or Render
- All environment variables configured
- Modified `mcp-google` included in your repository (see MCP_DEPLOYMENT.md)

## Quick Start: Deploy to Railway

### Step 1: Prepare Your Repository

1. Make sure all files are committed to Git
2. Push to GitHub/GitLab

### Step 2: Create Railway Project

1. Go to [Railway](https://railway.app/)
2. Sign up or log in
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Select your repository

### Step 3: Deploy Flask API Service

1. Railway will automatically detect it's a Python project
2. **Root Directory:** Leave as root (`.`)
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `python api_server.py`

### Step 4: Configure Environment Variables

In Railway dashboard, go to your Flask service → **Variables** tab and add:

```
ACCESS_PASSWORD=your-secure-password-here
OPENAI_API_KEY=sk-your-openai-key
MCP_URL=http://mcp-server-production.up.railway.app/mcp/calendar
MCP_USER_ID=user123
MCP_CALENDAR_EMAIL=your-email@gmail.com
FLASK_DEBUG=False
API_PORT=5000
```

**Important:** 
- Set a strong `ACCESS_PASSWORD` - this is what users will enter to access the app
- Keep `FLASK_DEBUG=False` in production
- `MCP_URL` will be updated after you deploy the MCP server (see Step 5)

### Step 5: Deploy MCP Server (Separate Service)

The MCP server needs to run as a separate service. Since you've modified the MCP server (added HTTP server wrapper), it's included in your repository.

1. In your Railway project, click **"New Service"**
2. Select **"GitHub Repo"** and choose your calendar-agent repository
3. **Important:** Set the **Root Directory** to `mcp-google`
4. **Build Command:** Leave empty (Dockerfile handles the build)
5. **Start Command:** Leave empty (Dockerfile ENTRYPOINT will run `node build/http-server.js`)
6. Add environment variables (REQUIRED):
   - `PORT=3000`
   - `GOOGLE_CLIENT_ID` - Your Google OAuth Client ID (from Google Cloud Console)
   - `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret (from Google Cloud Console)
   - `GOOGLE_CALENDAR_TOKENS` - OAuth tokens JSON (see step 7 for how to get this)
   
   **To get OAuth credentials:**
   1. Go to [Google Cloud Console](https://console.cloud.google.com/)
   2. Create or select a project
   3. Enable these APIs:
      - Google Calendar API
      - Google People API
      - Gmail API
   4. Go to **APIs & Services** → **Credentials**
   5. Click **Create Credentials** → **OAuth client ID**
   6. Choose **Desktop app** as the application type
   7. Copy the **Client ID** and **Client Secret**
   8. Add them as environment variables in Railway
7. **Authenticate and store tokens (REQUIRED - EASIEST METHOD):**
   
   **Store tokens as environment variable (no shell needed!):**
   1. **Authenticate locally first:**
      ```bash
      cd mcp-google
      npm run auth
      ```
   2. **Format tokens for Railway (helper script):**
      ```bash
      node format-tokens-for-railway.js
      ```
      This will output the formatted JSON to copy.
   
   **OR manually:**
   1. **Find your tokens file:**
      - **Windows:** `%USERPROFILE%\.config\google-calendar-mcp\tokens.json`
      - **Mac/Linux:** `~/.config/google-calendar-mcp/tokens.json`
   2. **Copy the entire JSON content** from your `tokens.json` file
   3. **In Railway → Your MCP service → Variables tab:**
      - Click **"New Variable"**
      - Name: `GOOGLE_CALENDAR_TOKENS`
      - Value: Paste the entire JSON content (as single-line JSON, or with formatting - both work)
      - Example value:
        ```json
        {"access_token":"...","refresh_token":"...","scope":"...","token_type":"Bearer","expiry_date":...}
        ```
   4. **Remove the old variable** (if you added it):
      - Remove: `GOOGLE_CALENDAR_MCP_TOKEN_PATH` (not needed anymore)
   
   **That's it!** The server will automatically load tokens from the environment variable.
9. Note the internal service URL (e.g., `mcp-server-production.up.railway.app`)
10. **Update `MCP_URL`** in your Flask service to: `http://mcp-server-production.up.railway.app/mcp/calendar`

**Note:** The modified MCP server with HTTP wrapper is now included in your repository, so Railway will deploy it with your modifications.

### Step 6: Deploy

1. Railway will automatically deploy when you push to your repository
2. Check the **Deployments** tab for build logs
3. Once deployed, Railway will provide a public URL (e.g., `calendar-agent-production.up.railway.app`)

### Step 7: Test

1. Visit your Railway URL
2. You should see the login screen
3. Enter the password you set in `ACCESS_PASSWORD`
4. Test the booking flow

## Quick Start: Deploy to Render

### Step 1: Prepare Your Repository

Same as Railway - commit and push to Git.

### Step 2: Create Render Web Service

1. Go to [Render](https://render.com/)
2. Sign up or log in
3. Click **"New +"** → **"Web Service"**
4. Connect your GitHub/GitLab repository
5. Select your repository

### Step 3: Configure Flask Service

- **Name:** `calendar-agent-api`
- **Environment:** `Python 3`
- **Root Directory:** `.` (root)
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `python api_server.py`

### Step 4: Set Environment Variables

In the Render dashboard, go to **Environment** and add:

```
ACCESS_PASSWORD=your-secure-password-here
OPENAI_API_KEY=sk-your-openai-key
MCP_URL=http://mcp-server.onrender.com/mcp/calendar
MCP_USER_ID=user123
MCP_CALENDAR_EMAIL=your-email@gmail.com
FLASK_DEBUG=False
API_PORT=5000
```

### Step 5: Deploy MCP Server

Create a separate **Background Worker** service:

1. Click **"New +"** → **"Background Worker"**
2. Connect the same repository (your calendar-agent repo)
3. Set:
   - **Root Directory:** `mcp-google`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run http-server`
4. Add environment variables for MCP:
   - `PORT=3000`
   - OAuth credentials (via env vars or file)
5. **For OAuth tokens:** Re-authenticate after deployment or use persistent storage
6. Note the internal service URL
7. Update `MCP_URL` in your web service to point to the MCP service

### Step 6: Deploy

1. Click **"Create Web Service"**
2. Render will build and deploy automatically
3. You'll get a public URL (e.g., `calendar-agent.onrender.com`)

## Important Notes

### MCP Server Considerations

The MCP server needs:
1. **OAuth tokens** - These are stored locally in `mcp-google/tokens/`
2. **Persistent storage** - Tokens need to persist across deployments
3. **Modified files** - Your HTTP server wrapper is included in the repository

**Solutions:**
- **Railway:** Use persistent volumes for the `tokens/` directory
- **Render:** Use persistent disks for token storage
- **Alternative:** Re-authenticate after each deployment (run `npm run auth` in the service)
- **Best:** Set up OAuth credentials via environment variables and re-authenticate once, then use persistent storage

**For Modified MCP Server:**
- The modified `mcp-google` directory is now included in your repository
- Railway/Render will deploy it with your HTTP server modifications
- Make sure to set the **Root Directory** to `mcp-google` when creating the service

### Security

1. **Never commit:**
   - `.env` files
   - OAuth tokens
   - Passwords
   - API keys

2. **Use strong passwords:**
   - Generate a secure password for `ACCESS_PASSWORD`
   - Use a password manager

3. **HTTPS:**
   - Railway and Render provide HTTPS automatically
   - Make sure your frontend uses HTTPS URLs

### Frontend

The frontend is automatically served by Flask (see `api_server.py`). No separate deployment needed!

## Troubleshooting

### MCP Server Connection Issues

- Check that MCP server is running
- Verify `MCP_URL` is correct (use internal service URL, not public URL)
- For internal services, use the internal service URL (e.g., `mcp-server-production.up.railway.app`)
- Ensure `MCP_URL` is updated in Flask service after MCP server is deployed

### Authentication Errors

- Verify `ACCESS_PASSWORD` is set correctly
- Check browser console for errors
- Verify CORS is enabled in Flask

### Build Failures

- Check build logs in Railway/Render dashboard
- Verify all dependencies are in `requirements.txt`
- Check Python version compatibility (see `runtime.txt`)

### Token Expiration

- Tokens are automatically refreshed using the refresh token
- If you get authentication errors, re-run `npm run auth` in the MCP service
- Tokens are stored in the `tokens/` directory - you can delete them to force re-authentication

### API Quota Exceeded

- Google Calendar API has quotas (default: 1,000,000 requests per day)
- For personal use, this is usually not an issue
- If you hit quotas, wait 24 hours or request a quota increase in Google Cloud Console

## Environment Variables Reference

**Required:**
```
ACCESS_PASSWORD=your-password
OPENAI_API_KEY=sk-...
MCP_URL=http://mcp-server-url/mcp/calendar
MCP_CALENDAR_EMAIL=your-email@gmail.com
```

**Optional:**
```
MCP_USER_ID=user123
FLASK_DEBUG=False
API_PORT=5000
```

## Quick Reference

**Service URLs:**
- Flask API: Your Railway/Render URL (serves both API and frontend)
- MCP Server: Internal service URL (for Railway) or separate service URL

**File Locations:**
- Flask API: Root directory
- MCP Server: `mcp-google/` directory
- Frontend: `frontend/` directory (served by Flask)

**Deployment Files:**
- `Procfile` - For Heroku/Railway compatibility
- `railway.json` - Railway configuration
- `render.yaml` - Render configuration
- `runtime.txt` - Python version

## Additional Resources

- **MCP_DEPLOYMENT.md** - Detailed guide for deploying the modified MCP server
- **MCP_GOOGLE_SETUP.md** - Setup guide for Google OAuth and MCP server
- **README.md** - Main project documentation

