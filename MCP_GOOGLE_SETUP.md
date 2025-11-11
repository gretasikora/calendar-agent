# MCP Google HTTP Server Setup Guide

This guide explains how to set up the modified `mcp-google` repository with the HTTP server wrapper that enables Python integration.

## Overview

The `mcp-google` repository has been modified to include:
- **HTTP Server Wrapper** (`src/http-server.ts`) - Exposes MCP functionality via HTTP API
- **Build Script Updates** - Compiles the HTTP server alongside the main MCP server
- **Enhanced FreeBusy Response** - Returns raw calendar data for programmatic access

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Google Cloud Project with OAuth 2.0 credentials
- Google Calendar API enabled

## Step 1: Clone and Install

```bash
# Clone the mcp-google repository
git clone https://github.com/199-mcp/mcp-google.git
cd mcp-google

# Install dependencies
npm install
```

## Step 2: Set Up Google OAuth Credentials

1. **Create OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google Calendar API
   - Create OAuth 2.0 credentials (Desktop app type)
   - Download the credentials JSON file

2. **Configure Credentials:**
   ```bash
   # Copy the example file
   cp gcp-oauth.keys.example.json gcp-oauth.keys.json
   
   # Edit gcp-oauth.keys.json and add your credentials:
   {
     "web": {
       "client_id": "YOUR_CLIENT_ID",
       "project_id": "YOUR_PROJECT_ID",
       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
       "token_uri": "https://oauth2.googleapis.com/token",
       "client_secret": "YOUR_CLIENT_SECRET",
       "redirect_uris": ["http://localhost"]
     }
   }
   ```

## Step 3: Build the Project

```bash
# Build all components (main server, auth server, and HTTP server)
npm run build
```

This will compile:
- `build/index.js` - Main MCP server
- `build/auth-server.js` - OAuth authentication server
- `build/http-server.js` - HTTP wrapper server (NEW)

## Step 4: Authenticate

```bash
# Run the authentication server
npm run auth
```

This will:
1. Open a browser window for Google OAuth
2. Ask you to sign in and grant permissions
3. Save the tokens for future use

## Step 5: Start the HTTP Server

```bash
# Start the HTTP server (defaults to port 3000)
npm run http-server

# Or specify a custom port
PORT=8080 npm run http-server
```

The server will start on `http://localhost:3000` (or your specified port).

## Step 6: Verify the Server

```bash
# Test the health endpoint
curl http://localhost:3000/health

# Should return: {"status":"ok"}
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status.

### Calendar Operations
```
POST /mcp/calendar
```

**Request Body:**
```json
{
  "user_id": "optional-user-id",
  "action": "freebusy",
  "params": {
    "timeMin": "2025-01-15T09:00:00Z",
    "timeMax": "2025-01-15T17:00:00Z",
    "items": [{"id": "your-email@gmail.com"}]
  }
}
```

**Supported Actions:**
- `freebusy` - Check calendar availability (returns raw data + busy slots)
- `list-events` - List calendar events
- `create-event` - Create a new event
- `update-event` - Update an existing event
- `delete-event` - Delete an event
- `list-calendars` - List available calendars (used for auto-detecting primary calendar)

**Response Format:**
```json
{
  "content": [...],
  "raw": {...},      // Raw Google API response (for freebusy)
  "busy": [...]      // Extracted busy slots (for freebusy)
}
```

## Modifications Made

### 1. HTTP Server (`src/http-server.ts`)
- Express.js server wrapping MCP functionality
- Maps action names to MCP tool names
- Enhanced freebusy response with raw calendar data
- Error handling and validation

### 2. Build Script (`scripts/build.js`)
- Added `httpServerBuildOptions` to compile HTTP server
- Builds `http-server.js` alongside other components

### 3. Package.json
- Added `http-server` script
- Added `express` and `@types/express` dependencies

## Troubleshooting

### Server won't start
- Ensure you've run `npm run auth` first
- Check that `gcp-oauth.keys.json` exists and is valid
- Verify tokens are saved in the token directory

### Authentication errors
- Re-run `npm run auth` to refresh tokens
- Check that OAuth credentials are correct
- Ensure Google Calendar API is enabled in your project

### Port already in use
```bash
# Use a different port
PORT=8080 npm run http-server
```

## Integration with Python

The HTTP server is designed to work with the `calendar-agent` Python project. Set the `MCP_URL` environment variable:

```bash
export MCP_URL=http://localhost:3000/mcp/calendar
```

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

## Additional Resources

- [Original mcp-google Repository](https://github.com/199-mcp/mcp-google)
- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [Model Context Protocol](https://modelcontextprotocol.io/)

