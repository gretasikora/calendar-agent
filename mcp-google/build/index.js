#!/usr/bin/env node


// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath as fileURLToPath2 } from "url";
import { readFileSync } from "fs";
import { join as join2, dirname as dirname3 } from "path";

// src/auth/client.ts
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs/promises";

// src/auth/utils.ts
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
function getProjectRoot() {
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.join(__dirname2, "..");
  return path.resolve(projectRoot);
}
function getSecureTokenPath() {
  const customTokenPath = process.env.GOOGLE_CALENDAR_MCP_TOKEN_PATH;
  if (customTokenPath) {
    return path.resolve(customTokenPath);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const tokenDir = path.join(configHome, "google-calendar-mcp");
  return path.join(tokenDir, "tokens.json");
}
function getLegacyTokenPath() {
  const projectRoot = getProjectRoot();
  return path.join(projectRoot, ".gcp-saved-tokens.json");
}
function getKeysFilePath() {
  const envCredentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;
  if (envCredentialsPath) {
    return path.resolve(envCredentialsPath);
  }
  const projectRoot = getProjectRoot();
  const keysPath = path.join(projectRoot, "gcp-oauth.keys.json");
  return keysPath;
}
function generateCredentialsErrorMessage() {
  return `
OAuth credentials not found. Please provide credentials using one of these methods:

1. Direct environment variables (simplest - no JSON file needed!):
   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
   export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   export GOOGLE_CLIENT_SECRET="your-client-secret"

2. Credentials file via environment variable:
   Set GOOGLE_OAUTH_CREDENTIALS to the path of your credentials file:
   export GOOGLE_OAUTH_CREDENTIALS="/path/to/gcp-oauth.keys.json"

3. Default file path:
   Place your gcp-oauth.keys.json file in the package root directory.

Token storage:
- Tokens are saved to: ${getSecureTokenPath()}
- To use a custom token location, set GOOGLE_CALENDAR_MCP_TOKEN_PATH environment variable

To get OAuth credentials:
1. Go to the Google Cloud Console (https://console.cloud.google.com/)
2. Create or select a project
3. Enable these APIs:
   - Google Calendar API
   - Google People API
   - Gmail API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Copy the Client ID and Client Secret
`.trim();
}

// src/auth/client.ts
async function loadCredentialsFromFile() {
  const keysContent = await fs.readFile(getKeysFilePath(), "utf-8");
  const keys = JSON.parse(keysContent);
  if (keys.installed) {
    const { client_id, client_secret, redirect_uris } = keys.installed;
    return { client_id, client_secret, redirect_uris };
  } else if (keys.client_id && keys.client_secret) {
    return {
      client_id: keys.client_id,
      client_secret: keys.client_secret,
      redirect_uris: keys.redirect_uris || ["http://localhost:3000/oauth2callback"]
    };
  } else {
    throw new Error('Invalid credentials file format. Expected either "installed" object or direct client_id/client_secret fields.');
  }
}
async function loadCredentialsWithFallback() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: ["http://localhost:3000/oauth2callback"]
    };
  }
  try {
    return await loadCredentialsFromFile();
  } catch (fileError) {
    const errorMessage = generateCredentialsErrorMessage();
    throw new Error(`${errorMessage}

Original error: ${fileError instanceof Error ? fileError.message : fileError}`);
  }
}
async function initializeOAuth2Client() {
  try {
    const credentials = await loadCredentialsWithFallback();
    const oauth2Client2 = new OAuth2Client({
      clientId: credentials.client_id,
      clientSecret: credentials.client_secret,
      redirectUri: credentials.redirect_uris[0]
    });
    return oauth2Client2;
  } catch (error) {
    throw new Error(`Error loading OAuth keys: ${error instanceof Error ? error.message : error}`);
  }
}
async function loadCredentials() {
  try {
    const credentials = await loadCredentialsWithFallback();
    if (!credentials.client_id || !credentials.client_secret) {
      throw new Error("Client ID or Client Secret missing in credentials.");
    }
    return {
      client_id: credentials.client_id,
      client_secret: credentials.client_secret
    };
  } catch (error) {
    throw new Error(`Error loading credentials: ${error instanceof Error ? error.message : error}`);
  }
}

// src/auth/server.ts
import express from "express";
import { OAuth2Client as OAuth2Client2 } from "google-auth-library";

// src/auth/tokenManager.ts
import * as fs2 from "fs/promises";
import * as path2 from "path";
import { GaxiosError } from "gaxios";
var TokenManager = class {
  oauth2Client;
  tokenPath;
  constructor(oauth2Client2) {
    this.oauth2Client = oauth2Client2;
    this.tokenPath = getSecureTokenPath();
    this.setupTokenRefresh();
  }
  // Method to expose the token path
  getTokenPath() {
    return this.tokenPath;
  }
  async ensureTokenDirectoryExists() {
    try {
      const dir = path2.dirname(this.tokenPath);
      await fs2.mkdir(dir, { recursive: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code !== "EEXIST") {
        console.error("Failed to create token directory:", error);
        throw error;
      }
    }
  }
  setupTokenRefresh() {
    this.oauth2Client.on("tokens", async (newTokens) => {
      try {
        await this.ensureTokenDirectoryExists();
        const currentTokens = JSON.parse(await fs2.readFile(this.tokenPath, "utf-8"));
        const updatedTokens = {
          ...currentTokens,
          ...newTokens,
          refresh_token: newTokens.refresh_token || currentTokens.refresh_token
        };
        await fs2.writeFile(this.tokenPath, JSON.stringify(updatedTokens, null, 2), {
          mode: 384
        });
        console.error("Tokens updated and saved");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          try {
            await fs2.writeFile(this.tokenPath, JSON.stringify(newTokens, null, 2), { mode: 384 });
            console.error("New tokens saved");
          } catch (writeError) {
            console.error("Error saving initial tokens:", writeError);
          }
        } else {
          console.error("Error saving updated tokens:", error);
        }
      }
    });
  }
  async migrateLegacyTokens() {
    const legacyPath = getLegacyTokenPath();
    try {
      if (!await fs2.access(legacyPath).then(() => true).catch(() => false)) {
        return false;
      }
      const legacyTokens = JSON.parse(await fs2.readFile(legacyPath, "utf-8"));
      if (!legacyTokens || typeof legacyTokens !== "object") {
        console.error("Invalid legacy token format, skipping migration");
        return false;
      }
      await this.ensureTokenDirectoryExists();
      await fs2.writeFile(this.tokenPath, JSON.stringify(legacyTokens, null, 2), {
        mode: 384
      });
      console.error("Migrated tokens from legacy location:", legacyPath, "to:", this.tokenPath);
      try {
        await fs2.unlink(legacyPath);
        console.error("Removed legacy token file");
      } catch (unlinkErr) {
        console.error("Warning: Could not remove legacy token file:", unlinkErr);
      }
      return true;
    } catch (error) {
      console.error("Error migrating legacy tokens:", error);
      return false;
    }
  }
  async loadSavedTokens() {
    try {
      const envTokens = process.env.GOOGLE_CALENDAR_TOKENS;
      if (envTokens) {
        try {
          const tokens2 = JSON.parse(envTokens);
          if (tokens2 && typeof tokens2 === "object") {
            this.oauth2Client.setCredentials(tokens2);
            console.log("Loaded tokens from environment variable");
            return true;
          }
        } catch (parseError) {
          console.error("Error parsing tokens from environment variable:", parseError);
        }
      }
      await this.ensureTokenDirectoryExists();
      const tokenExists = await fs2.access(this.tokenPath).then(() => true).catch(() => false);
      if (!tokenExists) {
        const migrated = await this.migrateLegacyTokens();
        if (!migrated) {
          console.error("No token file found at:", this.tokenPath);
          return false;
        }
      }
      const tokens = JSON.parse(await fs2.readFile(this.tokenPath, "utf-8"));
      if (!tokens || typeof tokens !== "object") {
        console.error("Invalid token format in file:", this.tokenPath);
        return false;
      }
      this.oauth2Client.setCredentials(tokens);
      return true;
    } catch (error) {
      console.error("Error loading tokens:", error);
      if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
        try {
          await fs2.unlink(this.tokenPath);
          console.error("Removed potentially corrupted token file");
        } catch (unlinkErr) {
        }
      }
      return false;
    }
  }
  async refreshTokensIfNeeded() {
    const expiryDate = this.oauth2Client.credentials.expiry_date;
    const isExpired = expiryDate ? Date.now() >= expiryDate - 5 * 60 * 1e3 : !this.oauth2Client.credentials.access_token;
    if (isExpired && this.oauth2Client.credentials.refresh_token) {
      console.error("Auth token expired or nearing expiry, refreshing...");
      try {
        const response = await this.oauth2Client.refreshAccessToken();
        const newTokens = response.credentials;
        if (!newTokens.access_token) {
          throw new Error("Received invalid tokens during refresh");
        }
        this.oauth2Client.setCredentials(newTokens);
        console.error("Token refreshed successfully");
        return true;
      } catch (refreshError) {
        if (refreshError instanceof GaxiosError && refreshError.response?.data?.error === "invalid_grant") {
          console.error("Error refreshing auth token: Invalid grant. Token likely expired or revoked. Please re-authenticate.");
          return false;
        } else {
          console.error("Error refreshing auth token:", refreshError);
          return false;
        }
      }
    } else if (!this.oauth2Client.credentials.access_token && !this.oauth2Client.credentials.refresh_token) {
      console.error("No access or refresh token available. Please re-authenticate.");
      return false;
    } else {
      return true;
    }
  }
  async validateTokens() {
    if (!this.oauth2Client.credentials || !this.oauth2Client.credentials.access_token) {
      if (!await this.loadSavedTokens()) {
        return false;
      }
      if (!this.oauth2Client.credentials || !this.oauth2Client.credentials.access_token) {
        return false;
      }
    }
    return this.refreshTokensIfNeeded();
  }
  async saveTokens(tokens) {
    try {
      await this.ensureTokenDirectoryExists();
      await fs2.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 384 });
      this.oauth2Client.setCredentials(tokens);
      console.error("Tokens saved successfully to:", this.tokenPath);
    } catch (error) {
      console.error("Error saving tokens:", error);
      throw error;
    }
  }
  async clearTokens() {
    try {
      this.oauth2Client.setCredentials({});
      await fs2.unlink(this.tokenPath);
      console.error("Tokens cleared successfully");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        console.error("Token file already deleted");
      } else {
        console.error("Error clearing tokens:", error);
      }
    }
  }
};

// src/auth/server.ts
import open from "open";
var AuthServer = class {
  baseOAuth2Client;
  // Used by TokenManager for validation/refresh
  flowOAuth2Client = null;
  // Used specifically for the auth code flow
  app;
  server = null;
  tokenManager;
  portRange;
  authCompletedSuccessfully = false;
  // Flag for standalone script
  constructor(oauth2Client2) {
    this.baseOAuth2Client = oauth2Client2;
    this.tokenManager = new TokenManager(oauth2Client2);
    this.app = express();
    this.portRange = { start: 3e3, end: 3004 };
    this.setupRoutes();
  }
  setupRoutes() {
    this.app.get("/", (req, res) => {
      const clientForUrl = this.flowOAuth2Client || this.baseOAuth2Client;
      const scopes = [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/contacts",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.labels"
      ];
      const authUrl = clientForUrl.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent"
      });
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Google Workspace MCP Authentication</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #f5f5f5; margin: 0; padding: 20px; }
                .container { text-align: center; padding: 2.5em; background-color: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; }
                h1 { color: #1a73e8; margin-bottom: 0.5em; }
                h2 { color: #333; font-weight: normal; font-size: 1.2em; margin-bottom: 1.5em; }
                p { color: #666; line-height: 1.6; margin-bottom: 1.5em; }
                .btn { display: inline-block; background-color: #1a73e8; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500; transition: background-color 0.2s; }
                .btn:hover { background-color: #1557b0; }
                .permissions { background-color: #f8f9fa; padding: 1em; border-radius: 8px; margin: 1.5em 0; text-align: left; }
                .permissions h3 { margin: 0 0 0.5em 0; font-size: 1em; color: #333; }
                .permissions ul { margin: 0; padding-left: 1.5em; color: #666; }
                .permissions li { margin: 0.3em 0; }
                .footer { margin-top: 2em; font-size: 0.9em; color: #999; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>\u{1F5D3}\uFE0F Google Workspace MCP</h1>
                <h2>Authentication Required</h2>
                <p>Claude Desktop needs permission to access your Google Calendar, Contacts, and Gmail.</p>
                
                <div class="permissions">
                    <h3>This will allow Claude to:</h3>
                    <ul>
                        <li>View your calendar events</li>
                        <li>Create new calendar events</li>
                        <li>Update existing events</li>
                        <li>Delete events</li>
                        <li>Check your availability</li>
                        <li>View and manage your contacts</li>
                        <li>Create new contacts</li>
                        <li>Update existing contacts</li>
                        <li>Delete contacts</li>
                        <li>Read and search your emails</li>
                        <li>Send emails on your behalf</li>
                        <li>Create and manage email drafts</li>
                        <li>Organize emails with labels</li>
                        <li>Mark emails as read/unread</li>
                    </ul>
                </div>
                
                <a href="${authUrl}" class="btn">Connect Google Workspace</a>
                
                <p class="footer">You'll be redirected to Google to sign in securely.<br>Your credentials are never stored by this application.</p>
            </div>
        </body>
        </html>
      `);
    });
    this.app.get("/oauth2callback", async (req, res) => {
      const code = req.query.code;
      if (!code) {
        res.status(400).send("Authorization code missing");
        return;
      }
      if (!this.flowOAuth2Client) {
        res.status(500).send("Authentication flow not properly initiated.");
        return;
      }
      try {
        const { tokens } = await this.flowOAuth2Client.getToken(code);
        await this.tokenManager.saveTokens(tokens);
        this.authCompletedSuccessfully = true;
        const tokenPath = this.tokenManager.getTokenPath();
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Authentication Successful</title>
              <style>
                  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f4f4f4; margin: 0; }
                  .container { text-align: center; padding: 2em; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                  h1 { color: #4CAF50; }
                  p { color: #333; margin-bottom: 0.5em; }
                  code { background-color: #eee; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
              </style>
          </head>
          <body>
              <div class="container">
                  <h1>Authentication Successful!</h1>
                  <p>Your authentication tokens have been saved successfully to:</p>
                  <p><code>${tokenPath}</code></p>
                  <p>You can now close this browser window.</p>
              </div>
          </body>
          </html>
        `);
      } catch (error) {
        this.authCompletedSuccessfully = false;
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Authentication Failed</title>
              <style>
                  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f4f4f4; margin: 0; }
                  .container { text-align: center; padding: 2em; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                  h1 { color: #F44336; }
                  p { color: #333; }
              </style>
          </head>
          <body>
              <div class="container">
                  <h1>Authentication Failed</h1>
                  <p>An error occurred during authentication:</p>
                  <p><code>${message}</code></p>
                  <p>Please try again or check the server logs.</p>
              </div>
          </body>
          </html>
        `);
      }
    });
  }
  async start(openBrowser = true) {
    if (await this.tokenManager.validateTokens()) {
      this.authCompletedSuccessfully = true;
      return true;
    }
    const port = await this.startServerOnAvailablePort();
    if (port === null) {
      this.authCompletedSuccessfully = false;
      return false;
    }
    try {
      const { client_id, client_secret } = await loadCredentials();
      this.flowOAuth2Client = new OAuth2Client2(
        client_id,
        client_secret,
        `http://localhost:${port}/oauth2callback`
      );
    } catch (error) {
      this.authCompletedSuccessfully = false;
      await this.stop();
      return false;
    }
    if (openBrowser) {
      const authorizeUrl = this.flowOAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/contacts",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.labels"
        ],
        prompt: "consent"
      });
      await open(authorizeUrl);
    }
    return true;
  }
  async startServerOnAvailablePort() {
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      try {
        await new Promise((resolve2, reject) => {
          const testServer = this.app.listen(port, () => {
            this.server = testServer;
            resolve2();
          });
          testServer.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
              testServer.close(() => reject(err));
            } else {
              reject(err);
            }
          });
        });
        return port;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EADDRINUSE")) {
          return null;
        }
      }
    }
    return null;
  }
  getRunningPort() {
    if (this.server) {
      const address = this.server.address();
      if (typeof address === "object" && address !== null) {
        return address.port;
      }
    }
    return null;
  }
  async stop() {
    return new Promise((resolve2, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.server = null;
            resolve2();
          }
        });
      } else {
        resolve2();
      }
    });
  }
};

