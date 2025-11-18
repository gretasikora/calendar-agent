var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/handlers/core/BaseToolHandler.ts
import { GaxiosError as GaxiosError2 } from "gaxios";
import { google } from "googleapis";
var BaseToolHandler;
var init_BaseToolHandler = __esm({
  "src/handlers/core/BaseToolHandler.ts"() {
    "use strict";
    BaseToolHandler = class {
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
  }
});

// src/schemas/validators.ts
var validators_exports = {};
__export(validators_exports, {
  CreateEventArgumentsSchema: () => CreateEventArgumentsSchema,
  DeleteEventArgumentsSchema: () => DeleteEventArgumentsSchema,
  FreeBusyEventArgumentsSchema: () => FreeBusyEventArgumentsSchema,
  ListEventsArgumentsSchema: () => ListEventsArgumentsSchema,
  ReminderSchema: () => ReminderSchema,
  RemindersSchema: () => RemindersSchema,
  SearchEventsArgumentsSchema: () => SearchEventsArgumentsSchema,
  UpdateEventArgumentsSchema: () => UpdateEventArgumentsSchema
});
import { z } from "zod";
var ReminderSchema, RemindersSchema, isoDateTimeWithTimezone, ListEventsArgumentsSchema, SearchEventsArgumentsSchema, CreateEventArgumentsSchema, UpdateEventArgumentsSchema, DeleteEventArgumentsSchema, FreeBusyEventArgumentsSchema;
var init_validators = __esm({
  "src/schemas/validators.ts"() {
    "use strict";
    ReminderSchema = z.object({
      method: z.enum(["email", "popup"]).default("popup"),
      minutes: z.number()
    });
    RemindersSchema = z.object({
      useDefault: z.boolean(),
      overrides: z.array(ReminderSchema).optional()
    });
    isoDateTimeWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
    ListEventsArgumentsSchema = z.object({
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
    SearchEventsArgumentsSchema = z.object({
      calendarId: z.string(),
      query: z.string(),
      timeMin: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)").optional(),
      timeMax: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-12-31T23:59:59Z)").optional()
    });
    CreateEventArgumentsSchema = z.object({
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
      recurrence: z.array(z.string()).optional(),
      conferenceData: z.object({
        createRequest: z.object({
          requestId: z.string().optional(),
          conferenceSolutionKey: z.object({
            type: z.string()
          }).optional()
        }).optional()
      }).optional(),
      sendUpdates: z.enum(["all", "externalOnly", "none"]).optional()
    });
    UpdateEventArgumentsSchema = z.object({
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
    DeleteEventArgumentsSchema = z.object({
      calendarId: z.string(),
      eventId: z.string()
    });
    FreeBusyEventArgumentsSchema = z.object({
      timeMin: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
      timeMax: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
      timeZone: z.string().optional(),
      groupExpansionMax: z.number().int().max(100).optional(),
      calendarExpansionMax: z.number().int().max(50).optional(),
      items: z.array(z.object({
        id: z.string().email("Must be a valid email address")
      }))
    });
  }
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
var init_utils = __esm({
  "src/handlers/utils.ts"() {
    "use strict";
  }
});

// src/handlers/core/BatchRequestHandler.ts
var BatchRequestError, BatchRequestHandler;
var init_BatchRequestHandler = __esm({
  "src/handlers/core/BatchRequestHandler.ts"() {
    "use strict";
    BatchRequestError = class extends Error {
      constructor(message, errors, partial = false) {
        super(message);
        this.errors = errors;
        this.partial = partial;
        this.name = "BatchRequestError";
      }
    };
    BatchRequestHandler = class {
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
  }
});

// src/handlers/core/ListEventsHandler.ts
var ListEventsHandler_exports = {};
__export(ListEventsHandler_exports, {
  ListEventsHandler: () => ListEventsHandler
});
var ListEventsHandler;
var init_ListEventsHandler = __esm({
  "src/handlers/core/ListEventsHandler.ts"() {
    "use strict";
    init_validators();
    init_BaseToolHandler();
    init_utils();
    init_BatchRequestHandler();
    ListEventsHandler = class extends BaseToolHandler {
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
  }
});

// src/handlers/core/FreeBusyEventHandler.ts
var FreeBusyEventHandler_exports = {};
__export(FreeBusyEventHandler_exports, {
  FreeBusyEventHandler: () => FreeBusyEventHandler
});
var FreeBusyEventHandler;
var init_FreeBusyEventHandler = __esm({
  "src/handlers/core/FreeBusyEventHandler.ts"() {
    "use strict";
    init_BaseToolHandler();
    init_validators();
    FreeBusyEventHandler = class extends BaseToolHandler {
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
  }
});

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
      // Priority 1: Check for tokens in environment variable (for Railway/deployment)
      const envTokens = process.env.GOOGLE_CALENDAR_TOKENS;
      if (envTokens) {
        try {
          const tokens = JSON.parse(envTokens);
          if (tokens && typeof tokens === "object") {
            this.oauth2Client.setCredentials(tokens);
            console.log("Loaded tokens from environment variable");
            return true;
          }
        } catch (parseError) {
          console.error("Error parsing tokens from environment variable:", parseError);
          // Fall through to file-based loading
        }
      }

      // Priority 2: Load from file
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

// src/handlers/core/ListCalendarsHandler.ts
init_BaseToolHandler();
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

// src/handlers/callTool.ts
init_ListEventsHandler();

// src/handlers/core/SearchEventsHandler.ts
init_validators();
init_BaseToolHandler();
init_utils();
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
init_BaseToolHandler();
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
init_validators();
init_BaseToolHandler();
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
      if (args.conferenceData) {
        // Use explicitly provided conference data (for online meetings)
        requestBody.conferenceData = args.conferenceData;
      } else if (args.attendees && args.attendees.length > 0 && args.conferenceDataVersion !== 0) {
        // Auto-add Google Meet only if conferenceDataVersion is not explicitly set to 0
        // This allows in-person meetings to send invites without Google Meet
        const requestId = `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        requestBody.conferenceData = {
          createRequest: {
            requestId,
            conferenceSolutionKey: {
              type: "hangoutsMeet"
            }
          }
        };
      }
      // Only need conference data version if we actually have conference data
      const hasConferenceData = requestBody.conferenceData !== undefined;
      const insertOptions = {
        calendarId: args.calendarId,
        requestBody
      };
      if (hasConferenceData) {
        // Use explicitly provided version, or default to 1
        insertOptions.conferenceDataVersion = args.conferenceDataVersion !== undefined ? args.conferenceDataVersion : 1;
      }
      if (args.attendees && args.attendees.length > 0) {
        insertOptions.sendUpdates = args.sendUpdates || "all";
      }
      const response = await calendar.events.insert(insertOptions);
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

// src/handlers/core/UpdateEventHandler.ts
init_validators();
init_BaseToolHandler();

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
init_validators();
init_BaseToolHandler();
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

// src/handlers/callTool.ts
init_FreeBusyEventHandler();

// src/handlers/core/contacts/ListContactsHandler.ts
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
init_BaseToolHandler();
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
app.post("/mcp/calendar", async (req, res) => {
  try {
    const { user_id, action, params } = req.body;
    const toolNameMap = {
      "freebusy": "get-freebusy",
      "list-events": "list-events",
      "create-event": "create-event",
      "update-event": "update-event",
      "delete-event": "delete-event",
      "list-calendars": "list-calendars"
    };
    const actionsNeedingRawData = ["get-freebusy", "list-events"];
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
        const { FreeBusyEventHandler: FreeBusyEventHandler2 } = await Promise.resolve().then(() => (init_FreeBusyEventHandler(), FreeBusyEventHandler_exports));
        const { FreeBusyEventArgumentsSchema: FreeBusyEventArgumentsSchema2 } = await Promise.resolve().then(() => (init_validators(), validators_exports));
        const handler = new FreeBusyEventHandler2();
        const validArgs = FreeBusyEventArgumentsSchema2.safeParse(params);
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
        const { ListEventsHandler: ListEventsHandler2 } = await Promise.resolve().then(() => (init_ListEventsHandler(), ListEventsHandler_exports));
        const { ListEventsArgumentsSchema: ListEventsArgumentsSchema2 } = await Promise.resolve().then(() => (init_validators(), validators_exports));
        const handler = new ListEventsHandler2();
        const validArgs = ListEventsArgumentsSchema2.safeParse(params);
        if (validArgs.success) {
          // Normalize calendarId to array (fetchEvents expects an array)
          const calendarId = validArgs.data.calendarId;
          if (!calendarId) {
            throw new Error("calendarId is required");
          }
          const calendarIds = Array.isArray(calendarId) 
            ? calendarId 
            : [calendarId];
          // Ensure calendarIds is actually an array
          if (!Array.isArray(calendarIds)) {
            throw new Error(`calendarId must be a string or array, got: ${typeof calendarId}`);
          }
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
          const { google: google20 } = await import("googleapis");
          const calendar = google20.calendar({ version: "v3", auth: oauth2Client });
          const { CreateEventArgumentsSchema: CreateEventArgumentsSchema2 } = await Promise.resolve().then(() => (init_validators(), validators_exports));
          const validArgs = CreateEventArgumentsSchema2.safeParse(params);
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
