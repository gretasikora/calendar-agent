import express from "express";
import { OAuth2Client } from "google-auth-library";
import { initializeOAuth2Client } from "./auth/client.js";
import { TokenManager } from "./auth/tokenManager.js";
import { handleCallTool } from "./handlers/callTool.js";
import { FreeBusyEventHandler } from "./handlers/core/FreeBusyEventHandler.js";
import { ListEventsHandler } from "./handlers/core/ListEventsHandler.js";
import {
  FreeBusyEventArgumentsSchema,
  ListEventsArgumentsSchema,
  CreateEventArgumentsSchema,
} from "./schemas/validators.js";

const app = express();
app.use(express.json());

let oauth2Client: OAuth2Client;
let tokenManager: TokenManager;

async function initialize(): Promise<void> {
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

// Maps the simplified action names used by the Flask client to MCP tool names.
const toolNameMap: Record<string, string> = {
  "freebusy": "get-freebusy",
  "list-events": "list-events",
  "create-event": "create-event",
  "update-event": "update-event",
  "delete-event": "delete-event",
  "list-calendars": "list-calendars",
};

app.post("/mcp/calendar", async (req, res) => {
  // Ensure the Google access token is fresh on every request. The access token
  // lives ~1 hour; validateTokens() refreshes it via the long-lived refresh
  // token when it is expired or nearing expiry.
  try {
    const tokensValid = await tokenManager.validateTokens();
    if (!tokensValid) {
      return res.status(401).json({
        error:
          "Authentication token is invalid or expired and could not be refreshed. Please re-run the authentication flow.",
        content: [],
      });
    }
  } catch (authError) {
    console.error("Token validation failed:", authError);
    return res.status(401).json({
      error: "Failed to validate authentication tokens.",
      content: [],
    });
  }

  try {
    const { action, params } = req.body;
    const toolName = toolNameMap[action] || action;

    const mcpRequest = {
      method: "tools/call",
      params: {
        name: toolName,
        arguments: params || {},
      },
    };

    const result: any = await handleCallTool(mcpRequest as any, oauth2Client);

    // Attach raw freebusy data (busy slots) for the freebusy action.
    if (toolName === "get-freebusy" && params) {
      try {
        const handler = new FreeBusyEventHandler();
        const validArgs = FreeBusyEventArgumentsSchema.safeParse(params);
        if (validArgs.success) {
          const rawData = await handler.queryFreeBusy(oauth2Client, validArgs.data);
          result.raw = rawData;
          const allBusySlots: any[] = [];
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

    // Attach raw event objects for the list-events action.
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
            timeMax: validArgs.data.timeMax,
          });
          result.raw = rawEvents;
          result.events = rawEvents;
        }
      } catch (e) {
        console.error("Error getting raw events data:", e);
      }
    }

    // Attach the created event object for the create-event action.
    if (toolName === "create-event" && params) {
      try {
        let eventId: string | null = null;
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
          const { google } = await import("googleapis");
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });
          const validArgs = CreateEventArgumentsSchema.safeParse(params);
          if (validArgs.success) {
            try {
              const eventResponse = await calendar.events.get({
                calendarId: validArgs.data.calendarId,
                eventId,
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
  } catch (error: any) {
    console.error("Error handling request:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
      content: [],
    });
  }
});

const PORT = process.env.PORT || 3000;

async function startServer(): Promise<void> {
  await initialize();
  app.listen(PORT, () => {
    console.log(`MCP HTTP Server running on http://localhost:${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/mcp/calendar`);
  });
}

startServer().catch(console.error);