// src/handlers/listTools.ts
var remindersInputProperty = {
  type: "object",
  description: "Reminder settings for the event",
  properties: {
    useDefault: {
      type: "boolean",
      description: "Whether to use the default reminders"
    },
    overrides: {
      type: "array",
      description: "Custom reminders (uses popup notifications by default unless email is specified)",
      items: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["email", "popup"],
            description: "Reminder method (defaults to popup unless email is specified)",
            default: "popup"
          },
          minutes: {
            type: "number",
            description: "Minutes before the event to trigger the reminder"
          }
        },
        required: ["minutes"]
      }
    }
  },
  required: ["useDefault"]
};
function getToolDefinitions() {
  return {
    tools: [
      {
        name: "list-calendars",
        description: "List user calendars. Returns: array of calendar objects with id, summary, accessRole, backgroundColor, primary. Use when: showing available calendars or finding calendar ID. Note: 'primary' for main calendar.",
        inputSchema: {
          type: "object",
          properties: {},
          // No arguments needed
          required: []
        }
      },
      {
        name: "list-events",
        description: "List calendar events. Returns: array of event objects with id, summary, start, end, status, recurrence. Use when: viewing schedule, finding events. Note: supports batch (up to 50 calendars).",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              oneOf: [
                {
                  type: "string",
                  description: "ID of a single calendar"
                },
                {
                  type: "array",
                  description: "Array of calendar IDs",
                  items: {
                    type: "string"
                  },
                  minItems: 1,
                  maxItems: 50
                }
              ],
              description: "ID of the calendar(s) to list events from (use 'primary' for the main calendar)"
            },
            timeMin: {
              type: "string",
              format: "date-time",
              description: "Start time in ISO format with timezone required (e.g., 2024-01-01T00:00:00Z or 2024-01-01T00:00:00+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            },
            timeMax: {
              type: "string",
              format: "date-time",
              description: "End time in ISO format with timezone required (e.g., 2024-12-31T23:59:59Z or 2024-12-31T23:59:59+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            }
          },
          required: ["calendarId"]
        }
      },
      {
        name: "search-events",
        description: "Search events by text. Returns: filtered array of events matching query in summary/description/location. Use when: finding specific events by keyword. Note: single calendar only.",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar to search events in (use 'primary' for the main calendar)"
            },
            query: {
              type: "string",
              description: "Free text search query (searches summary, description, location, attendees, etc.)"
            },
            timeMin: {
              type: "string",
              format: "date-time",
              description: "Start time boundary in ISO format with timezone required (e.g., 2024-01-01T00:00:00Z or 2024-01-01T00:00:00+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            },
            timeMax: {
              type: "string",
              format: "date-time",
              description: "End time boundary in ISO format with timezone required (e.g., 2024-12-31T23:59:59Z or 2024-12-31T23:59:59+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            }
          },
          required: ["calendarId", "query"]
        }
      },
      {
        name: "list-colors",
        description: "Get color palette. Returns: event colors (1-11) and calendar colors with hex values. Use when: displaying color options for event/calendar styling. Note: colorId is string.",
        inputSchema: {
          type: "object",
          properties: {},
          // No arguments needed
          required: []
        }
      },
      {
        name: "create-event",
        description: "Create calendar event. Returns: created event with id, htmlLink, start, end, status. Use when: scheduling new appointments/meetings. Note: supports recurring events via recurrence.",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar to create the event in (use 'primary' for the main calendar)"
            },
            summary: {
              type: "string",
              description: "Title of the event"
            },
            description: {
              type: "string",
              description: "Description/notes for the event (optional)"
            },
            start: {
              type: "string",
              format: "date-time",
              description: "Start time in ISO format with timezone required (e.g., 2024-08-15T10:00:00Z or 2024-08-15T10:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            },
            end: {
              type: "string",
              format: "date-time",
              description: "End time in ISO format with timezone required (e.g., 2024-08-15T11:00:00Z or 2024-08-15T11:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            },
            timeZone: {
              type: "string",
              description: "Timezone of the event start/end times, formatted as an IANA Time Zone Database name (e.g., America/Los_Angeles). Required if start/end times are specified, especially for recurring events."
            },
            location: {
              type: "string",
              description: "Location of the event (optional)"
            },
            attendees: {
              type: "array",
              description: "List of attendee email addresses (optional)",
              items: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address of the attendee"
                  }
                },
                required: ["email"]
              }
            },
            colorId: {
              type: "string",
              description: "Color ID for the event (optional, use list-colors to see available IDs)"
            },
            reminders: remindersInputProperty,
            recurrence: {
              type: "array",
              description: 'List of recurrence rules (RRULE, EXRULE, RDATE, EXDATE) in RFC5545 format (optional). Example: ["RRULE:FREQ=WEEKLY;COUNT=5"]',
              items: {
                type: "string"
              }
            }
          },
          required: ["calendarId", "summary", "start", "end", "timeZone"]
        }
      },
      {
        name: "update-event",
        description: "Modify existing event. Returns: updated event with id, summary, start, end. Use when: rescheduling, changing details. Note: supports recurring event scopes (single/all/future).",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar containing the event"
            },
            eventId: {
              type: "string",
              description: "ID of the event to update"
            },
            summary: {
              type: "string",
              description: "New title for the event (optional)"
            },
            description: {
              type: "string",
              description: "New description for the event (optional)"
            },
            start: {
              type: "string",
              format: "date-time",
              description: "New start time in ISO format with timezone required (e.g., 2024-08-15T10:00:00Z or 2024-08-15T10:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            },
            end: {
              type: "string",
              format: "date-time",
              description: "New end time in ISO format with timezone required (e.g., 2024-08-15T11:00:00Z or 2024-08-15T11:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset."
            },
            timeZone: {
              type: "string",
              description: "Timezone for the start/end times (IANA format, e.g., America/Los_Angeles). Required if modifying start/end, or for recurring events."
            },
            location: {
              type: "string",
              description: "New location for the event (optional)"
            },
            colorId: {
              type: "string",
              description: "New color ID for the event (optional)"
            },
            attendees: {
              type: "array",
              description: "New list of attendee email addresses (optional, replaces existing attendees)",
              items: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address of the attendee"
                  }
                },
                required: ["email"]
              }
            },
            reminders: {
              ...remindersInputProperty,
              description: "New reminder settings for the event (optional)"
            },
            recurrence: {
              type: "array",
              description: 'New list of recurrence rules (RFC5545 format, optional, replaces existing rules). Example: ["RRULE:FREQ=DAILY;COUNT=10"]',
              items: {
                type: "string"
              }
            },
            modificationScope: {
              type: "string",
              enum: ["single", "all", "future"],
              default: "all",
              description: "Scope of modification for recurring events: 'single' (one instance), 'all' (entire series), 'future' (this and future instances). Defaults to 'all' for backward compatibility."
            },
            originalStartTime: {
              type: "string",
              format: "date-time",
              description: "Required when modificationScope is 'single'. Original start time of the specific instance to modify in ISO format with timezone (e.g., 2024-08-15T10:00:00-07:00)."
            },
            futureStartDate: {
              type: "string",
              format: "date-time",
              description: "Required when modificationScope is 'future'. Start date for future modifications in ISO format with timezone (e.g., 2024-08-20T10:00:00-07:00). Must be a future date."
            }
          },
          required: ["calendarId", "eventId", "timeZone"],
          // timeZone is technically required for PATCH
          allOf: [
            {
              if: {
                properties: {
                  modificationScope: { const: "single" }
                }
              },
              then: {
                required: ["originalStartTime"]
              }
            },
            {
              if: {
                properties: {
                  modificationScope: { const: "future" }
                }
              },
              then: {
                required: ["futureStartDate"]
              }
            }
          ]
        }
      },
      {
        name: "delete-event",
        description: "Remove event from calendar. Returns: empty on success. Use when: canceling appointments. Note: permanent deletion, not recoverable.",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar containing the event"
            },
            eventId: {
              type: "string",
              description: "ID of the event to delete"
            }
          },
          required: ["calendarId", "eventId"]
        }
      },
      {
        name: "get-freebusy",
        description: "Check calendar availability. Returns: busy time blocks per calendar. Use when: finding available slots, scheduling across calendars. Note: only shows busy/free, not event details.",
        inputSchema: {
          type: "object",
          properties: {
            timeMin: {
              type: "string",
              description: "The start of the interval in RFC3339 format"
            },
            timeMax: {
              type: "string",
              description: "The end of the interval in RFC3339 format"
            },
            timeZone: {
              type: "string",
              description: "Optional. Time zone used in the response (default is UTC)"
            },
            groupExpansionMax: {
              type: "integer",
              description: "Optional. Maximum number of calendar identifiers to expand per group (max 100)"
            },
            calendarExpansionMax: {
              type: "integer",
              description: "Optional. Maximum number of calendars to expand (max 50)"
            },
            items: {
              type: "array",
              description: "List of calendar or group identifiers to check for availability",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "The identifier of a calendar or group, it usually is a mail format"
                  }
                },
                required: ["id"]
              }
            }
          },
          required: ["timeMin", "timeMax", "items"]
        }
      },
      {
        name: "list-contacts",
        description: "List Google Contacts. Returns: array with resourceName, names, emailAddresses, phoneNumbers per contact. Use when: viewing contact list, searching by name. Note: use personFields to limit data.",
        inputSchema: {
          type: "object",
          properties: {
            pageSize: {
              type: "number",
              description: "Maximum number of contacts to return (default: 100, max: 2000)"
            },
            pageToken: {
              type: "string",
              description: "Token for pagination to get the next page of results"
            },
            query: {
              type: "string",
              description: "Optional search query to filter contacts"
            },
            personFields: {
              type: "array",
              description: "Fields to include in the response (default: names,emailAddresses,phoneNumbers,addresses,organizations,biographies,photos)",
              items: {
                type: "string",
                enum: ["addresses", "ageRanges", "biographies", "birthdays", "calendarUrls", "clientData", "coverPhotos", "emailAddresses", "events", "externalIds", "genders", "imClients", "interests", "locales", "locations", "memberships", "metadata", "miscKeywords", "names", "nicknames", "occupations", "organizations", "phoneNumbers", "photos", "relations", "sipAddresses", "skills", "urls", "userDefined"]
              }
            },
            sources: {
              type: "array",
              description: "Sources to get contacts from (default: READ_SOURCE_TYPE_CONTACT)",
              items: {
                type: "string",
                enum: ["READ_SOURCE_TYPE_CONTACT", "READ_SOURCE_TYPE_PROFILE", "READ_SOURCE_TYPE_DOMAIN_PROFILE", "READ_SOURCE_TYPE_OTHER_CONTACT"]
              }
            }
          },
          required: []
        }
      },
      {
        name: "get-contact",
        description: "Retrieve one contact by resourceName. Returns: full contact with all requested fields. Use when: viewing detailed contact info. Note: resourceName format is 'people/c[ID]'.",
        inputSchema: {
          type: "object",
          properties: {
            resourceName: {
              type: "string",
              description: "Resource name of the contact (e.g., 'people/c1234567890')"
            },
            personFields: {
              type: "array",
              description: "Fields to include in the response",
              items: {
                type: "string",
                enum: ["addresses", "ageRanges", "biographies", "birthdays", "calendarUrls", "clientData", "coverPhotos", "emailAddresses", "events", "externalIds", "genders", "imClients", "interests", "locales", "locations", "memberships", "metadata", "miscKeywords", "names", "nicknames", "occupations", "organizations", "phoneNumbers", "photos", "relations", "sipAddresses", "skills", "urls", "userDefined"]
              }
            }
          },
          required: ["resourceName"]
        }
      },
      {
        name: "create-contact",
        description: "Create new contact. Returns: created contact with resourceName, etag, metadata. Use when: adding new person to contacts. Note: returns new resourceName for future operations.",
        inputSchema: {
          type: "object",
          properties: {
            givenName: {
              type: "string",
              description: "First name of the contact"
            },
            familyName: {
              type: "string",
              description: "Last name of the contact"
            },
            middleName: {
              type: "string",
              description: "Middle name of the contact"
            },
            displayName: {
              type: "string",
              description: "Display name (defaults to 'givenName familyName' if not provided)"
            },
            emailAddresses: {
              type: "array",
              description: "Email addresses for the contact",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    format: "email",
                    description: "Email address"
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of email address (default: home)"
                  }
                },
                required: ["value"]
              }
            },
            phoneNumbers: {
              type: "array",
              description: "Phone numbers for the contact",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Phone number"
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "mobile", "homeFax", "workFax", "otherFax", "pager", "workMobile", "workPager", "main", "googleVoice", "other"],
                    description: "Type of phone number (default: home)"
                  }
                },
                required: ["value"]
              }
            },
            addresses: {
              type: "array",
              description: "Physical addresses for the contact",
              items: {
                type: "object",
                properties: {
                  streetAddress: {
                    type: "string",
                    description: "Street address"
                  },
                  city: {
                    type: "string",
                    description: "City"
                  },
                  region: {
                    type: "string",
                    description: "State or region"
                  },
                  postalCode: {
                    type: "string",
                    description: "Postal or ZIP code"
                  },
                  country: {
                    type: "string",
                    description: "Country"
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of address (default: home)"
                  }
                }
              }
            },
            organizations: {
              type: "array",
              description: "Organizations/companies for the contact",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Organization name"
                  },
                  title: {
                    type: "string",
                    description: "Job title"
                  },
                  department: {
                    type: "string",
                    description: "Department"
                  },
                  type: {
                    type: "string",
                    enum: ["work", "school", "other"],
                    description: "Type of organization (default: work)"
                  }
                }
              }
            },
            biographies: {
              type: "array",
              description: "Biographical information",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Biography text"
                  },
                  contentType: {
                    type: "string",
                    enum: ["TEXT_PLAIN", "TEXT_HTML"],
                    description: "Content type (default: TEXT_PLAIN)"
                  }
                },
                required: ["value"]
              }
            },
            notes: {
              type: "string",
              description: "Notes about the contact (will be added as a biography if biographies not provided)"
            }
          },
          required: []
        }
      },
      {
        name: "update-contact",
        description: "Modify existing contact. Returns: updated contact with new etag. Use when: changing contact details. Note: requires updatePersonFields to specify what to update.",
        inputSchema: {
          type: "object",
          properties: {
            resourceName: {
              type: "string",
              description: "Resource name of the contact to update (e.g., 'people/c1234567890')"
            },
            updatePersonFields: {
              type: "array",
              description: "Fields to update (must specify which fields are being updated)",
              items: {
                type: "string",
                enum: ["names", "emailAddresses", "phoneNumbers", "addresses", "organizations", "biographies"]
              }
            },
            givenName: {
              type: "string",
              description: "First name (required if updating names)"
            },
            familyName: {
              type: "string",
              description: "Last name (required if updating names)"
            },
            middleName: {
              type: "string",
              description: "Middle name"
            },
            displayName: {
              type: "string",
              description: "Display name"
            },
            emailAddresses: {
              type: "array",
              description: "Email addresses (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    format: "email",
                    description: "Email address"
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of email address"
                  }
                },
                required: ["value"]
              }
            },
            phoneNumbers: {
              type: "array",
              description: "Phone numbers (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Phone number"
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "mobile", "homeFax", "workFax", "otherFax", "pager", "workMobile", "workPager", "main", "googleVoice", "other"],
                    description: "Type of phone number"
                  }
                },
                required: ["value"]
              }
            },
            addresses: {
              type: "array",
              description: "Physical addresses (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  streetAddress: {
                    type: "string",
                    description: "Street address"
                  },
                  city: {
                    type: "string",
                    description: "City"
                  },
                  region: {
                    type: "string",
                    description: "State or region"
                  },
                  postalCode: {
                    type: "string",
                    description: "Postal or ZIP code"
                  },
                  country: {
                    type: "string",
                    description: "Country"
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of address"
                  }
                }
              }
            },
            organizations: {
              type: "array",
              description: "Organizations (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Organization name"
                  },
                  title: {
                    type: "string",
                    description: "Job title"
                  },
                  department: {
                    type: "string",
                    description: "Department"
                  },
                  type: {
                    type: "string",
                    enum: ["work", "school", "other"],
                    description: "Type of organization"
                  }
                }
              }
            },
            biographies: {
              type: "array",
              description: "Biographical information (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Biography text"
                  },
                  contentType: {
                    type: "string",
                    enum: ["TEXT_PLAIN", "TEXT_HTML"],
                    description: "Content type"
                  }
                },
                required: ["value"]
              }
            }
          },
          required: ["resourceName", "updatePersonFields"]
        }
      },
      {
        name: "delete-contact",
        description: "Remove contact permanently. Returns: empty on success. Use when: deleting person from contacts. Note: permanent deletion, use resourceName from list/get.",
        inputSchema: {
          type: "object",
          properties: {
            resourceName: {
              type: "string",
              description: "Resource name of the contact to delete (e.g., 'people/c1234567890')"
            }
          },
          required: ["resourceName"]
        }
      },
      {
        name: "list-emails",
        description: "Search emails in Gmail. Returns: array with id, threadId only (no content/labels). Use when: finding emails to get IDs for other operations. Note: retrieve full content with get-email per ID.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Gmail search operators: 'from:email@domain.com', 'to:email', 'subject:text', 'is:unread', 'is:read', 'is:starred', 'is:important', 'has:attachment', 'in:inbox', 'in:sent', 'after:2024/1/1', 'before:2024/12/31', 'larger:1M', 'smaller:5M'. Combine with spaces for AND, OR for alternatives."
            },
            maxResults: {
              type: "number",
              description: "Maximum number of emails to return (default: 20, max: 500)"
            },
            pageToken: {
              type: "string",
              description: "Token for pagination to get the next page of results"
            },
            includeSpamTrash: {
              type: "boolean",
              description: "Include emails from SPAM and TRASH (default: false)"
            },
            labelIds: {
              type: "array",
              description: "Filter by specific label IDs",
              items: {
                type: "string"
              }
            }
          },
          required: []
        }
      },
      {
        name: "get-email",
        description: "Retrieve one email by messageId. Returns: full message with headers, body (plain/html), attachments metadata. Use when: reading email content after list-emails. Note: messageId from list-emails required.",
        inputSchema: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "The ID of the email message to retrieve"
            },
            markAsRead: {
              type: "boolean",
              description: "Mark the email as read when retrieving (default: true)"
            },
            format: {
              type: "string",
              enum: ["full", "metadata", "minimal"],
              description: "The format to return the message in (default: full)"
            }
          },
          required: ["messageId"]
        }
      },
      {
        name: "send-email",
        description: "Send new email or reply. Returns: sent message id and threadId. Use when: composing new email or replying to thread. For replies: provide replyToMessageId.",
        inputSchema: {
          type: "object",
          properties: {
            to: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "Recipient email address(es)"
            },
            subject: {
              type: "string",
              description: "Email subject line"
            },
            body: {
              type: "string",
              description: "Email body content"
            },
            cc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "CC recipient email address(es)"
            },
            bcc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "BCC recipient email address(es)"
            },
            isHtml: {
              type: "boolean",
              description: "Whether the body is HTML content (default: false)"
            },
            replyToMessageId: {
              type: "string",
              description: "Message ID to reply to (for threading)"
            },
            threadId: {
              type: "string",
              description: "Thread ID to reply within"
            }
          },
          required: ["to", "subject", "body"]
        }
      },
      {
        name: "update-email",
        description: "Modify single email labels/status. Returns: updated message with new labelIds. Use when: marking one email read/unread/starred. For multiple: use batch-update-emails. Labels: UNREAD, STARRED, IMPORTANT, INBOX.",
        inputSchema: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "Message ID from list-emails or get-email response (not email address)"
            },
            addLabelIds: {
              type: "array",
              description: "System labels to add: UNREAD, STARRED, IMPORTANT, INBOX, SPAM, TRASH, or custom label IDs",
              items: { type: "string" }
            },
            removeLabelIds: {
              type: "array",
              description: "System labels to remove: UNREAD, STARRED, IMPORTANT, INBOX (can't remove DRAFTS, SENT)",
              items: { type: "string" }
            },
            markAsRead: {
              type: "boolean",
              description: "Remove UNREAD label (shortcut for removeLabelIds: ['UNREAD'])"
            },
            markAsUnread: {
              type: "boolean",
              description: "Add UNREAD label (shortcut for addLabelIds: ['UNREAD'])"
            },
            star: {
              type: "boolean",
              description: "Star the email"
            },
            unstar: {
              type: "boolean",
              description: "Unstar the email"
            },
            markAsImportant: {
              type: "boolean",
              description: "Mark as important"
            },
            markAsNotImportant: {
              type: "boolean",
              description: "Mark as not important"
            },
            archive: {
              type: "boolean",
              description: "Archive the email (remove from inbox)"
            },
            unarchive: {
              type: "boolean",
              description: "Unarchive the email (add to inbox)"
            },
            moveToTrash: {
              type: "boolean",
              description: "Move to trash"
            },
            removeFromTrash: {
              type: "boolean",
              description: "Remove from trash"
            }
          },
          required: ["messageId"]
        }
      },
      {
        name: "delete-email",
        description: "Move email to trash or delete permanently. Returns: success status. Use when: removing emails. Default: trash (recoverable). Set permanent=true for unrecoverable deletion.",
        inputSchema: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "Message ID from list-emails or get-email response"
            },
            permanent: {
              type: "boolean",
              description: "Permanently delete instead of moving to trash (default: false)"
            }
          },
          required: ["messageId"]
        }
      },
      {
        name: "create-draft",
        description: "Create unsent email draft. Returns: draft id and message. Use when: composing email for later editing/sending. Not for immediate send - use send-email instead.",
        inputSchema: {
          type: "object",
          properties: {
            to: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "Recipient email address(es)"
            },
            subject: {
              type: "string",
              description: "Email subject line"
            },
            body: {
              type: "string",
              description: "Email body content"
            },
            cc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "CC recipient email address(es)"
            },
            bcc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "BCC recipient email address(es)"
            },
            isHtml: {
              type: "boolean",
              description: "Whether the body is HTML content (default: false)"
            },
            replyToMessageId: {
              type: "string",
              description: "Message ID to reply to (for threading)"
            },
            threadId: {
              type: "string",
              description: "Thread ID to reply within"
            }
          },
          required: ["to", "subject", "body"]
        }
      },
      {
        name: "update-draft",
        description: "Modify existing draft. Returns: updated draft with id, message. Use when: editing unsent draft content. Note: replaces entire draft content.",
        inputSchema: {
          type: "object",
          properties: {
            draftId: {
              type: "string",
              description: "The ID of the draft to update"
            },
            to: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "Recipient email address(es)"
            },
            subject: {
              type: "string",
              description: "Email subject line"
            },
            body: {
              type: "string",
              description: "Email body content"
            },
            cc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "CC recipient email address(es)"
            },
            bcc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "BCC recipient email address(es)"
            },
            isHtml: {
              type: "boolean",
              description: "Whether the body is HTML content (default: false)"
            },
            replyToMessageId: {
              type: "string",
              description: "Message ID to reply to (for threading)"
            },
            threadId: {
              type: "string",
              description: "Thread ID to reply within"
            }
          },
          required: ["draftId", "to", "subject", "body"]
        }
      },
      {
        name: "send-draft",
        description: "Send saved draft. Returns: sent message with id, threadId, labelIds. Use when: sending previously created draft. Note: draft is deleted after sending.",
        inputSchema: {
          type: "object",
          properties: {
            draftId: {
              type: "string",
              description: "The ID of the draft to send"
            }
          },
          required: ["draftId"]
        }
      },
      {
        name: "list-labels",
        description: "List Gmail labels. Returns: array with id, name, type (system/user). Use when: showing folder structure, finding label IDs. Note: includes system labels like INBOX, SENT.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "create-label",
        description: "Create custom label. Returns: new label with id, name, type='user'. Use when: organizing emails with new categories. Note: can't create system labels.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the label"
            },
            messageListVisibility: {
              type: "string",
              enum: ["show", "hide"],
              description: "Whether to show messages with this label in message lists (default: show)"
            },
            labelListVisibility: {
              type: "string",
              enum: ["labelShow", "labelShowIfUnread", "labelHide"],
              description: "Whether to show this label in the label list (default: labelShow)"
            },
            backgroundColor: {
              type: "string",
              description: "Background color for the label (hex color like '#0000FF')"
            },
            textColor: {
              type: "string",
              description: "Text color for the label (hex color like '#FFFFFF')"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "update-label",
        description: "Modify label properties. Returns: updated label. Use when: renaming labels, changing visibility. Note: can't modify system labels.",
        inputSchema: {
          type: "object",
          properties: {
            labelId: {
              type: "string",
              description: "The ID of the label to update"
            },
            name: {
              type: "string",
              description: "New name for the label"
            },
            messageListVisibility: {
              type: "string",
              enum: ["show", "hide"],
              description: "Whether to show messages with this label in message lists"
            },
            labelListVisibility: {
              type: "string",
              enum: ["labelShow", "labelShowIfUnread", "labelHide"],
              description: "Whether to show this label in the label list"
            },
            backgroundColor: {
              type: "string",
              description: "Background color for the label (hex color)"
            },
            textColor: {
              type: "string",
              description: "Text color for the label (hex color)"
            }
          },
          required: ["labelId"]
        }
      },
      {
        name: "delete-label",
        description: "Remove custom label. Returns: empty on success. Use when: cleaning up unused labels. Note: can't delete system labels, emails keep label reference.",
        inputSchema: {
          type: "object",
          properties: {
            labelId: {
              type: "string",
              description: "The ID of the label to delete"
            }
          },
          required: ["labelId"]
        }
      },
      {
        name: "batch-update-emails",
        description: "Modify multiple emails labels/status. Returns: empty on success (no response body). Use when: bulk operations on many emails. Limit: 1000 IDs per request. For single: use update-email.",
        inputSchema: {
          type: "object",
          properties: {
            messageIds: {
              type: "array",
              description: "Array of message IDs from list-emails (not email addresses). Maximum 1000 IDs.",
              items: { type: "string" },
              minItems: 1,
              maxItems: 1e3
            },
            addLabelIds: {
              type: "array",
              description: "System labels: UNREAD, STARRED, IMPORTANT, INBOX, SPAM, TRASH (can't add DRAFTS, SENT)",
              items: { type: "string" }
            },
            removeLabelIds: {
              type: "array",
              description: "System labels: UNREAD, STARRED, IMPORTANT, INBOX (can't remove DRAFTS, SENT)",
              items: { type: "string" }
            },
            markAsRead: {
              type: "boolean",
              description: "Mark all emails as read"
            },
            markAsUnread: {
              type: "boolean",
              description: "Mark all emails as unread"
            },
            star: {
              type: "boolean",
              description: "Star all emails"
            },
            unstar: {
              type: "boolean",
              description: "Unstar all emails"
            },
            markAsImportant: {
              type: "boolean",
              description: "Mark all as important"
            },
            markAsNotImportant: {
              type: "boolean",
              description: "Mark all as not important"
            },
            archive: {
              type: "boolean",
              description: "Archive all emails"
            },
            unarchive: {
              type: "boolean",
              description: "Unarchive all emails"
            },
            moveToTrash: {
              type: "boolean",
              description: "Move all to trash"
            }
          },
          required: ["messageIds"]
        }
      }
    ]
  };
}

