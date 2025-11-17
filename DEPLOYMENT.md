# Deployment Guide

This guide explains how to deploy the Calendar Agent to Railway or Render for public access with password protection.

## Prerequisites

- Git repository (GitHub, GitLab, etc.)
- Account on Railway or Render
- All environment variables configured

## Option 1: Deploy to Railway

### Step 1: Prepare Your Repository

1. Make sure all files are committed to Git
2. Push to GitHub/GitLab

### Step 2: Create Railway Project

1. Go to [Railway](https://railway.app/)
2. Sign up or log in
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"** (or GitLab)
5. Select your repository
6. Railway will automatically detect it's a Python project

### Step 3: Configure Environment Variables

In Railway dashboard, go to your project → **Variables** tab and add:

```
ACCESS_PASSWORD=your-secure-password-here
OPENAI_API_KEY=sk-your-openai-key
MCP_URL=http://localhost:3000/mcp/calendar
MCP_USER_ID=user123
MCP_CALENDAR_EMAIL=your-email@gmail.com
FLASK_DEBUG=False
API_PORT=5000
```

**Important:** 
- Set a strong `ACCESS_PASSWORD` - this is what users will enter to access the app
- Keep `FLASK_DEBUG=False` in production

### Step 4: Deploy MCP Server (Separate Service)

The MCP server needs to run as a separate service. Since you've modified the MCP server (added HTTP server wrapper), it's included in your repository.

#### Deploy MCP Server on Railway

1. In your Railway project, click **"New Service"**
2. Select **"GitHub Repo"** and choose your calendar-agent repository
3. **Important:** Set the **Root Directory** to `mcp-google`
4. Set the build command: `npm install && npm run build`
5. Set the start command: `npm run http-server`
6. Add environment variables:
   - `PORT=3000`
   - `GOOGLE_OAUTH_CREDENTIALS` - Path to OAuth credentials (or use env vars)
   - Any other MCP-specific variables
7. **For OAuth tokens:** You'll need to either:
   - Re-authenticate after deployment (run `npm run auth` in the service)
   - Use persistent volumes for the `tokens/` directory
   - Or set up OAuth via environment variables if supported
8. Note the internal service URL (e.g., `mcp-server-production.up.railway.app`)
9. Update `MCP_URL` in your Flask service to: `http://mcp-server-production.up.railway.app/mcp/calendar`

**Note:** The modified MCP server with HTTP wrapper is now included in your repository, so Railway will deploy it with your modifications.

### Step 5: Configure Frontend

Railway will serve your Flask app, but you need to serve the frontend. Options:

#### Option A: Serve Frontend from Flask (Simplest)

Modify `api_server.py` to serve static files:

```python
from flask import send_from_directory

@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('frontend', path)
```

#### Option B: Deploy Frontend Separately

Deploy the `frontend/` directory to:
- Vercel (free, recommended)
- Netlify (free)
- Railway (separate service)

Update API URLs in `frontend/app.js` to use your Railway API URL.

### Step 6: Deploy

1. Railway will automatically deploy when you push to your repository
2. Check the **Deployments** tab for build logs
3. Once deployed, Railway will provide a public URL (e.g., `calendar-agent-production.up.railway.app`)

### Step 7: Test

1. Visit your Railway URL
2. You should see the login screen
3. Enter the password you set in `ACCESS_PASSWORD`
4. Test the booking flow

## Option 2: Deploy to Render

### Step 1: Prepare Your Repository

Same as Railway - commit and push to Git.

### Step 2: Create Render Web Service

1. Go to [Render](https://render.com/)
2. Sign up or log in
3. Click **"New +"** → **"Web Service"**
4. Connect your GitHub/GitLab repository
5. Select your repository

### Step 3: Configure Service

- **Name:** `calendar-agent-api`
- **Environment:** `Python 3`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `python api_server.py`

### Step 4: Set Environment Variables

In the Render dashboard, go to **Environment** and add:

```
ACCESS_PASSWORD=your-secure-password-here
OPENAI_API_KEY=sk-your-openai-key
MCP_URL=http://localhost:3000/mcp/calendar
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

### Step 6: Deploy Frontend

Same options as Railway:
- Serve from Flask (modify `api_server.py`)
- Deploy separately to Vercel/Netlify

### Step 7: Deploy

1. Click **"Create Web Service"**
2. Render will build and deploy automatically
3. You'll get a public URL (e.g., `calendar-agent.onrender.com`)

## Important Notes

### MCP Server Considerations

The MCP server needs:
1. **OAuth tokens** - These are stored locally in `mcp-google/tokens/`
2. **Persistent storage** - Tokens need to persist across deployments

**Solutions:**
- Use Railway/Render volumes for token storage
- Or re-authenticate after each deployment (not ideal)
- Or use environment variables for OAuth (if MCP supports it)

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

### Troubleshooting

**MCP Server Connection Issues:**
- Check that MCP server is running
- Verify `MCP_URL` is correct
- For internal services, use the internal service URL, not public URL

**Authentication Issues:**
- Verify `ACCESS_PASSWORD` is set correctly
- Check browser console for errors
- Verify CORS is enabled in Flask

**Build Failures:**
- Check build logs in Railway/Render dashboard
- Verify all dependencies are in `requirements.txt`
- Check Python version compatibility

## Quick Reference

**Environment Variables Needed:**
```
ACCESS_PASSWORD=your-password
OPENAI_API_KEY=sk-...
MCP_URL=http://mcp-server-url/mcp/calendar
MCP_USER_ID=user123
MCP_CALENDAR_EMAIL=your-email@gmail.com
FLASK_DEBUG=False
API_PORT=5000
```

**Service URLs:**
- Flask API: Your Railway/Render URL
- MCP Server: Internal service URL (for Railway) or separate service URL
- Frontend: Same as Flask API (if served from Flask) or separate deployment

## Next Steps

After deployment:
1. Test the login flow
2. Test booking a meeting
3. Share the URL and password with authorized users
4. Monitor logs for any issues
5. Set up monitoring/alerts if needed

