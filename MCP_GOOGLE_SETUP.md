# MCP Google HTTP Server Setup Guide

This comprehensive guide explains how to set up the `mcp-google` repository with the HTTP server wrapper that enables Python integration, including detailed Google API authorization steps.

## Overview

The `mcp-google` repository has been modified to include:
- **HTTP Server Wrapper** (`src/http-server.ts`) - Exposes MCP functionality via HTTP API
- **Build Script Updates** - Compiles the HTTP server alongside the main MCP server
- **Enhanced Event Responses** - Returns raw calendar data for programmatic access
- **OAuth2 Authentication** - Secure authentication with automatic token refresh

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Google account (Gmail account)
- Google Cloud Project (we'll create this in the guide)

## Step 1: Clone and Install

```bash
# Clone the mcp-google repository
git clone https://github.com/199-mcp/mcp-google.git
cd mcp-google

# Install dependencies
npm install
```

## Step 2: Set Up Google Cloud Project and OAuth Credentials

This is the most important step. Follow these instructions carefully to set up Google API authorization.

### 2.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Enter a project name (e.g., "Calendar Agent MCP")
5. Click **"Create"**
6. Wait for the project to be created, then select it from the dropdown

### 2.2 Enable Required APIs

You need to enable the Google Calendar API:

1. In the Google Cloud Console, go to **"APIs & Services" > "Library"**
2. Search for **"Google Calendar API"**
3. Click on it and click **"Enable"**
4. Wait for the API to be enabled

**Note:** The calendar agent primarily uses the Calendar API. If you plan to use Contacts or Gmail features, also enable:
- Google People API (for contacts)
- Gmail API (for email features)

### 2.3 Configure OAuth Consent Screen

This step is required before you can create OAuth credentials:

1. Go to **"APIs & Services" > "OAuth consent screen"**
2. Choose **"External"** user type (unless you have a Google Workspace account, then choose "Internal")
3. Click **"Create"**

4. **Fill in the required information:**
   - **App name**: "Calendar Agent" (or any name you prefer)
   - **User support email**: Select your email from the dropdown
   - **Developer contact information**: Enter your email address
   - Click **"Save and Continue"**

5. **Scopes (Step 2):**
   - Click **"Add or Remove Scopes"**
   - In the filter box, search for and add these scopes:
     - `https://www.googleapis.com/auth/calendar` - Full access to Google Calendar
     - `https://www.googleapis.com/auth/calendar.events` - Access to calendar events
   - (Optional) If using Contacts or Gmail:
     - `https://www.googleapis.com/auth/contacts` - Access to contacts
     - `https://www.googleapis.com/auth/gmail.modify` - Gmail access
   - Click **"Update"**, then **"Save and Continue"**

6. **Test users (Step 3):**
   - Since you're in "Testing" mode, you need to add test users
   - Click **"Add Users"**
   - Enter your Google account email address
   - Click **"Add"**, then **"Save and Continue"**

7. **Summary (Step 4):**
   - Review your settings
   - Click **"Back to Dashboard"**

**Important:** While your app is in "Testing" mode, only the test users you added can authenticate. To make it available to all users, you'll need to submit your app for verification (not required for personal use).

### 2.4 Create OAuth 2.0 Credentials

1. Go to **"APIs & Services" > "Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**

4. **Configure the OAuth client:**
   - **Application type**: Select **"Desktop app"** (this is important!)
   - **Name**: Enter a name like "MCP Calendar Client" or "Calendar Agent Client"
   - Click **"Create"**

5. **Download the credentials:**
   - A popup will appear with your Client ID and Client Secret
   - **IMPORTANT:** Click **"DOWNLOAD JSON"** to save the credentials file
   - Save it somewhere safe (e.g., `~/Downloads/client_secret_xxxxx.json`)
   - You can also copy the Client ID and Client Secret for manual configuration

6. Click **"OK"** to close the popup

### 2.5 Configure Credentials in mcp-google

You have two options for configuring credentials:

#### Option A: Use the Downloaded JSON File (Recommended)

1. Copy the downloaded JSON file to the `mcp-google` directory:
   ```bash
   # Example: if you downloaded it to Downloads
   cp ~/Downloads/client_secret_*.json mcp-google/gcp-oauth.keys.json
   
   # Or on Windows:
   copy %USERPROFILE%\Downloads\client_secret_*.json mcp-google\gcp-oauth.keys.json
   ```

2. The file should look like this:
   ```json
   {
     "installed": {
       "client_id": "xxxxx.apps.googleusercontent.com",
       "project_id": "your-project-id",
       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
       "token_uri": "https://oauth2.googleapis.com/token",
       "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
       "client_secret": "GOCSPX-xxxxx",
       "redirect_uris": ["http://localhost"]
     }
   }
   ```

#### Option B: Manual Configuration

1. Copy the example file:
   ```bash
   cp gcp-oauth.keys.example.json gcp-oauth.keys.json
   ```

2. Edit `gcp-oauth.keys.json` and replace with your credentials:
   ```json
   {
     "installed": {
       "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
       "client_secret": "YOUR_CLIENT_SECRET",
       "redirect_uris": ["http://localhost:3000/oauth2callback"]
     }
   }
   ```
   
   **Note:** Use the Client ID and Client Secret from the OAuth credentials you created.

## Step 3: Build the Project

```bash
# Build all components (main server, auth server, and HTTP server)
npm run build
```

This will compile:
- `build/index.js` - Main MCP server
- `build/auth-server.js` - OAuth authentication server
- `build/http-server.js` - HTTP wrapper server

## Step 4: Authenticate

This step will open a browser window for Google OAuth authentication:

```bash
# Run the authentication server
npm run auth
```

**What happens:**
1. A browser window will open automatically
2. You'll be asked to sign in with your Google account
3. Google will show a consent screen asking for permissions:
   - "See, edit, share, and permanently delete all the calendars you can access using Google Calendar"
   - Click **"Continue"** to grant permissions
4. You may see a warning that the app isn't verified (this is normal for testing mode)
   - Click **"Advanced"** > **"Go to Calendar Agent (unsafe)"**
5. After granting permissions, the browser will redirect and show a success message
6. The authentication server will save the tokens automatically
7. You can close the browser window and stop the auth server (Ctrl+C)

**Token Storage:**
- Tokens are saved in a `tokens/` directory (created automatically)
- The tokens include both access and refresh tokens
- Refresh tokens are used to automatically get new access tokens when they expire

**Troubleshooting Authentication:**
- If you see "redirect_uri_mismatch": Make sure the redirect URI in your OAuth credentials matches `http://localhost:3000/oauth2callback`
- If you see "access_denied": Make sure you added your email as a test user in the OAuth consent screen
- If the browser doesn't open: Manually navigate to the URL shown in the terminal

## Step 5: Start the HTTP Server

```bash
# Start the HTTP server (defaults to port 3000)
npm run http-server

# Or specify a custom port
PORT=8080 npm run http-server
```

The server will start on `http://localhost:3000` (or your specified port).

**Expected output:**
```
HTTP Server running on http://localhost:3000
MCP Calendar endpoint: http://localhost:3000/mcp/calendar
```

## Step 6: Verify the Server

Test that the server is running correctly:

```bash
# Test the health endpoint
curl http://localhost:3000/health

# Should return: {"status":"ok"}
```

You can also test in a browser by navigating to `http://localhost:3000/health`

## Step 7: Integration with Calendar Agent

To use this MCP server with the calendar-agent Python project:

1. **Set environment variables** in your `.env` file (in the calendar-agent root directory):
   ```env
   # MCP Server URL
   MCP_URL=http://localhost:3000/mcp/calendar
   
   # MCP User ID (optional, can be any string)
   MCP_USER_ID=user123
   
   # Your Google Calendar email (the email you authenticated with)
   MCP_CALENDAR_EMAIL=your-email@gmail.com
   ```

2. **Make sure the HTTP server is running** before starting the Python Flask server

3. **Start the calendar agent** (see main README.md for full instructions)

## API Endpoints

### Health Check
```
GET /health
```
Returns server status: `{"status":"ok"}`

### Calendar Operations
```
POST /mcp/calendar
```

**Request Body:**
```json
{
  "user_id": "optional-user-id",
  "action": "list-events",
  "params": {
    "calendarId": "primary",
    "timeMin": "2025-01-15T09:00:00Z",
    "timeMax": "2025-01-15T17:00:00Z"
  }
}
```

**Supported Actions:**
- `list-events` - List calendar events in a time range
- `create-event` - Create a new calendar event (supports Google Meet for online meetings)
- `update-event` - Update an existing event
- `delete-event` - Delete an event
- `list-calendars` - List available calendars (used for auto-detecting primary calendar)
- `freebusy` - Check calendar availability (legacy, use list-events instead)

**Response Format:**
```json
{
  "content": [...],
  "raw": {...},      // Raw Google API response
  "events": [...]    // Extracted events array
}
```

## Troubleshooting

### Server won't start
- **Check authentication**: Ensure you've run `npm run auth` first and tokens are saved
- **Check credentials**: Verify that `gcp-oauth.keys.json` exists and contains valid credentials
- **Check tokens**: Look in the `tokens/` directory - there should be token files there
- **Check port**: Make sure port 3000 (or your specified port) is not already in use

### Authentication errors
- **Re-authenticate**: Re-run `npm run auth` to refresh tokens
- **Check OAuth credentials**: Verify that your Client ID and Client Secret are correct
- **Check API enablement**: Ensure Google Calendar API is enabled in your Google Cloud project
- **Check test users**: If in testing mode, make sure your email is added as a test user
- **Check scopes**: Verify that the required scopes are added in the OAuth consent screen

### "redirect_uri_mismatch" error
- The redirect URI in your OAuth credentials must match exactly
- For the HTTP server, it should be: `http://localhost:3000/oauth2callback`
- Update this in Google Cloud Console > Credentials > Your OAuth Client

### Port already in use
```bash
# Find what's using the port (Windows)
netstat -ano | findstr :3000

# Kill the process (Windows)
taskkill /PID <PID> /F

# Or use a different port
PORT=8080 npm run http-server
```

### Token expiration
- Tokens are automatically refreshed using the refresh token
- If you get authentication errors, re-run `npm run auth` to get new tokens
- Tokens are stored in the `tokens/` directory - you can delete them to force re-authentication

### API quota exceeded
- Google Calendar API has quotas (default: 1,000,000 requests per day)
- For personal use, this is usually not an issue
- If you hit quotas, wait 24 hours or request a quota increase in Google Cloud Console

## Security Best Practices

1. **Never commit credentials**: 
   - Add `gcp-oauth.keys.json` to `.gitignore`
   - Never commit tokens or credentials to version control

2. **Protect your tokens**:
   - The `tokens/` directory contains sensitive authentication data
   - Keep it secure and don't share it

3. **Use environment variables** (optional):
   - You can set credentials via environment variables instead of a file
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables

4. **Regular token refresh**:
   - Tokens automatically refresh, but you may need to re-authenticate periodically
   - If you see authentication errors, re-run `npm run auth`

## Development

### Watch Mode
```bash
# Rebuild on file changes
npm run build -- --watch
```

### Testing
```bash
# Run tests
npm test
```

### Debugging
- Check the console output when running `npm run http-server` for error messages
- Check browser console if authentication issues occur
- Verify API responses using curl or Postman

## Additional Resources

- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Original mcp-google Repository](https://github.com/199-mcp/mcp-google)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Quick Reference

**Essential Commands:**
```bash
# Install
npm install

# Build
npm run build

# Authenticate (first time and when tokens expire)
npm run auth

# Start HTTP server
npm run http-server

# Test server
curl http://localhost:3000/health
```

**File Locations:**
- Credentials: `mcp-google/gcp-oauth.keys.json`
- Tokens: `mcp-google/tokens/` (created automatically)
- Built files: `mcp-google/build/`

**Environment Variables:**
- `PORT` - HTTP server port (default: 3000)
- `GOOGLE_CLIENT_ID` - OAuth client ID (alternative to JSON file)
- `GOOGLE_CLIENT_SECRET` - OAuth client secret (alternative to JSON file)
- `GOOGLE_OAUTH_CREDENTIALS` - Path to credentials JSON file
- `GOOGLE_CALENDAR_MCP_TOKEN_PATH` - Custom token storage path