// src/handlers/core/BaseToolHandler.ts
import { GaxiosError as GaxiosError2 } from "gaxios";
import { google } from "googleapis";
var BaseToolHandler = class {
  handleGoogleApiError(error) {
    if (error instanceof GaxiosError2 && error.response?.data?.error === "invalid_grant") {
      throw new Error(
        "Google API Error: Authentication token is invalid or expired. Please re-run the authentication process (e.g., `npm run auth`)."
      );
    }
    throw error;
  }
  getCalendar(auth) {
    return google.calendar({ version: "v3", auth });
  }
};

// src/handlers/core/ListCalendarsHandler.ts
var ListCalendarsHandler = class extends BaseToolHandler {
  async runTool(_, oauth2Client2) {
    const calendars = await this.listCalendars(oauth2Client2);
    return {
      content: [{
        type: "text",
        // This MUST be a string literal
        text: this.formatCalendarList(calendars)
      }]
    };
  }
  async listCalendars(client) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.calendarList.list();
      return response.data.items || [];
    } catch (error) {
      throw this.handleGoogleApiError(error);
    }
  }
  /**
   * Formats a list of calendars into a user-friendly string.
   */
  formatCalendarList(calendars) {
    return calendars.map((cal) => `${cal.summary || "Untitled"} (${cal.id || "no-id"})`).join("\n");
  }
};

