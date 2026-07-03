// src/http-server.ts
import express from "express";

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

// src/http-server.ts
var app = express();
app.use(express.json());
var oauth2Client;
var tokenManager;
async function initialize() {
  try {
    oauth2Client = await initializeOAuth2Client();
    tokenManager = new TokenManager(oauth2Client);
    const tokensValid = await tokenManager.validateTokens();
    if (!tokensValid) {
      throw new Error('Authentication required. Please run "npm run auth" first.');
    }
    console.log("OAuth client initialized");
  } catch (error) {
    console.error("Failed to initialize OAuth:", error);
    process.exit(1);
  }
}
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
var toolNameMap = {
  "freebusy": "get-freebusy",
  "list-events": "list-events",
  "create-event": "create-event",
  "update-event": "update-event",
  "delete-event": "delete-event",
  "list-calendars": "list-calendars"
};
app.post("/mcp/calendar", async (req, res) => {
  try {
    const tokensValid = await tokenManager.validateTokens();
    if (!tokensValid) {
      return res.status(401).json({
        error: "Authentication token is invalid or expired and could not be refreshed. Please re-run the authentication flow.",
        content: []
      });
    }
  } catch (authError) {
    console.error("Token validation failed:", authError);
    return res.status(401).json({
      error: "Failed to validate authentication tokens.",
      content: []
    });
  }
  try {
    const { action, params } = req.body;
    const toolName = toolNameMap[action] || action;
    const mcpRequest = {
      method: "tools/call",
      params: {
        name: toolName,
        arguments: params || {}
      }
    };
    const result = await handleCallTool(mcpRequest, oauth2Client);
    if (toolName === "get-freebusy" && params) {
      try {
        const handler = new FreeBusyEventHandler();
        const validArgs = FreeBusyEventArgumentsSchema.safeParse(params);
        if (validArgs.success) {
          const rawData = await handler.queryFreeBusy(oauth2Client, validArgs.data);
          result.raw = rawData;
          const allBusySlots = [];
          if (rawData.calendars) {
            for (const calendarId in rawData.calendars) {
              const calendarInfo = rawData.calendars[calendarId];
              if (calendarInfo.busy) {
                allBusySlots.push(...calendarInfo.busy);
              }
            }
          }
          result.busy = allBusySlots;
        }
      } catch (e) {
        console.error("Error getting raw freebusy data:", e);
      }
    }
    if (toolName === "list-events" && params) {
      try {
        const handler = new ListEventsHandler();
        const validArgs = ListEventsArgumentsSchema.safeParse(params);
        if (validArgs.success) {
          const calendarId = validArgs.data.calendarId;
          if (!calendarId) {
            throw new Error("calendarId is required");
          }
          const calendarIds = Array.isArray(calendarId) ? calendarId : [calendarId];
          const rawEvents = await handler.fetchEvents(oauth2Client, calendarIds, {
            timeMin: validArgs.data.timeMin,
            timeMax: validArgs.data.timeMax
          });
          result.raw = rawEvents;
          result.events = rawEvents;
        }
      } catch (e) {
        console.error("Error getting raw events data:", e);
      }
    }
    if (toolName === "create-event" && params) {
      try {
        let eventId = null;
        if (result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            if (item.type === "text" && item.text) {
              const match = item.text.match(/\(([^)]+)\)/);
              if (match) {
                eventId = match[1];
                break;
              }
            }
          }
        }
        if (eventId) {
          const { google: google2 } = await import("googleapis");
          const calendar = google2.calendar({ version: "v3", auth: oauth2Client });
          const validArgs = CreateEventArgumentsSchema.safeParse(params);
          if (validArgs.success) {
            try {
              const eventResponse = await calendar.events.get({
                calendarId: validArgs.data.calendarId,
                eventId
              });
              const eventData = eventResponse.data;
              if (eventData) {
                result.raw = eventData;
                result.event = eventData;
              }
            } catch (fetchError) {
              console.error("Error fetching event details:", fetchError);
            }
          }
        }
      } catch (e) {
        console.error("Error getting raw event data:", e);
      }
    }
    res.json(result);
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
      content: []
    });
  }
});
var PORT = process.env.PORT || 3e3;
async function startServer() {
  await initialize();
  app.listen(PORT, () => {
    console.log(`MCP HTTP Server running on http://localhost:${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/mcp/calendar`);
  });
}
startServer().catch(console.error);
//# sourceMappingURL=http-server.js.map
