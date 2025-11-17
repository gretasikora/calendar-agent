// src/auth/client.ts
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs/promises";

// src/auth/utils.ts
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
function getProjectRoot() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.join(__dirname, "..");
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
    const oauth2Client = new OAuth2Client({
      clientId: credentials.client_id,
      clientSecret: credentials.client_secret,
      redirectUri: credentials.redirect_uris[0]
    });
    return oauth2Client;
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
  constructor(oauth2Client) {
    this.oauth2Client = oauth2Client;
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
  constructor(oauth2Client) {
    this.baseOAuth2Client = oauth2Client;
    this.tokenManager = new TokenManager(oauth2Client);
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

// src/auth-server.ts
async function runAuthServer() {
  let authServer = null;
  try {
    const oauth2Client = await initializeOAuth2Client();
    authServer = new AuthServer(oauth2Client);
    const success = await authServer.start(true);
    if (!success && !authServer.authCompletedSuccessfully) {
      process.stderr.write("Authentication failed. Could not start server or validate existing tokens. Check port availability (3000-3004) and try again.\n");
      process.exit(1);
    } else if (authServer.authCompletedSuccessfully) {
      process.stderr.write("Authentication successful.\n");
      process.exit(0);
    }
    process.stderr.write("Authentication server started. Please complete the authentication in your browser...\n");
    const pollInterval = setInterval(async () => {
      if (authServer?.authCompletedSuccessfully) {
        clearInterval(pollInterval);
        await authServer.stop();
        process.stderr.write("Authentication successful. Server stopped.\n");
        process.exit(0);
      }
    }, 1e3);
    process.on("SIGINT", async () => {
      clearInterval(pollInterval);
      if (authServer) {
        await authServer.stop();
      }
      process.exit(0);
    });
  } catch (error) {
    process.stderr.write(`Authentication error: ${error instanceof Error ? error.message : "Unknown error"}
`);
    if (authServer) await authServer.stop();
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
//# sourceMappingURL=auth-server.js.map