// src/schemas/validators.ts
import { z } from "zod";
var ReminderSchema = z.object({
  method: z.enum(["email", "popup"]).default("popup"),
  minutes: z.number()
});
var RemindersSchema = z.object({
  useDefault: z.boolean(),
  overrides: z.array(ReminderSchema).optional()
});
var isoDateTimeWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
var ListEventsArgumentsSchema = z.object({
  calendarId: z.preprocess(
    (val) => {
      if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    },
    z.union([
      z.string().min(1, "Calendar ID cannot be empty"),
      z.array(z.string().min(1, "Calendar ID cannot be empty")).min(1, "At least one calendar ID is required").max(50, "Maximum 50 calendars allowed per request").refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate calendar IDs are not allowed"
      )
    ])
  ).describe("Calendar ID(s) to fetch events from"),
  timeMin: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional().describe("Start time for event filtering"),
  timeMax: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional().describe("End time for event filtering")
}).refine(
  (data) => {
    if (data.timeMin && data.timeMax) {
      return new Date(data.timeMin) < new Date(data.timeMax);
    }
    return true;
  },
  {
    message: "timeMin must be before timeMax",
    path: ["timeMax"]
  }
);
var SearchEventsArgumentsSchema = z.object({
  calendarId: z.string(),
  query: z.string(),
  timeMin: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional(),
  timeMax: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-12-31T23:59:59Z)").optional()
});
var CreateEventArgumentsSchema = z.object({
  calendarId: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  start: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  end: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  timeZone: z.string(),
  attendees: z.array(
    z.object({
      email: z.string()
    })
  ).optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  reminders: RemindersSchema.optional(),
  recurrence: z.array(z.string()).optional()
});
var UpdateEventArgumentsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  start: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional(),
  end: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional(),
  timeZone: z.string(),
  // Required even if start/end don't change, per API docs for patch
  attendees: z.array(
    z.object({
      email: z.string()
    })
  ).optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  reminders: RemindersSchema.optional(),
  recurrence: z.array(z.string()).optional(),
  // New recurring event parameters
  modificationScope: z.enum(["single", "all", "future"]).default("all"),
  originalStartTime: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional(),
  futureStartDate: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional()
}).refine(
  (data) => {
    if (data.modificationScope === "single" && !data.originalStartTime) {
      return false;
    }
    return true;
  },
  {
    message: "originalStartTime is required when modificationScope is 'single'",
    path: ["originalStartTime"]
  }
).refine(
  (data) => {
    if (data.modificationScope === "future" && !data.futureStartDate) {
      return false;
    }
    return true;
  },
  {
    message: "futureStartDate is required when modificationScope is 'future'",
    path: ["futureStartDate"]
  }
).refine(
  (data) => {
    if (data.futureStartDate) {
      const futureDate = new Date(data.futureStartDate);
      const now = /* @__PURE__ */ new Date();
      return futureDate > now;
    }
    return true;
  },
  {
    message: "futureStartDate must be in the future",
    path: ["futureStartDate"]
  }
);
var DeleteEventArgumentsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string()
});
var FreeBusyEventArgumentsSchema = z.object({
  timeMin: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  timeMax: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  timeZone: z.string().optional(),
  groupExpansionMax: z.number().int().max(100).optional(),
  calendarExpansionMax: z.number().int().max(50).optional(),
  items: z.array(z.object({
    id: z.string().email("Must be a valid email address")
  }))
});

// src/handlers/utils.ts
function formatEventList(events) {
  return events.map((event) => {
    const attendeeList = event.attendees ? `
Attendees: ${event.attendees.map((a) => `${a.email || "no-email"} (${a.responseStatus || "unknown"})`).join(", ")}` : "";
    const locationInfo = event.location ? `
Location: ${event.location}` : "";
    const descriptionInfo = event.description ? `
Description: ${event.description}` : "";
    const colorInfo = event.colorId ? `
Color ID: ${event.colorId}` : "";
    const reminderInfo = event.reminders ? `
Reminders: ${event.reminders.useDefault ? "Using default" : (event.reminders.overrides || []).map((r) => `${r.method} ${r.minutes} minutes before`).join(", ") || "None"}` : "";
    return `${event.summary || "Untitled"} (${event.id || "no-id"})${locationInfo}${descriptionInfo}
Start: ${event.start?.dateTime || event.start?.date || "unspecified"}
End: ${event.end?.dateTime || event.end?.date || "unspecified"}${attendeeList}${colorInfo}${reminderInfo}
`;
  }).join("\n");
}

// src/handlers/core/BatchRequestHandler.ts
var BatchRequestError = class extends Error {
  constructor(message, errors, partial = false) {
    super(message);
    this.errors = errors;
    this.partial = partial;
    this.name = "BatchRequestError";
  }
};
var BatchRequestHandler = class {
  // 1 second
  constructor(auth) {
    this.auth = auth;
    this.boundary = "batch_boundary_" + Date.now();
  }
  batchEndpoint = "https://www.googleapis.com/batch/calendar/v3";
  boundary;
  maxRetries = 3;
  baseDelay = 1e3;
  async executeBatch(requests) {
    if (requests.length === 0) {
      return [];
    }
    if (requests.length > 50) {
      throw new Error("Batch requests cannot exceed 50 requests per batch");
    }
    return this.executeBatchWithRetry(requests, 0);
  }
  async executeBatchWithRetry(requests, attempt) {
    try {
      const batchBody = this.createBatchBody(requests);
      const token = await this.auth.getAccessToken();
      const response = await fetch(this.batchEndpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token.token}`,
          "Content-Type": `multipart/mixed; boundary=${this.boundary}`
        },
        body: batchBody
      });
      const responseText = await response.text();
      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter) * 1e3 : this.baseDelay * Math.pow(2, attempt);
        console.warn(`Rate limited, retrying after ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
        await this.sleep(delay);
        return this.executeBatchWithRetry(requests, attempt + 1);
      }
      if (!response.ok) {
        throw new BatchRequestError(
          `Batch request failed: ${response.status} ${response.statusText}`,
          [{
            statusCode: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            details: responseText
          }]
        );
      }
      return this.parseBatchResponse(responseText);
    } catch (error) {
      if (error instanceof BatchRequestError) {
        throw error;
      }
      if (attempt < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.baseDelay * Math.pow(2, attempt);
        console.warn(`Network error, retrying after ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}): ${error instanceof Error ? error.message : "Unknown error"}`);
        await this.sleep(delay);
        return this.executeBatchWithRetry(requests, attempt + 1);
      }
      throw new BatchRequestError(
        `Failed to execute batch request: ${error instanceof Error ? error.message : "Unknown error"}`,
        [{
          statusCode: 0,
          message: error instanceof Error ? error.message : "Unknown error",
          details: error
        }]
      );
    }
  }
  isRetryableError(error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes("network") || message.includes("timeout") || message.includes("econnreset") || message.includes("enotfound");
    }
    return false;
  }
  sleep(ms) {
    return new Promise((resolve2) => setTimeout(resolve2, ms));
  }
  createBatchBody(requests) {
    return requests.map((req, index) => {
      const parts = [
        `--${this.boundary}`,
        `Content-Type: application/http`,
        `Content-ID: <item${index + 1}>`,
        "",
        `${req.method} ${req.path} HTTP/1.1`
      ];
      if (req.headers) {
        Object.entries(req.headers).forEach(([key, value]) => {
          parts.push(`${key}: ${value}`);
        });
      }
      if (req.body) {
        parts.push("Content-Type: application/json");
        parts.push("");
        parts.push(JSON.stringify(req.body));
      }
      return parts.join("\r\n");
    }).join("\r\n\r\n") + `\r
--${this.boundary}--`;
  }
  parseBatchResponse(responseText) {
    const lines = responseText.split(/\r?\n/);
    let boundary = null;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i];
      if (line.toLowerCase().includes("content-type:") && line.includes("boundary=")) {
        const boundaryMatch = line.match(/boundary=([^\s\r\n;]+)/);
        if (boundaryMatch) {
          boundary = boundaryMatch[1];
          break;
        }
      }
    }
    if (!boundary) {
      const boundaryMatch = responseText.match(/--([a-zA-Z0-9_-]+)/);
      if (boundaryMatch) {
        boundary = boundaryMatch[1];
      }
    }
    if (!boundary) {
      throw new Error("Could not find boundary in batch response");
    }
    const parts = responseText.split(`--${boundary}`);
    const responses = [];
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.trim() === "" || part.trim() === "--" || part.trim().startsWith("--")) continue;
      const response = this.parseResponsePart(part);
      if (response) {
        responses.push(response);
      }
    }
    return responses;
  }
  parseResponsePart(part) {
    const lines = part.split(/\r?\n/);
    let httpLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("HTTP/1.1")) {
        httpLineIndex = i;
        break;
      }
    }
    if (httpLineIndex === -1) return null;
    const httpLine = lines[httpLineIndex];
    const statusMatch = httpLine.match(/HTTP\/1\.1 (\d+)/);
    if (!statusMatch) return null;
    const statusCode = parseInt(statusMatch[1]);
    const headers = {};
    let bodyStartIndex = httpLineIndex + 1;
    for (let i = httpLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") {
        bodyStartIndex = i + 1;
        break;
      }
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }
    let body = null;
    if (bodyStartIndex < lines.length) {
      const bodyLines = [];
      for (let i = bodyStartIndex; i < lines.length; i++) {
        bodyLines.push(lines[i]);
      }
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") {
        bodyLines.pop();
      }
      if (bodyLines.length > 0) {
        const bodyText = bodyLines.join("\n");
        if (bodyText.trim()) {
          try {
            body = JSON.parse(bodyText);
          } catch {
            body = bodyText;
          }
        }
      }
    }
    return {
      statusCode,
      headers,
      body
    };
  }
};

// src/handlers/core/ListEventsHandler.ts
var ListEventsHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    const validArgs = ListEventsArgumentsSchema.parse(args);
    const calendarIds = Array.isArray(validArgs.calendarId) ? validArgs.calendarId : [validArgs.calendarId];
    const allEvents = await this.fetchEvents(oauth2Client2, calendarIds, {
      timeMin: validArgs.timeMin,
      timeMax: validArgs.timeMax
    });
    return {
      content: [{
        type: "text",
        text: this.formatEventList(allEvents, calendarIds)
      }]
    };
  }
  async fetchEvents(client, calendarIds, options) {
    if (calendarIds.length === 1) {
      return this.fetchSingleCalendarEvents(client, calendarIds[0], options);
    }
    return this.fetchMultipleCalendarEvents(client, calendarIds, options);
  }
  async fetchSingleCalendarEvents(client, calendarId, options) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.events.list({
        calendarId,
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        singleEvents: true,
        orderBy: "startTime"
      });
      return (response.data.items || []).map((event) => ({
        ...event,
        calendarId
      }));
    } catch (error) {
      throw this.handleGoogleApiError(error);
    }
  }
  async fetchMultipleCalendarEvents(client, calendarIds, options) {
    const batchHandler = new BatchRequestHandler(client);
    const requests = calendarIds.map((calendarId) => ({
      method: "GET",
      path: this.buildEventsPath(calendarId, options)
    }));
    const responses = await batchHandler.executeBatch(requests);
    const { events, errors } = this.processBatchResponses(responses, calendarIds);
    if (errors.length > 0) {
      console.warn("Some calendars had errors:", errors.map((e) => `${e.calendarId}: ${e.error}`));
    }
    return this.sortEventsByStartTime(events);
  }
  buildEventsPath(calendarId, options) {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      ...options.timeMin && { timeMin: options.timeMin },
      ...options.timeMax && { timeMax: options.timeMax }
    });
    return `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  }
  processBatchResponses(responses, calendarIds) {
    const events = [];
    const errors = [];
    responses.forEach((response, index) => {
      const calendarId = calendarIds[index];
      if (response.statusCode === 200 && response.body?.items) {
        const calendarEvents = response.body.items.map((event) => ({
          ...event,
          calendarId
        }));
        events.push(...calendarEvents);
      } else {
        const errorMessage = response.body?.error?.message || response.body?.message || `HTTP ${response.statusCode}`;
        errors.push({ calendarId, error: errorMessage });
      }
    });
    return { events, errors };
  }
  sortEventsByStartTime(events) {
    return events.sort((a, b) => {
      const aStart = a.start?.dateTime || a.start?.date || "";
      const bStart = b.start?.dateTime || b.start?.date || "";
      return aStart.localeCompare(bStart);
    });
  }
  formatEventList(events, calendarIds) {
    if (events.length === 0) {
      return `No events found in ${calendarIds.length} calendar(s).`;
    }
    if (calendarIds.length === 1) {
      return formatEventList(events);
    }
    return this.formatMultiCalendarEvents(events, calendarIds);
  }
  formatMultiCalendarEvents(events, calendarIds) {
    const grouped = this.groupEventsByCalendar(events);
    let output = `Found ${events.length} events across ${calendarIds.length} calendars:

`;
    for (const [calendarId, calEvents] of Object.entries(grouped)) {
      output += `Calendar: ${calendarId}
`;
      output += formatEventList(calEvents);
      output += "\n";
    }
    return output;
  }
  groupEventsByCalendar(events) {
    return events.reduce((acc, event) => {
      const calId = event.calendarId;
      if (!acc[calId]) acc[calId] = [];
      acc[calId].push(event);
      return acc;
    }, {});
  }
};

// src/handlers/core/SearchEventsHandler.ts
var SearchEventsHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    const validArgs = SearchEventsArgumentsSchema.parse(args);
    const events = await this.searchEvents(oauth2Client2, validArgs);
    return {
      content: [{
        type: "text",
        text: formatEventList(events)
      }]
    };
  }
  async searchEvents(client, args) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.events.list({
        calendarId: args.calendarId,
        q: args.query,
        timeMin: args.timeMin,
        timeMax: args.timeMax,
        singleEvents: true,
        orderBy: "startTime"
      });
      return response.data.items || [];
    } catch (error) {
      throw this.handleGoogleApiError(error);
    }
  }
};

// src/handlers/core/ListColorsHandler.ts
var ListColorsHandler = class extends BaseToolHandler {
  async runTool(_, oauth2Client2) {
    const colors = await this.listColors(oauth2Client2);
    return {
      content: [{
        type: "text",
        text: `Available event colors:
