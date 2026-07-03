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
3. Enable this API:
   - Google Calendar API
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
  // When tokens are supplied via the GOOGLE_CALENDAR_TOKENS env var (e.g. on
  // Railway), the filesystem is ephemeral and not the source of truth. In that
  // case we keep refreshed credentials in memory only and skip file writes.
  usingEnvTokens = false;
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
      if (this.usingEnvTokens) {
        console.error("Access token refreshed (in-memory; sourced from environment)");
        return;
      }
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
            this.usingEnvTokens = true;
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
    this.oauth2Client.setCredentials(tokens);
    if (this.usingEnvTokens) {
      console.error("Tokens set in memory (sourced from environment; not written to disk)");
      return;
    }
    try {
      await this.ensureTokenDirectoryExists();
      await fs2.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 384 });
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
        "https://www.googleapis.com/auth/calendar"
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
            <title>Calendar Agent Authentication</title>
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
                <h1>\u{1F5D3}\uFE0F Calendar Agent</h1>
                <h2>Authentication Required</h2>
                <p>The Calendar Agent needs permission to access your Google Calendar.</p>
                
                <div class="permissions">
                    <h3>This will allow the agent to:</h3>
                    <ul>
                        <li>View your calendar events</li>
                        <li>Create new calendar events</li>
                        <li>Update existing events</li>
                        <li>Delete events</li>
                        <li>Check your availability</li>
                    </ul>
                </div>
                
                <a href="${authUrl}" class="btn">Connect Google Calendar</a>
                
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
          "https://www.googleapis.com/auth/calendar"
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
  "get-freebusy": new FreeBusyEventHandler()
};
function getHandler(toolName) {
  const handler = handlerMap[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return handler;
}

// src/auth-server.ts
async function runAuthServer() {
  let authServer2 = null;
  try {
    const oauth2Client2 = await initializeOAuth2Client();
    authServer2 = new AuthServer(oauth2Client2);
    const success = await authServer2.start(true);
    if (!success && !authServer2.authCompletedSuccessfully) {
      process.stderr.write("Authentication failed. Could not start server or validate existing tokens. Check port availability (3000-3004) and try again.\n");
      process.exit(1);
    } else if (authServer2.authCompletedSuccessfully) {
      process.stderr.write("Authentication successful.\n");
      process.exit(0);
    }
    process.stderr.write("Authentication server started. Please complete the authentication in your browser...\n");
    const pollInterval = setInterval(async () => {
      if (authServer2?.authCompletedSuccessfully) {
        clearInterval(pollInterval);
        await authServer2.stop();
        process.stderr.write("Authentication successful. Server stopped.\n");
        process.exit(0);
      }
    }, 1e3);
    process.on("SIGINT", async () => {
      clearInterval(pollInterval);
      if (authServer2) {
        await authServer2.stop();
      }
      process.exit(0);
    });
  } catch (error) {
    process.stderr.write(`Authentication error: ${error instanceof Error ? error.message : "Unknown error"}
`);
    if (authServer2) await authServer2.stop();
    process.exit(1);
  }
}
if (import.meta.url.endsWith("auth-server.js")) {
  runAuthServer().catch((error) => {
    process.stderr.write(`Unhandled error: ${error instanceof Error ? error.message : "Unknown error"}
`);
    process.exit(1);
  });
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