${this.formatColorList(colors)}`
      }]
    };
  }
  async listColors(client) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.colors.get();
      if (!response.data) throw new Error("Failed to retrieve colors");
      return response.data;
    } catch (error) {
      throw this.handleGoogleApiError(error);
    }
  }
  /**
   * Formats the color information into a user-friendly string.
   */
  formatColorList(colors) {
    const eventColors = colors.event || {};
    return Object.entries(eventColors).map(([id, colorInfo]) => `Color ID: ${id} - ${colorInfo.background} (background) / ${colorInfo.foreground} (foreground)`).join("\n");
  }
};

// src/handlers/core/CreateEventHandler.ts
var CreateEventHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    const validArgs = CreateEventArgumentsSchema.parse(args);
    const event = await this.createEvent(oauth2Client2, validArgs);
    return {
      content: [{
        type: "text",
        text: `Event created: ${event.summary} (${event.id})`
      }]
    };
  }
  async createEvent(client, args) {
    try {
      const calendar = this.getCalendar(client);
      const requestBody = {
        summary: args.summary,
        description: args.description,
        start: { dateTime: args.start, timeZone: args.timeZone },
        end: { dateTime: args.end, timeZone: args.timeZone },
        attendees: args.attendees,
        location: args.location,
        colorId: args.colorId,
        reminders: args.reminders,
        recurrence: args.recurrence
      };
      const response = await calendar.events.insert({
        calendarId: args.calendarId,
        requestBody
      });
      if (!response.data) throw new Error("Failed to create event, no data returned");
      return response.data;
    } catch (error) {
      if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
        try {
          await new Promise((resolve2) => setTimeout(resolve2, 1e3));
          const calendar = this.getCalendar(client);
          const now = /* @__PURE__ */ new Date();
          const events = await calendar.events.list({
            calendarId: args.calendarId,
            timeMin: new Date(now.getTime() - 6e4).toISOString(),
            // Last minute
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 10
          });
          const createdEvent = events.data.items?.find(
            (event) => event.summary === args.summary && event.start?.dateTime === args.start && event.end?.dateTime === args.end
          );
          if (createdEvent) {
            return createdEvent;
          }
        } catch (checkError) {
        }
      }
      throw this.handleGoogleApiError(error);
    }
  }
};

// src/handlers/core/RecurringEventHelpers.ts
var RecurringEventHelpers = class {
  calendar;
  constructor(calendar) {
    this.calendar = calendar;
  }
  /**
   * Get the calendar instance
   */
  getCalendar() {
    return this.calendar;
  }
  /**
   * Detects if an event is recurring or single
   */
  async detectEventType(eventId, calendarId) {
    const response = await this.calendar.events.get({
      calendarId,
      eventId
    });
    const event = response.data;
    return event.recurrence && event.recurrence.length > 0 ? "recurring" : "single";
  }
  /**
   * Formats an instance ID for single instance updates
   */
  formatInstanceId(eventId, originalStartTime) {
    const utcDate = new Date(originalStartTime);
    const basicTimeFormat = utcDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return `${eventId}_${basicTimeFormat}`;
  }
  /**
   * Calculates the UNTIL date for future instance updates
   */
  calculateUntilDate(futureStartDate) {
    const futureDate = new Date(futureStartDate);
    const untilDate = new Date(futureDate.getTime() - 864e5);
    return untilDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }
  /**
   * Calculates end time based on original duration
   */
  calculateEndTime(newStartTime, originalEvent) {
    const newStart = new Date(newStartTime);
    const originalStart = new Date(originalEvent.start.dateTime);
    const originalEnd = new Date(originalEvent.end.dateTime);
    const duration = originalEnd.getTime() - originalStart.getTime();
    return new Date(newStart.getTime() + duration).toISOString();
  }
  /**
   * Updates recurrence rule with UNTIL clause
   */
  updateRecurrenceWithUntil(recurrence, untilDate) {
    if (!recurrence || recurrence.length === 0) {
      throw new Error("No recurrence rule found");
    }
    const updatedRecurrence = [];
    let foundRRule = false;
    for (const rule of recurrence) {
      if (rule.startsWith("RRULE:")) {
        foundRRule = true;
        const updatedRule = rule.replace(/;UNTIL=\d{8}T\d{6}Z/g, "").replace(/;COUNT=\d+/g, "") + `;UNTIL=${untilDate}`;
        updatedRecurrence.push(updatedRule);
      } else {
        updatedRecurrence.push(rule);
      }
    }
    if (!foundRRule) {
      throw new Error("No RRULE found in recurrence rules");
    }
    return updatedRecurrence;
  }
  /**
   * Cleans event fields for new event creation
   */
  cleanEventForDuplication(event) {
    const cleanedEvent = { ...event };
    delete cleanedEvent.id;
    delete cleanedEvent.etag;
    delete cleanedEvent.iCalUID;
    delete cleanedEvent.created;
    delete cleanedEvent.updated;
    delete cleanedEvent.htmlLink;
    delete cleanedEvent.hangoutLink;
    return cleanedEvent;
  }
  /**
   * Builds request body for event updates
   */
  buildUpdateRequestBody(args) {
    const requestBody = {};
    if (args.summary !== void 0 && args.summary !== null) requestBody.summary = args.summary;
    if (args.description !== void 0 && args.description !== null) requestBody.description = args.description;
    if (args.location !== void 0 && args.location !== null) requestBody.location = args.location;
    if (args.colorId !== void 0 && args.colorId !== null) requestBody.colorId = args.colorId;
    if (args.attendees !== void 0 && args.attendees !== null) requestBody.attendees = args.attendees;
    if (args.reminders !== void 0 && args.reminders !== null) requestBody.reminders = args.reminders;
    if (args.recurrence !== void 0 && args.recurrence !== null) requestBody.recurrence = args.recurrence;
    let timeChanged = false;
    if (args.start !== void 0 && args.start !== null) {
      requestBody.start = { dateTime: args.start, timeZone: args.timeZone };
      timeChanged = true;
    }
    if (args.end !== void 0 && args.end !== null) {
      requestBody.end = { dateTime: args.end, timeZone: args.timeZone };
      timeChanged = true;
    }
    if (timeChanged || !args.start && !args.end && args.timeZone) {
      if (!requestBody.start) requestBody.start = {};
      if (!requestBody.end) requestBody.end = {};
      if (!requestBody.start.timeZone) requestBody.start.timeZone = args.timeZone;
      if (!requestBody.end.timeZone) requestBody.end.timeZone = args.timeZone;
    }
    return requestBody;
  }
};
var RecurringEventError = class extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.name = "RecurringEventError";
    this.code = code;
  }
};
var RECURRING_EVENT_ERRORS = {
  INVALID_SCOPE: "INVALID_MODIFICATION_SCOPE",
  MISSING_ORIGINAL_TIME: "MISSING_ORIGINAL_START_TIME",
  MISSING_FUTURE_DATE: "MISSING_FUTURE_START_DATE",
  PAST_FUTURE_DATE: "FUTURE_DATE_IN_PAST",
  NON_RECURRING_SCOPE: "SCOPE_NOT_APPLICABLE_TO_SINGLE_EVENT"
};

// src/handlers/core/UpdateEventHandler.ts
var UpdateEventHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    const validArgs = UpdateEventArgumentsSchema.parse(args);
    const event = await this.updateEventWithScope(oauth2Client2, validArgs);
    return {
      content: [{
        type: "text",
        text: `Event updated: ${event.summary} (${event.id})`
      }]
    };
  }
  async updateEventWithScope(client, args) {
    try {
      const calendar = this.getCalendar(client);
      const helpers = new RecurringEventHelpers(calendar);
      const eventType = await helpers.detectEventType(args.eventId, args.calendarId);
      if (args.modificationScope !== "all" && eventType !== "recurring") {
        throw new RecurringEventError(
          'Scope other than "all" only applies to recurring events',
          RECURRING_EVENT_ERRORS.NON_RECURRING_SCOPE
        );
      }
      switch (args.modificationScope) {
        case "single":
          return this.updateSingleInstance(helpers, args);
        case "all":
          return this.updateAllInstances(helpers, args);
        case "future":
          return this.updateFutureInstances(helpers, args);
        default:
          throw new RecurringEventError(
            `Invalid modification scope: ${args.modificationScope}`,
            RECURRING_EVENT_ERRORS.INVALID_SCOPE
          );
      }
    } catch (error) {
      if (error instanceof RecurringEventError) {
        throw error;
      }
      throw this.handleGoogleApiError(error);
    }
  }
  async updateSingleInstance(helpers, args) {
    if (!args.originalStartTime) {
      throw new RecurringEventError(
        "originalStartTime is required for single instance updates",
        RECURRING_EVENT_ERRORS.MISSING_ORIGINAL_TIME
      );
    }
    const calendar = helpers.getCalendar();
    const instanceId = helpers.formatInstanceId(args.eventId, args.originalStartTime);
    const response = await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: instanceId,
      requestBody: helpers.buildUpdateRequestBody(args)
    });
    if (!response.data) throw new Error("Failed to update event instance");
    return response.data;
  }
  async updateAllInstances(helpers, args) {
    const calendar = helpers.getCalendar();
    const response = await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: args.eventId,
      requestBody: helpers.buildUpdateRequestBody(args)
    });
    if (!response.data) throw new Error("Failed to update event");
    return response.data;
  }
  async updateFutureInstances(helpers, args) {
    if (!args.futureStartDate) {
      throw new RecurringEventError(
        "futureStartDate is required for future instance updates",
        RECURRING_EVENT_ERRORS.MISSING_FUTURE_DATE
      );
    }
    const calendar = helpers.getCalendar();
    const originalResponse = await calendar.events.get({
      calendarId: args.calendarId,
      eventId: args.eventId
    });
    const originalEvent = originalResponse.data;
    if (!originalEvent.recurrence) {
      throw new Error("Event does not have recurrence rules");
    }
    const untilDate = helpers.calculateUntilDate(args.futureStartDate);
    const updatedRecurrence = helpers.updateRecurrenceWithUntil(originalEvent.recurrence, untilDate);
    await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: args.eventId,
      requestBody: { recurrence: updatedRecurrence }
    });
    const requestBody = helpers.buildUpdateRequestBody(args);
    let endTime = args.end;
    if (args.start || args.futureStartDate) {
      const newStartTime = args.start || args.futureStartDate;
      endTime = endTime || helpers.calculateEndTime(newStartTime, originalEvent);
    }
    const newEvent = {
      ...helpers.cleanEventForDuplication(originalEvent),
      ...requestBody,
      start: {
        dateTime: args.start || args.futureStartDate,
        timeZone: args.timeZone
      },
      end: {
        dateTime: endTime,
        timeZone: args.timeZone
      }
    };
    const response = await calendar.events.insert({
      calendarId: args.calendarId,
      requestBody: newEvent
    });
    if (!response.data) throw new Error("Failed to create new recurring event");
    return response.data;
  }
  // Keep the original updateEvent method for backward compatibility
  async updateEvent(client, args) {
    return this.updateEventWithScope(client, args);
  }
};

// src/handlers/core/DeleteEventHandler.ts
var DeleteEventHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    const validArgs = DeleteEventArgumentsSchema.parse(args);
    await this.deleteEvent(oauth2Client2, validArgs);
    return {
      content: [{
        type: "text",
        text: "Event deleted successfully"
      }]
    };
  }
  async deleteEvent(client, args) {
    try {
      const calendar = this.getCalendar(client);
      await calendar.events.delete({
        calendarId: args.calendarId,
        eventId: args.eventId
      });
    } catch (error) {
      throw this.handleGoogleApiError(error);
    }
  }
};

// src/handlers/core/FreeBusyEventHandler.ts
var FreeBusyEventHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    const validArgs = FreeBusyEventArgumentsSchema.safeParse(args);
    if (!validArgs.success) {
      throw new Error(
        `Invalid arguments Error: ${JSON.stringify(validArgs.error.issues)}`
      );
    }
    if (!this.isLessThanThreeMonths(validArgs.data.timeMin, validArgs.data.timeMax)) {
      return {
        content: [{
          type: "text",
          text: "The time gap between timeMin and timeMax must be less than 3 months"
        }]
      };
    }
    const result = await this.queryFreeBusy(oauth2Client2, validArgs.data);
    const summaryText = this.generateAvailabilitySummary(result);
    return {
      content: [{
        type: "text",
        text: summaryText
      }]
    };
  }
  async queryFreeBusy(client, args) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: args.timeMin,
          timeMax: args.timeMax,
          timeZone: args.timeZone,
          groupExpansionMax: args.groupExpansionMax,
          calendarExpansionMax: args.calendarExpansionMax,
          items: args.items
        }
      });
      return response.data;
    } catch (error) {
      throw this.handleGoogleApiError(error);
    }
  }
  isLessThanThreeMonths(timeMin, timeMax) {
    const minDate = new Date(timeMin);
    const maxDate = new Date(timeMax);
    const diffInMilliseconds = maxDate.getTime() - minDate.getTime();
    const threeMonthsInMilliseconds = 3 * 30 * 24 * 60 * 60 * 1e3;
    return diffInMilliseconds <= threeMonthsInMilliseconds;
  }
  generateAvailabilitySummary(response) {
    return Object.entries(response.calendars).map(([email, calendarInfo]) => {
      if (calendarInfo.errors?.some((error) => error.reason === "notFound")) {
        return `Cannot check availability for ${email} (account not found)
`;
      }
      if (calendarInfo.busy.length === 0) {
        return `${email} is available during ${response.timeMin} to ${response.timeMax}, please schedule calendar to ${email} if you want 
`;
      }
      const busyTimes = calendarInfo.busy.map((slot) => `- From ${slot.start} to ${slot.end}`).join("\n");
      return `${email} is busy during:
${busyTimes}
`;
    }).join("\n").trim();
  }
};

// src/handlers/core/contacts/ListContactsHandler.ts
import { google as google2 } from "googleapis";
var ListContactsHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const people = google2.people({ version: "v1", auth: oauth2Client2 });
      const personFields = args.personFields && args.personFields.length > 0 ? args.personFields.join(",") : "names,emailAddresses,phoneNumbers,addresses,organizations,biographies,photos";
      const sources = args.sources && args.sources.length > 0 ? args.sources : ["READ_SOURCE_TYPE_CONTACT"];
      const response = await people.people.connections.list({
        resourceName: "people/me",
        pageSize: args.pageSize || 100,
        pageToken: args.pageToken,
        personFields,
        sources,
        ...args.query && { query: args.query }
      });
      const contacts = response.data.connections || [];
      const formattedContacts = contacts.map((contact) => this.formatContact(contact));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              contacts: formattedContacts,
              totalItems: response.data.totalItems || formattedContacts.length,
              nextPageToken: response.data.nextPageToken || null
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  formatContact(contact) {
    return {
      resourceName: contact.resourceName,
      etag: contact.etag,
      names: contact.names?.map((name) => ({
        displayName: name.displayName,
        familyName: name.familyName,
        givenName: name.givenName,
        middleName: name.middleName,
        honorificPrefix: name.honorificPrefix,
        honorificSuffix: name.honorificSuffix
      })),
      emailAddresses: contact.emailAddresses?.map((email) => ({
        value: email.value,
        type: email.type,
        formattedType: email.formattedType
      })),
      phoneNumbers: contact.phoneNumbers?.map((phone) => ({
        value: phone.value,
        type: phone.type,
        formattedType: phone.formattedType
      })),
      addresses: contact.addresses?.map((address) => ({
        formattedValue: address.formattedValue,
        type: address.type,
        formattedType: address.formattedType,
        streetAddress: address.streetAddress,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
        countryCode: address.countryCode
      })),
      organizations: contact.organizations?.map((org) => ({
        name: org.name,
        title: org.title,
        department: org.department,
        type: org.type,
        formattedType: org.formattedType
      })),
      biographies: contact.biographies?.map((bio) => ({
        value: bio.value,
        contentType: bio.contentType
      })),
      photos: contact.photos?.map((photo) => ({
        url: photo.url,
        default: photo.default
      }))
    };
  }
};

// src/handlers/core/contacts/GetContactHandler.ts
import { google as google3 } from "googleapis";
var GetContactHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const people = google3.people({ version: "v1", auth: oauth2Client2 });
      const personFields = args.personFields && args.personFields.length > 0 ? args.personFields.join(",") : "names,emailAddresses,phoneNumbers,addresses,organizations,biographies,photos,birthdays,events,relations,urls,userDefined,memberships,metadata";
      const response = await people.people.get({
        resourceName: args.resourceName,
        personFields
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              contact: this.formatContact(response.data)
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  formatContact(contact) {
    return {
      resourceName: contact.resourceName,
      etag: contact.etag,
      metadata: contact.metadata,
      names: contact.names?.map((name) => ({
        displayName: name.displayName,
        familyName: name.familyName,
        givenName: name.givenName,
        middleName: name.middleName,
        honorificPrefix: name.honorificPrefix,
        honorificSuffix: name.honorificSuffix,
        metadata: name.metadata
      })),
      emailAddresses: contact.emailAddresses?.map((email) => ({
        value: email.value,
        type: email.type,
        formattedType: email.formattedType,
        metadata: email.metadata
      })),
      phoneNumbers: contact.phoneNumbers?.map((phone) => ({
        value: phone.value,
        type: phone.type,
        formattedType: phone.formattedType,
        canonicalForm: phone.canonicalForm,
        metadata: phone.metadata
      })),
      addresses: contact.addresses?.map((address) => ({
        formattedValue: address.formattedValue,
        type: address.type,
        formattedType: address.formattedType,
        streetAddress: address.streetAddress,
        extendedAddress: address.extendedAddress,
        poBox: address.poBox,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
        countryCode: address.countryCode,
        metadata: address.metadata
      })),
      organizations: contact.organizations?.map((org) => ({
        name: org.name,
        phoneticName: org.phoneticName,
        title: org.title,
        department: org.department,
        symbol: org.symbol,
        location: org.location,
        type: org.type,
        formattedType: org.formattedType,
        startDate: org.startDate,
        endDate: org.endDate,
        current: org.current,
        metadata: org.metadata
      })),
      biographies: contact.biographies?.map((bio) => ({
        value: bio.value,
        contentType: bio.contentType,
        metadata: bio.metadata
      })),
      birthdays: contact.birthdays?.map((birthday) => ({
        date: birthday.date,
        text: birthday.text,
        metadata: birthday.metadata
      })),
      events: contact.events?.map((event) => ({
        date: event.date,
        type: event.type,
        formattedType: event.formattedType,
        metadata: event.metadata
      })),
      relations: contact.relations?.map((relation) => ({
        person: relation.person,
        type: relation.type,
        formattedType: relation.formattedType,
        metadata: relation.metadata
      })),
      urls: contact.urls?.map((url) => ({
        value: url.value,
        type: url.type,
        formattedType: url.formattedType,
        metadata: url.metadata
      })),
      memberships: contact.memberships?.map((membership) => ({
        contactGroupMembership: membership.contactGroupMembership,
        domainMembership: membership.domainMembership,
        metadata: membership.metadata
      })),
      photos: contact.photos?.map((photo) => ({
        url: photo.url,
        default: photo.default,
        metadata: photo.metadata
      }))
    };
  }
};

// src/handlers/core/contacts/CreateContactHandler.ts
import { google as google4 } from "googleapis";
var CreateContactHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const people = google4.people({ version: "v1", auth: oauth2Client2 });
      const person = {};
      if (args.givenName || args.familyName || args.middleName || args.displayName) {
        person.names = [{
          givenName: args.givenName,
          familyName: args.familyName,
          middleName: args.middleName,
          displayName: args.displayName || `${args.givenName || ""} ${args.familyName || ""}`.trim()
        }];
      }
      if (args.emailAddresses && args.emailAddresses.length > 0) {
        person.emailAddresses = args.emailAddresses.map((email) => ({
          value: email.value,
          type: email.type || "home"
        }));
      }
      if (args.phoneNumbers && args.phoneNumbers.length > 0) {
        person.phoneNumbers = args.phoneNumbers.map((phone) => ({
          value: phone.value,
          type: phone.type || "home"
        }));
      }
      if (args.addresses && args.addresses.length > 0) {
        person.addresses = args.addresses.map((address) => ({
          streetAddress: address.streetAddress,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
          type: address.type || "home"
        }));
      }
      if (args.organizations && args.organizations.length > 0) {
        person.organizations = args.organizations.map((org) => ({
          name: org.name,
          title: org.title,
          department: org.department,
          type: org.type || "work"
        }));
      }
      if (args.biographies && args.biographies.length > 0) {
        person.biographies = args.biographies;
      } else if (args.notes) {
        person.biographies = [{
          value: args.notes,
          contentType: "TEXT_PLAIN"
        }];
      }
      const response = await people.people.createContact({
        requestBody: person,
        personFields: "names,emailAddresses,phoneNumbers,addresses,organizations,biographies"
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              contact: {
                resourceName: response.data.resourceName,
                etag: response.data.etag,
                ...this.formatContactResponse(response.data)
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  formatContactResponse(contact) {
    return {
      names: contact.names,
      emailAddresses: contact.emailAddresses,
      phoneNumbers: contact.phoneNumbers,
      addresses: contact.addresses,
      organizations: contact.organizations,
      biographies: contact.biographies
    };
  }
};

// src/handlers/core/contacts/UpdateContactHandler.ts
import { google as google5 } from "googleapis";
var UpdateContactHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const people = google5.people({ version: "v1", auth: oauth2Client2 });
      const existingContact = await people.people.get({
        resourceName: args.resourceName,
        personFields: "names"
      });
      const person = {
        etag: existingContact.data.etag,
        resourceName: args.resourceName
      };
      if (args.updatePersonFields.includes("names")) {
        person.names = [{
          givenName: args.givenName,
          familyName: args.familyName,
          middleName: args.middleName,
          displayName: args.displayName || `${args.givenName || ""} ${args.familyName || ""}`.trim()
        }];
      }
      if (args.updatePersonFields.includes("emailAddresses") && args.emailAddresses) {
        person.emailAddresses = args.emailAddresses.map((email) => ({
          value: email.value,
          type: email.type || "home"
        }));
      }
      if (args.updatePersonFields.includes("phoneNumbers") && args.phoneNumbers) {
        person.phoneNumbers = args.phoneNumbers.map((phone) => ({
          value: phone.value,
          type: phone.type || "home"
        }));
      }
      if (args.updatePersonFields.includes("addresses") && args.addresses) {
        person.addresses = args.addresses.map((address) => ({
          streetAddress: address.streetAddress,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
          type: address.type || "home"
        }));
      }
      if (args.updatePersonFields.includes("organizations") && args.organizations) {
        person.organizations = args.organizations.map((org) => ({
          name: org.name,
          title: org.title,
          department: org.department,
          type: org.type || "work"
        }));
      }
      if (args.updatePersonFields.includes("biographies") && args.biographies) {
        person.biographies = args.biographies;
      }
      const response = await people.people.updateContact({
        resourceName: args.resourceName,
        updatePersonFields: args.updatePersonFields.join(","),
        requestBody: person,
        personFields: "names,emailAddresses,phoneNumbers,addresses,organizations,biographies"
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              contact: {
                resourceName: response.data.resourceName,
                etag: response.data.etag,
                ...this.formatContactResponse(response.data)
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  formatContactResponse(contact) {
    return {
      names: contact.names,
      emailAddresses: contact.emailAddresses,
      phoneNumbers: contact.phoneNumbers,
      addresses: contact.addresses,
      organizations: contact.organizations,
      biographies: contact.biographies
    };
  }
};

// src/handlers/core/contacts/DeleteContactHandler.ts
import { google as google6 } from "googleapis";
var DeleteContactHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const people = google6.people({ version: "v1", auth: oauth2Client2 });
      await people.people.deleteContact({
        resourceName: args.resourceName
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Contact ${args.resourceName} deleted successfully`
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
};

// src/handlers/core/gmail/ListEmailsHandler.ts
import { google as google7 } from "googleapis";
var ListEmailsHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google7.gmail({ version: "v1", auth: oauth2Client2 });
      const params = {
        userId: "me",
        maxResults: args.maxResults || 20,
        includeSpamTrash: args.includeSpamTrash || false
      };
      if (args.query) {
        params.q = args.query;
      }
      if (args.pageToken) {
        params.pageToken = args.pageToken;
      }
      if (args.labelIds && args.labelIds.length > 0) {
        params.labelIds = args.labelIds;
      }
      const response = await gmail.users.messages.list(params);
      const messages = response.data.messages || [];
      const messageDetails = await Promise.all(
        messages.slice(0, 10).map(async (message) => {
          try {
            const details = await gmail.users.messages.get({
              userId: "me",
              id: message.id,
              format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date"]
            });
            return this.formatMessageMetadata(details.data);
          } catch (error) {
            console.error(`Error fetching message ${message.id}:`, error);
            return { id: message.id, error: "Failed to fetch details" };
          }
        })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              messages: messageDetails,
              resultSizeEstimate: response.data.resultSizeEstimate,
              nextPageToken: response.data.nextPageToken || null,
              totalMessages: messages.length
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  formatMessageMetadata(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name === name)?.value || "";
    return {
      id: message.id,
      threadId: message.threadId,
      subject: getHeader("Subject"),
      from: getHeader("From"),
      to: getHeader("To"),
      date: getHeader("Date"),
      snippet: message.snippet,
      labelIds: message.labelIds || [],
      isUnread: message.labelIds?.includes("UNREAD") || false,
      isImportant: message.labelIds?.includes("IMPORTANT") || false,
      isStarred: message.labelIds?.includes("STARRED") || false,
      hasAttachments: this.hasAttachments(message.payload)
    };
  }
  hasAttachments(payload) {
    if (!payload) return false;
    if (payload.filename && payload.filename.length > 0) {
      return true;
    }
    if (payload.parts) {
      return payload.parts.some((part) => this.hasAttachments(part));
    }
    return false;
  }
};

// src/handlers/core/gmail/GetEmailHandler.ts
import { google as google8 } from "googleapis";
var GetEmailHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google8.gmail({ version: "v1", auth: oauth2Client2 });
      const response = await gmail.users.messages.get({
        userId: "me",
        id: args.messageId,
        format: args.format || "full"
      });
      const message = response.data;
      if (args.markAsRead !== false && message.labelIds?.includes("UNREAD")) {
        await gmail.users.messages.modify({
          userId: "me",
          id: args.messageId,
          requestBody: {
            removeLabelIds: ["UNREAD"]
          }
        });
      }
      const formattedMessage = args.format === "metadata" ? this.formatMessageMetadata(message) : this.formatFullMessage(message);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedMessage, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  formatMessageMetadata(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name === name)?.value || "";
    return {
      id: message.id,
      threadId: message.threadId,
      subject: getHeader("Subject"),
      from: getHeader("From"),
      to: getHeader("To"),
      cc: getHeader("Cc"),
      bcc: getHeader("Bcc"),
      date: getHeader("Date"),
      snippet: message.snippet,
      labelIds: message.labelIds || [],
      sizeEstimate: message.sizeEstimate,
      historyId: message.historyId
    };
  }
  formatFullMessage(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name === name)?.value || "";
    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds || [],
      snippet: message.snippet,
      historyId: message.historyId,
      internalDate: message.internalDate,
      sizeEstimate: message.sizeEstimate,
      headers: {
        subject: getHeader("Subject"),
        from: getHeader("From"),
        to: getHeader("To"),
        cc: getHeader("Cc"),
        bcc: getHeader("Bcc"),
        date: getHeader("Date"),
        messageId: getHeader("Message-ID"),
        inReplyTo: getHeader("In-Reply-To"),
        references: getHeader("References")
      },
      body: this.extractBody(message.payload),
      attachments: this.extractAttachments(message.payload),
      isUnread: message.labelIds?.includes("UNREAD") || false,
      isImportant: message.labelIds?.includes("IMPORTANT") || false,
      isStarred: message.labelIds?.includes("STARRED") || false,
      isDraft: message.labelIds?.includes("DRAFT") || false
    };
  }
  extractBody(payload) {
    if (!payload) return {};
    const result = {};
    if (payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8");
      if (payload.mimeType === "text/plain") {
        result.text = decoded;
      } else if (payload.mimeType === "text/html") {
        result.html = decoded;
      }
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          result.text = Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.mimeType === "text/html" && part.body?.data) {
          result.html = Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.mimeType?.startsWith("multipart/")) {
          const nestedBody = this.extractBody(part);
          if (nestedBody.text) result.text = nestedBody.text;
          if (nestedBody.html) result.html = nestedBody.html;
        }
      }
    }
    return result;
  }
  extractAttachments(payload) {
    if (!payload) return [];
    const attachments = [];
    const processPartForAttachments = (part) => {
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body?.size || 0,
          attachmentId: part.body?.attachmentId
        });
      }
      if (part.parts) {
        part.parts.forEach(processPartForAttachments);
      }
    };
    processPartForAttachments(payload);
    return attachments;
  }
};

// src/handlers/core/gmail/SendEmailHandler.ts
import { google as google9 } from "googleapis";
var SendEmailHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google9.gmail({ version: "v1", auth: oauth2Client2 });
      const profile = await gmail.users.getProfile({ userId: "me" });
      const userEmail = profile.data.emailAddress;
      const message = this.createMessage(
        userEmail,
        args.to,
        args.subject,
        args.body,
        args.cc,
        args.bcc,
        args.isHtml || false,
        args.replyToMessageId
      );
      const requestBody = {
        raw: message
      };
      if (args.threadId) {
        requestBody.threadId = args.threadId;
      }
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              messageId: response.data.id,
              threadId: response.data.threadId,
              labelIds: response.data.labelIds
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  createMessage(from, to, subject, body, cc, bcc, isHtml = false, replyToMessageId) {
    const boundary = "boundary_" + Date.now();
    const toAddresses = Array.isArray(to) ? to.join(", ") : to;
    let messageParts = [
      `From: ${from}`,
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0"
    ];
    if (cc) {
      const ccAddresses = Array.isArray(cc) ? cc.join(", ") : cc;
      messageParts.push(`Cc: ${ccAddresses}`);
    }
    if (bcc) {
      const bccAddresses = Array.isArray(bcc) ? bcc.join(", ") : bcc;
      messageParts.push(`Bcc: ${bccAddresses}`);
    }
    if (replyToMessageId) {
      messageParts.push(`In-Reply-To: ${replyToMessageId}`);
      messageParts.push(`References: ${replyToMessageId}`);
    }
    if (isHtml) {
      messageParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      messageParts.push("");
      messageParts.push(`--${boundary}`);
      messageParts.push("Content-Type: text/plain; charset=UTF-8");
      messageParts.push("");
      messageParts.push(this.htmlToText(body));
      messageParts.push("");
      messageParts.push(`--${boundary}`);
      messageParts.push("Content-Type: text/html; charset=UTF-8");
      messageParts.push("");
      messageParts.push(body);
      messageParts.push("");
      messageParts.push(`--${boundary}--`);
    } else {
      messageParts.push("Content-Type: text/plain; charset=UTF-8");
      messageParts.push("");
      messageParts.push(body);
    }
    const message = messageParts.join("\r\n");
    const encodedMessage = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return encodedMessage;
  }
  htmlToText(html) {
    return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  }
};

// src/handlers/core/gmail/UpdateEmailHandler.ts
import { google as google10 } from "googleapis";

// src/handlers/core/gmail/utils/labelMutationBuilder.ts
var LabelMutationBuilder = class {
  /**
   * Validates mutually exclusive flags
   */
  static validate(flags) {
    const conflicts = [
      ["markAsRead", "markAsUnread"],
      ["star", "unstar"],
      ["markAsImportant", "markAsNotImportant"],
      ["archive", "unarchive"]
    ];
    for (const [flag1, flag2] of conflicts) {
      if (flags[flag1] && flags[flag2]) {
        throw new Error(`Conflicting flags: cannot set both ${flag1} and ${flag2}`);
      }
    }
  }
  /**
   * Builds label mutations from convenience flags
   */
  static build(flags) {
    this.validate(flags);
    const addLabelIds = [...flags.addLabelIds || []];
    const removeLabelIds = [...flags.removeLabelIds || []];
    if (flags.markAsRead) {
      removeLabelIds.push("UNREAD");
    }
    if (flags.markAsUnread) {
      addLabelIds.push("UNREAD");
    }
    if (flags.star) {
      addLabelIds.push("STARRED");
    }
    if (flags.unstar) {
      removeLabelIds.push("STARRED");
    }
    if (flags.markAsImportant) {
      addLabelIds.push("IMPORTANT");
    }
    if (flags.markAsNotImportant) {
      removeLabelIds.push("IMPORTANT");
    }
    if (flags.archive) {
      removeLabelIds.push("INBOX");
    }
    if (flags.unarchive) {
      addLabelIds.push("INBOX");
    }
    const uniqueAddLabelIds = [...new Set(addLabelIds)];
    const uniqueRemoveLabelIds = [...new Set(removeLabelIds)];
    const finalAddLabelIds = uniqueAddLabelIds.filter((id) => !uniqueRemoveLabelIds.includes(id));
    const finalRemoveLabelIds = uniqueRemoveLabelIds.filter((id) => !uniqueAddLabelIds.includes(id));
    return {
      addLabelIds: finalAddLabelIds,
      removeLabelIds: finalRemoveLabelIds
    };
  }
  /**
   * Checks if a message can have its labels modified based on its current labels
   * Gmail blocks most label operations on TRASH/SPAM messages
   */
  static canModifyLabels(currentLabels, mutation) {
    const isInTrash = currentLabels.includes("TRASH");
    const isInSpam = currentLabels.includes("SPAM");
    if (isInTrash || isInSpam) {
      const removingTrash = mutation.removeLabelIds.includes("TRASH");
      const removingSpam = mutation.removeLabelIds.includes("SPAM");
      if (removingTrash || removingSpam) {
        return true;
      }
      return false;
    }
    return true;
  }
};

// src/handlers/core/gmail/UpdateEmailHandler.ts
var UpdateEmailHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google10.gmail({ version: "v1", auth: oauth2Client2 });
      if (args.moveToTrash) {
        await gmail.users.messages.trash({
          userId: "me",
          id: args.messageId
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                action: "moved_to_trash"
              }, null, 2)
            }
          ]
        };
      }
      if (args.removeFromTrash) {
        await gmail.users.messages.untrash({
          userId: "me",
          id: args.messageId
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                action: "removed_from_trash"
              }, null, 2)
            }
          ]
        };
      }
      const mutation = LabelMutationBuilder.build(args);
      if (mutation.addLabelIds.length === 0 && mutation.removeLabelIds.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                message: "No changes were made"
              }, null, 2)
            }
          ]
        };
      }
      const preCheck = await gmail.users.messages.get({
        userId: "me",
        id: args.messageId,
        format: "minimal"
      });
      const currentLabels = preCheck.data.labelIds || [];
      if (!LabelMutationBuilder.canModifyLabels(currentLabels, mutation)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                messageId: args.messageId,
                error: "Cannot modify labels on messages in TRASH or SPAM folders",
                currentLabels
              }, null, 2)
            }
          ]
        };
      }
      console.log("UpdateEmail - Calling modify with:", {
        messageId: args.messageId,
        addLabelIds: mutation.addLabelIds,
        removeLabelIds: mutation.removeLabelIds
      });
      const response = await gmail.users.messages.modify({
        userId: "me",
        id: args.messageId,
        requestBody: {
          addLabelIds: mutation.addLabelIds,
          removeLabelIds: mutation.removeLabelIds
        }
      });
      console.log("UpdateEmail - API response:", response.status, response.statusText);
      await new Promise((resolve2) => setTimeout(resolve2, 100));
      const postCheck = await gmail.users.messages.get({
        userId: "me",
        id: args.messageId,
        format: "minimal"
      });
      const finalLabels = postCheck.data.labelIds || [];
      const expectedAdded = mutation.addLabelIds.every(
        (label) => finalLabels.includes(label)
      );
      const expectedRemoved = mutation.removeLabelIds.every(
        (label) => !finalLabels.includes(label)
      );
      const verified = expectedAdded && expectedRemoved;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: verified,
              messageId: response.data.id,
              threadId: response.data.threadId,
              labelIds: finalLabels,
              addedLabels: mutation.addLabelIds,
              removedLabels: mutation.removeLabelIds,
              verified,
              warning: verified ? void 0 : "Changes may not have been fully applied"
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("UpdateEmail - Error details:", {
        message: error.message,
        code: error.code,
        errors: error.errors,
        response: error.response?.data
      });
      this.handleGoogleApiError(error);
      throw error;
    }
  }
};

// src/handlers/core/gmail/DeleteEmailHandler.ts
import { google as google11 } from "googleapis";
var DeleteEmailHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google11.gmail({ version: "v1", auth: oauth2Client2 });
      if (args.permanent) {
        await gmail.users.messages.delete({
          userId: "me",
          id: args.messageId
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                action: "permanently_deleted",
                warning: "This action cannot be undone"
              }, null, 2)
            }
          ]
        };
      } else {
        await gmail.users.messages.trash({
          userId: "me",
          id: args.messageId
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                action: "moved_to_trash",
                note: "Email moved to trash. Use permanent=true to permanently delete."
              }, null, 2)
            }
          ]
        };
      }
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
};

// src/handlers/core/gmail/CreateDraftHandler.ts
import { google as google12 } from "googleapis";
var CreateDraftHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google12.gmail({ version: "v1", auth: oauth2Client2 });
      const profile = await gmail.users.getProfile({ userId: "me" });
      const userEmail = profile.data.emailAddress;
      const message = this.createMessage(
        userEmail,
        args.to,
        args.subject,
        args.body,
        args.cc,
        args.bcc,
        args.isHtml || false,
        args.replyToMessageId
      );
      const requestBody = {
        message: {
          raw: message,
          threadId: args.threadId
        }
      };
      const response = await gmail.users.drafts.create({
        userId: "me",
        requestBody
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              draftId: response.data.id,
              messageId: response.data.message?.id,
              threadId: response.data.message?.threadId
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  createMessage(from, to, subject, body, cc, bcc, isHtml = false, replyToMessageId) {
    const boundary = "boundary_" + Date.now();
    const toAddresses = Array.isArray(to) ? to.join(", ") : to;
    let messageParts = [
      `From: ${from}`,
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0"
    ];
    if (cc) {
      const ccAddresses = Array.isArray(cc) ? cc.join(", ") : cc;
      messageParts.push(`Cc: ${ccAddresses}`);
    }
    if (bcc) {
      const bccAddresses = Array.isArray(bcc) ? bcc.join(", ") : bcc;
      messageParts.push(`Bcc: ${bccAddresses}`);
    }
    if (replyToMessageId) {
      messageParts.push(`In-Reply-To: ${replyToMessageId}`);
      messageParts.push(`References: ${replyToMessageId}`);
    }
    if (isHtml) {
      messageParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      messageParts.push("");
      messageParts.push(`--${boundary}`);
      messageParts.push("Content-Type: text/plain; charset=UTF-8");
      messageParts.push("");
      messageParts.push(this.htmlToText(body));
      messageParts.push("");
      messageParts.push(`--${boundary}`);
      messageParts.push("Content-Type: text/html; charset=UTF-8");
      messageParts.push("");
      messageParts.push(body);
      messageParts.push("");
      messageParts.push(`--${boundary}--`);
    } else {
      messageParts.push("Content-Type: text/plain; charset=UTF-8");
      messageParts.push("");
      messageParts.push(body);
    }
    const message = messageParts.join("\r\n");
    const encodedMessage = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return encodedMessage;
  }
  htmlToText(html) {
    return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  }
};

// src/handlers/core/gmail/UpdateDraftHandler.ts
import { google as google13 } from "googleapis";
var UpdateDraftHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google13.gmail({ version: "v1", auth: oauth2Client2 });
      const profile = await gmail.users.getProfile({ userId: "me" });
      const userEmail = profile.data.emailAddress;
      const message = this.createMessage(
        userEmail,
        args.to,
        args.subject,
        args.body,
        args.cc,
        args.bcc,
        args.isHtml || false,
        args.replyToMessageId
      );
      const requestBody = {
        message: {
          raw: message,
          threadId: args.threadId
        }
      };
      const response = await gmail.users.drafts.update({
        userId: "me",
        id: args.draftId,
        requestBody
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              draftId: response.data.id,
              messageId: response.data.message?.id,
              threadId: response.data.message?.threadId
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  createMessage(from, to, subject, body, cc, bcc, isHtml = false, replyToMessageId) {
    const boundary = "boundary_" + Date.now();
    const toAddresses = Array.isArray(to) ? to.join(", ") : to;
    let messageParts = [
      `From: ${from}`,
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0"
    ];
    if (cc) {
      const ccAddresses = Array.isArray(cc) ? cc.join(", ") : cc;
      messageParts.push(`Cc: ${ccAddresses}`);
    }
    if (bcc) {
      const bccAddresses = Array.isArray(bcc) ? bcc.join(", ") : bcc;
      messageParts.push(`Bcc: ${bccAddresses}`);
    }
    if (replyToMessageId) {
      messageParts.push(`In-Reply-To: ${replyToMessageId}`);
      messageParts.push(`References: ${replyToMessageId}`);
    }
    if (isHtml) {
      messageParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      messageParts.push("");
      messageParts.push(`--${boundary}`);
      messageParts.push("Content-Type: text/plain; charset=UTF-8");
      messageParts.push("");
      messageParts.push(this.htmlToText(body));
      messageParts.push("");
      messageParts.push(`--${boundary}`);
      messageParts.push("Content-Type: text/html; charset=UTF-8");
      messageParts.push("");
      messageParts.push(body);
      messageParts.push("");
      messageParts.push(`--${boundary}--`);
    } else {
      messageParts.push("Content-Type: text/plain; charset=UTF-8");
      messageParts.push("");
      messageParts.push(body);
    }
    const message = messageParts.join("\r\n");
    const encodedMessage = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return encodedMessage;
  }
  htmlToText(html) {
    return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  }
};

// src/handlers/core/gmail/SendDraftHandler.ts
import { google as google14 } from "googleapis";
var SendDraftHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google14.gmail({ version: "v1", auth: oauth2Client2 });
      const response = await gmail.users.drafts.send({
        userId: "me",
        requestBody: {
          id: args.draftId
        }
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              messageId: response.data.id,
              threadId: response.data.threadId,
              labelIds: response.data.labelIds
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
};

// src/handlers/core/gmail/ListLabelsHandler.ts
import { google as google15 } from "googleapis";
var ListLabelsHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google15.gmail({ version: "v1", auth: oauth2Client2 });
      const response = await gmail.users.labels.list({
        userId: "me"
      });
      const labels = response.data.labels || [];
      const systemLabels = labels.filter((label) => label.type === "system");
      const userLabels = labels.filter((label) => label.type === "user");
      const formattedLabels = {
        systemLabels: systemLabels.map(this.formatLabel),
        userLabels: userLabels.map(this.formatLabel),
        totalCount: labels.length,
        systemCount: systemLabels.length,
        userCount: userLabels.length
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedLabels, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  formatLabel(label) {
    return {
      id: label.id,
      name: label.name,
      type: label.type,
      messageListVisibility: label.messageListVisibility,
      labelListVisibility: label.labelListVisibility,
      color: label.color ? {
        textColor: label.color.textColor,
        backgroundColor: label.color.backgroundColor
      } : void 0,
      messagesTotal: label.messagesTotal,
      messagesUnread: label.messagesUnread,
      threadsTotal: label.threadsTotal,
      threadsUnread: label.threadsUnread
    };
  }
};

// src/handlers/core/gmail/CreateLabelHandler.ts
import { google as google16 } from "googleapis";
var CreateLabelHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google16.gmail({ version: "v1", auth: oauth2Client2 });
      const requestBody = {
        name: args.name,
        messageListVisibility: args.messageListVisibility || "show",
        labelListVisibility: args.labelListVisibility || "labelShow"
      };
      if (args.backgroundColor || args.textColor) {
        requestBody.color = {
          backgroundColor: args.backgroundColor,
          textColor: args.textColor
        };
      }
      const response = await gmail.users.labels.create({
        userId: "me",
        requestBody
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              label: {
                id: response.data.id,
                name: response.data.name,
                type: response.data.type,
                messageListVisibility: response.data.messageListVisibility,
                labelListVisibility: response.data.labelListVisibility,
                color: response.data.color
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
};

// src/handlers/core/gmail/UpdateLabelHandler.ts
import { google as google17 } from "googleapis";
var UpdateLabelHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google17.gmail({ version: "v1", auth: oauth2Client2 });
      const requestBody = {};
      if (args.name) {
        requestBody.name = args.name;
      }
      if (args.messageListVisibility) {
        requestBody.messageListVisibility = args.messageListVisibility;
      }
      if (args.labelListVisibility) {
        requestBody.labelListVisibility = args.labelListVisibility;
      }
      if (args.backgroundColor || args.textColor) {
        requestBody.color = {
          backgroundColor: args.backgroundColor,
          textColor: args.textColor
        };
      }
      const response = await gmail.users.labels.patch({
        userId: "me",
        id: args.labelId,
        requestBody
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              label: {
                id: response.data.id,
                name: response.data.name,
                type: response.data.type,
                messageListVisibility: response.data.messageListVisibility,
                labelListVisibility: response.data.labelListVisibility,
                color: response.data.color,
                messagesTotal: response.data.messagesTotal,
                messagesUnread: response.data.messagesUnread,
                threadsTotal: response.data.threadsTotal,
                threadsUnread: response.data.threadsUnread
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
};

// src/handlers/core/gmail/DeleteLabelHandler.ts
import { google as google18 } from "googleapis";
var DeleteLabelHandler = class extends BaseToolHandler {
  async runTool(args, oauth2Client2) {
    try {
      const gmail = google18.gmail({ version: "v1", auth: oauth2Client2 });
      await gmail.users.labels.delete({
        userId: "me",
        id: args.labelId
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Label ${args.labelId} deleted successfully`,
              warning: "This action removed the label from all messages and threads"
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }
};

// src/handlers/core/gmail/BatchUpdateEmailsHandler.ts
import { google as google19 } from "googleapis";

// src/handlers/core/gmail/utils/rateLimiter.ts
var GmailRateLimiter = class _GmailRateLimiter {
  static MIN_DELAY = 100;
  // 100ms
  static MAX_DELAY = 6e4;
  // 60s
  static BACKOFF_MULTIPLIER = 2;
  static LOW_QUOTA_THRESHOLD = 0.1;
  // 10% remaining
  currentDelay = _GmailRateLimiter.MIN_DELAY;
  consecutiveErrors = 0;
  /**
   * Extract rate limit info from response headers
   * Headers can be in various cases: x-ratelimit-limit, X-RateLimit-Limit, etc.
   */
  static extractRateLimitInfo(headers) {
    const info = {};
    if (!headers) return info;
    const getHeader = (name) => {
      const lowercase = name.toLowerCase();
      if (headers[lowercase]) return headers[lowercase];
      if (headers[name]) return headers[name];
      for (const key in headers) {
        if (key.toLowerCase() === lowercase) {
          return headers[key];
        }
      }
      return void 0;
    };
    const limit = getHeader("x-ratelimit-limit");
    const remaining = getHeader("x-ratelimit-remaining");
    const reset = getHeader("x-ratelimit-reset");
    if (limit) info.limit = parseInt(limit);
    if (remaining) info.remaining = parseInt(remaining);
    if (reset) info.reset = parseInt(reset);
    return info;
  }
  /**
   * Calculate delay based on rate limit info and error status
   */
  calculateDelay(rateLimitInfo, isError = false) {
    if (isError) {
      this.consecutiveErrors++;
      this.currentDelay = Math.min(
        this.currentDelay * Math.pow(_GmailRateLimiter.BACKOFF_MULTIPLIER, this.consecutiveErrors),
        _GmailRateLimiter.MAX_DELAY
      );
      return this.currentDelay;
    }
    this.consecutiveErrors = 0;
    if (rateLimitInfo.limit && rateLimitInfo.remaining !== void 0) {
      const quotaUsedRatio = 1 - rateLimitInfo.remaining / rateLimitInfo.limit;
      if (quotaUsedRatio > 1 - _GmailRateLimiter.LOW_QUOTA_THRESHOLD) {
        const scaleFactor = 1 + (quotaUsedRatio - 0.9) * 10;
        this.currentDelay = Math.min(
          _GmailRateLimiter.MIN_DELAY * scaleFactor * 10,
          _GmailRateLimiter.MAX_DELAY
        );
      } else {
        this.currentDelay = _GmailRateLimiter.MIN_DELAY;
      }
    }
    return this.currentDelay;
  }
  /**
   * Wait for the calculated delay
   */
  async wait() {
    if (this.currentDelay > 0) {
      await new Promise((resolve2) => setTimeout(resolve2, this.currentDelay));
    }
  }
  /**
   * Handle 429 rate limit error with retry-after header
   */
  handle429(retryAfter) {
    if (retryAfter) {
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds)) {
        this.currentDelay = seconds * 1e3;
      } else {
        const retryDate = new Date(retryAfter).getTime();
        if (!isNaN(retryDate)) {
          this.currentDelay = Math.max(0, retryDate - Date.now());
        }
      }
    } else {
      this.consecutiveErrors++;
      this.currentDelay = Math.min(
        1e3 * Math.pow(_GmailRateLimiter.BACKOFF_MULTIPLIER, this.consecutiveErrors),
        _GmailRateLimiter.MAX_DELAY
      );
    }
    return this.currentDelay;
  }
};

// src/handlers/core/gmail/BatchUpdateEmailsHandler.ts
var BatchUpdateEmailsHandler = class _BatchUpdateEmailsHandler extends BaseToolHandler {
  static CHUNK_SIZE = 50;
  // Gmail recommends max 50 for batch operations
  static PARALLEL_VERIFY_LIMIT = 20;
  // Concurrent verification requests
  async runTool(args, oauth2Client2) {
    try {
      if (!args.messageIds || args.messageIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "No message IDs provided",
              messageCount: 0
            }, null, 2)
          }]
        };
      }
      const gmail = google19.gmail({ version: "v1", auth: oauth2Client2 });
      if (args.moveToTrash) {
        return this.handleBatchTrash(gmail, args.messageIds);
      }
      const mutation = LabelMutationBuilder.build(args);
      if (mutation.addLabelIds.length === 0 && mutation.removeLabelIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "No label changes requested",
              messageCount: args.messageIds.length
            }, null, 2)
          }]
        };
      }
      console.log("BatchUpdateEmails - Starting operation:", {
        totalMessages: args.messageIds.length,
        addLabelIds: mutation.addLabelIds,
        removeLabelIds: mutation.removeLabelIds
      });
      const results = await this.processMessagesWithVerification(
        gmail,
        args.messageIds,
        mutation
      );
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);
      console.log("BatchUpdateEmails - Final summary:", {
        total: args.messageIds.length,
        successful: successful.length,
        failed: failed.length
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: failed.length === 0,
            action: "batch_modified",
            summary: {
              total: args.messageIds.length,
              successful: successful.length,
              failed: failed.length
            },
            details: {
              successfulIds: successful.map((r) => r.id),
              failedOperations: failed.map((r) => ({
                id: r.id,
                reason: r.error || r.skippedReason || "Unknown error"
              })),
              addedLabels: mutation.addLabelIds,
              removedLabels: mutation.removeLabelIds
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      console.error("BatchUpdateEmails - Fatal error:", {
        message: error.message,
        code: error.code,
        errors: error.errors,
        response: error.response?.data
      });
      this.handleGoogleApiError(error);
      throw error;
    }
  }
  async handleBatchTrash(gmail, messageIds) {
    try {
      const chunks = this.chunkArray(messageIds, 1e3);
      for (const chunk of chunks) {
        await gmail.users.messages.batchDelete({
          userId: "me",
          requestBody: {
            ids: chunk
          }
        });
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "batch_moved_to_trash",
            messageCount: messageIds.length,
            messageIds
          }, null, 2)
        }]
      };
    } catch (error) {
      console.error("BatchUpdateEmails - Trash operation failed:", error);
      throw error;
    }
  }
  async processMessagesWithVerification(gmail, messageIds, mutation) {
    const rateLimiter = new GmailRateLimiter();
    const chunks = this.chunkArray(messageIds, _BatchUpdateEmailsHandler.CHUNK_SIZE);
    const allResults = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkIndex = i + 1;
      const totalChunks = chunks.length;
      console.log(`BatchUpdateEmails - Processing chunk ${chunkIndex}/${totalChunks} (${chunk.length} messages)`);
      if (i > 0) {
        await rateLimiter.wait();
      }
      try {
        const response = await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: {
            ids: chunk,
            addLabelIds: mutation.addLabelIds,
            removeLabelIds: mutation.removeLabelIds
          }
        });
        const rateLimitInfo = GmailRateLimiter.extractRateLimitInfo(response.headers);
        console.log("BatchUpdateEmails - Rate limit info:", rateLimitInfo);
        rateLimiter.calculateDelay(rateLimitInfo);
        const chunkResults = await this.verifyBatchResults(gmail, chunk, mutation);
        allResults.push(...chunkResults);
        const failures = chunkResults.filter((r) => !r.success);
        if (failures.length > 0) {
          console.log(`BatchUpdateEmails - Retrying ${failures.length} failed messages individually`);
          for (const failed of failures) {
            const retryResult = await this.retryIndividualMessage(
              gmail,
              failed.id,
              mutation,
              rateLimiter
            );
            const index = allResults.findIndex((r) => r.id === failed.id);
            if (index !== -1) {
              allResults[index] = retryResult;
            }
          }
        }
      } catch (error) {
        console.error(`BatchUpdateEmails - Chunk ${chunkIndex} failed:`, error);
        if (error.code === 429) {
          const retryAfter = error.response?.headers?.["retry-after"];
          const delay = rateLimiter.handle429(retryAfter);
          console.log(`BatchUpdateEmails - Rate limited, waiting ${delay}ms`);
          await rateLimiter.wait();
          i--;
          continue;
        }
        chunk.forEach((id) => {
          allResults.push({
            id,
            success: false,
            error: error.message || "Batch operation failed"
          });
        });
      }
    }
    return allResults;
  }
  async verifyBatchResults(gmail, messageIds, mutation) {
    const verifyPromises = messageIds.map(
      (id) => this.createThrottledVerification(gmail, id, mutation)
    );
    const results = [];
    const limit = _BatchUpdateEmailsHandler.PARALLEL_VERIFY_LIMIT;
    for (let i = 0; i < verifyPromises.length; i += limit) {
      const batch = verifyPromises.slice(i, i + limit);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    return results;
  }
  async createThrottledVerification(gmail, messageId, mutation) {
    try {
      const message = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "minimal"
      });
      const currentLabels = message.data.labelIds || [];
      const expectedAdded = mutation.addLabelIds.every(
        (label) => currentLabels.includes(label)
      );
      const expectedRemoved = mutation.removeLabelIds.every(
        (label) => !currentLabels.includes(label)
      );
      const success = expectedAdded && expectedRemoved;
      return {
        id: messageId,
        success,
        postLabels: currentLabels,
        error: success ? void 0 : "Labels not updated as expected"
      };
    } catch (error) {
      return {
        id: messageId,
        success: false,
        error: `Verification failed: ${error.message}`
      };
    }
  }
  async retryIndividualMessage(gmail, messageId, mutation, rateLimiter) {
    try {
      const preCheck = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "minimal"
      });
      const currentLabels = preCheck.data.labelIds || [];
      if (!LabelMutationBuilder.canModifyLabels(currentLabels, mutation)) {
        return {
          id: messageId,
          success: false,
          preLabels: currentLabels,
          skippedReason: "Message in TRASH/SPAM - label modifications not allowed"
        };
      }
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          addLabelIds: mutation.addLabelIds,
          removeLabelIds: mutation.removeLabelIds
        }
      });
      await new Promise((resolve2) => setTimeout(resolve2, 100));
      const postCheck = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "minimal"
      });
      const finalLabels = postCheck.data.labelIds || [];
      const expectedAdded = mutation.addLabelIds.every(
        (label) => finalLabels.includes(label)
      );
      const expectedRemoved = mutation.removeLabelIds.every(
        (label) => !finalLabels.includes(label)
      );
      const success = expectedAdded && expectedRemoved;
      return {
        id: messageId,
        success,
        preLabels: currentLabels,
        postLabels: finalLabels,
        error: success ? void 0 : "Retry succeeded but verification failed"
      };
    } catch (error) {
      if (error.code === 429) {
        const retryAfter = error.response?.headers?.["retry-after"];
        rateLimiter.handle429(retryAfter);
      }
      return {
        id: messageId,
        success: false,
        error: `Individual retry failed: ${error.message}`
      };
    }
  }
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
};

// src/handlers/callTool.ts
async function handleCallTool(request, oauth2Client2) {
  const { name, arguments: args } = request.params;
  try {
    const handler = getHandler(name);
    return await handler.runTool(args, oauth2Client2);
  } catch (error) {
    console.error(`Error executing tool '${name}':`, error);
    throw error;
  }
}
var handlerMap = {
  // Calendar handlers
  "list-calendars": new ListCalendarsHandler(),
  "list-events": new ListEventsHandler(),
  "search-events": new SearchEventsHandler(),
  "list-colors": new ListColorsHandler(),
  "create-event": new CreateEventHandler(),
  "update-event": new UpdateEventHandler(),
  "delete-event": new DeleteEventHandler(),
  "get-freebusy": new FreeBusyEventHandler(),
  // Contact handlers
  "list-contacts": new ListContactsHandler(),
  "get-contact": new GetContactHandler(),
  "create-contact": new CreateContactHandler(),
  "update-contact": new UpdateContactHandler(),
  "delete-contact": new DeleteContactHandler(),
  // Gmail handlers
  "list-emails": new ListEmailsHandler(),
  "get-email": new GetEmailHandler(),
  "send-email": new SendEmailHandler(),
  "update-email": new UpdateEmailHandler(),
  "delete-email": new DeleteEmailHandler(),
  "create-draft": new CreateDraftHandler(),
  "update-draft": new UpdateDraftHandler(),
  "send-draft": new SendDraftHandler(),
  "list-labels": new ListLabelsHandler(),
  "create-label": new CreateLabelHandler(),
  "update-label": new UpdateLabelHandler(),
  "delete-label": new DeleteLabelHandler(),
  "batch-update-emails": new BatchUpdateEmailsHandler()
};
function getHandler(toolName) {
  const handler = handlerMap[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return handler;
}

// src/index.ts
var __filename = fileURLToPath2(import.meta.url);
var __dirname = dirname3(__filename);
var packageJsonPath = join2(__dirname, "..", "package.json");
var packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
var VERSION = packageJson.version;
var server = new Server(
  {
    name: "google-workspace",
    version: VERSION
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
var oauth2Client;
var tokenManager;
var authServer;
async function main() {
  try {
    oauth2Client = await initializeOAuth2Client();
    tokenManager = new TokenManager(oauth2Client);
    authServer = new AuthServer(oauth2Client);
    const authSuccess = await authServer.start();
    if (!authSuccess) {
      process.exit(1);
    }
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return getToolDefinitions();
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!await tokenManager.validateTokens()) {
        throw new Error("Authentication required. Please run 'npm run auth' to authenticate.");
      }
      return handleCallTool(request, oauth2Client);
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  } catch (error) {
    process.stderr.write(`Server startup failed: ${error}
`);
    process.exit(1);
  }
}
async function cleanup() {
  try {
    if (authServer) {
      await authServer.stop();
    }
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}
async function runAuthServer() {
  try {
    const oauth2Client2 = await initializeOAuth2Client();
    const authServerInstance = new AuthServer(oauth2Client2);
    const success = await authServerInstance.start(true);
    if (!success && !authServerInstance.authCompletedSuccessfully) {
      console.error(
        "Authentication failed. Could not start server or validate existing tokens. Check port availability (3000-3004) and try again."
      );
      process.exit(1);
    } else if (authServerInstance.authCompletedSuccessfully) {
      console.log("Authentication successful.");
      process.exit(0);
    }
    console.log(
      "Authentication server started. Please complete the authentication in your browser..."
    );
    const intervalId = setInterval(async () => {
      if (authServerInstance.authCompletedSuccessfully) {
        clearInterval(intervalId);
        await authServerInstance.stop();
        console.log("Authentication completed successfully!");
        process.exit(0);
      }
    }, 1e3);
  } catch (error) {
    console.error("Authentication failed:", error);
    process.exit(1);
  }
}
function showHelp() {
  console.log(`
Google Workspace MCP Server v${VERSION}

Usage:
  npx @cocal/google-calendar-mcp [command]

Commands:
  auth     Run the authentication flow
  start    Start the MCP server (default)
  version  Show version information
  help     Show this help message

Examples:
  npx @cocal/google-calendar-mcp auth
  npx @cocal/google-calendar-mcp start
  npx @cocal/google-calendar-mcp version
  npx @cocal/google-calendar-mcp

Environment Variables:
  GOOGLE_OAUTH_CREDENTIALS    Path to OAuth credentials file
`);
}
function showVersion() {
  console.log(`Google Workspace MCP Server v${VERSION}`);
}
function parseCliArgs() {
  const args = process.argv.slice(2);
  let command2;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--version" || arg === "-v" || arg === "--help" || arg === "-h") {
      command2 = arg;
      continue;
    }
    if (!command2 && !arg.startsWith("--")) {
      command2 = arg;
      continue;
    }
  }
  return { command: command2 };
}
var { command } = parseCliArgs();
switch (command) {
  case "auth":
    runAuthServer().catch((error) => {
      console.error("Authentication failed:", error);
      process.exit(1);
    });
    break;
  case "start":
  case void 0:
    main().catch((error) => {
      process.stderr.write(`Failed to start server: ${error}
`);
      process.exit(1);
    });
    break;
  case "version":
  case "--version":
  case "-v":
    showVersion();
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
export {
  main,
  runAuthServer,
  server
};
//# sourceMappingURL=index.js.map
