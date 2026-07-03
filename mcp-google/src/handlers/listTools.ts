import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Extracted reminder properties definition for reusability
const remindersInputProperty = {
    type: "object",
    description: "Reminder settings for the event",
    properties: {
      useDefault: {
        type: "boolean",
        description: "Whether to use the default reminders",
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
              description: "Minutes before the event to trigger the reminder",
            }
          },
          required: ["minutes"]
        }
      }
    },
    required: ["useDefault"]
};

export function getToolDefinitions() {
  return {
    tools: [
      {
        name: "list-calendars",
        description: "List user calendars. Returns: array of calendar objects with id, summary, accessRole, backgroundColor, primary. Use when: showing available calendars or finding calendar ID. Note: 'primary' for main calendar.",
        inputSchema: {
          type: "object",
          properties: {}, // No arguments needed
          required: [],
        },
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
              description: "ID of the calendar(s) to list events from (use 'primary' for the main calendar)",
            },
            timeMin: {
              type: "string",
              format: "date-time",
              description: "Start time in ISO format with timezone required (e.g., 2024-01-01T00:00:00Z or 2024-01-01T00:00:00+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeMax: {
              type: "string",
              format: "date-time",
              description: "End time in ISO format with timezone required (e.g., 2024-12-31T23:59:59Z or 2024-12-31T23:59:59+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
          },
          required: ["calendarId"],
        },
      },
      {
        name: "search-events",
        description: "Search events by text. Returns: filtered array of events matching query in summary/description/location. Use when: finding specific events by keyword. Note: single calendar only.",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar to search events in (use 'primary' for the main calendar)",
            },
            query: {
              type: "string",
              description: "Free text search query (searches summary, description, location, attendees, etc.)",
            },
            timeMin: {
              type: "string",
              format: "date-time",
              description: "Start time boundary in ISO format with timezone required (e.g., 2024-01-01T00:00:00Z or 2024-01-01T00:00:00+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeMax: {
              type: "string",
              format: "date-time",
              description: "End time boundary in ISO format with timezone required (e.g., 2024-12-31T23:59:59Z or 2024-12-31T23:59:59+00:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
          },
          required: ["calendarId", "query"],
        },
      },
      {
        name: "list-colors",
        description: "Get color palette. Returns: event colors (1-11) and calendar colors with hex values. Use when: displaying color options for event/calendar styling. Note: colorId is string.",
        inputSchema: {
          type: "object",
          properties: {}, // No arguments needed
          required: [],
        },
      },
      {
        name: "create-event",
        description: "Create calendar event. Returns: created event with id, htmlLink, start, end, status. Use when: scheduling new appointments/meetings. Note: supports recurring events via recurrence.",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar to create the event in (use 'primary' for the main calendar)",
            },
            summary: {
              type: "string",
              description: "Title of the event",
            },
            description: {
              type: "string",
              description: "Description/notes for the event (optional)",
            },
            start: {
              type: "string",
              format: "date-time",
              description: "Start time in ISO format with timezone required (e.g., 2024-08-15T10:00:00Z or 2024-08-15T10:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            end: {
              type: "string",
              format: "date-time",
              description: "End time in ISO format with timezone required (e.g., 2024-08-15T11:00:00Z or 2024-08-15T11:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeZone: {
              type: "string",
              description:
                "Timezone of the event start/end times, formatted as an IANA Time Zone Database name (e.g., America/Los_Angeles). Required if start/end times are specified, especially for recurring events.",
            },
            location: {
              type: "string",
              description: "Location of the event (optional)",
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
                    description: "Email address of the attendee",
                  },
                },
                required: ["email"],
              },
            },
            colorId: {
              type: "string",
              description: "Color ID for the event (optional, use list-colors to see available IDs)",
            },
            reminders: remindersInputProperty,
            recurrence: {
              type: "array",
              description:
                "List of recurrence rules (RRULE, EXRULE, RDATE, EXDATE) in RFC5545 format (optional). Example: [\"RRULE:FREQ=WEEKLY;COUNT=5\"]",
              items: {
                type: "string"
              }
            },
          },
          required: ["calendarId", "summary", "start", "end", "timeZone"],
        },
      },
      {
        name: "update-event",
        description: "Modify existing event. Returns: updated event with id, summary, start, end. Use when: rescheduling, changing details. Note: supports recurring event scopes (single/all/future).",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar containing the event",
            },
            eventId: {
              type: "string",
              description: "ID of the event to update",
            },
            summary: {
              type: "string",
              description: "New title for the event (optional)",
            },
            description: {
              type: "string",
              description: "New description for the event (optional)",
            },
            start: {
              type: "string",
              format: "date-time",
              description: "New start time in ISO format with timezone required (e.g., 2024-08-15T10:00:00Z or 2024-08-15T10:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            end: {
              type: "string",
              format: "date-time",
              description: "New end time in ISO format with timezone required (e.g., 2024-08-15T11:00:00Z or 2024-08-15T11:00:00-07:00). Date-time must end with Z (UTC) or +/-HH:MM offset.",
            },
            timeZone: {
              type: "string",
              description:
                "Timezone for the start/end times (IANA format, e.g., America/Los_Angeles). Required if modifying start/end, or for recurring events.",
            },
            location: {
              type: "string",
              description: "New location for the event (optional)",
            },
            colorId: {
              type: "string",
              description: "New color ID for the event (optional)",
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
                    description: "Email address of the attendee",
                  },
                },
                required: ["email"],
              },
            },
            reminders: {
                ...remindersInputProperty,
                description: "New reminder settings for the event (optional)",
            },
            recurrence: {
              type: "array",
              description:
                "New list of recurrence rules (RFC5545 format, optional, replaces existing rules). Example: [\"RRULE:FREQ=DAILY;COUNT=10\"]",
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
          required: ["calendarId", "eventId", "timeZone"], // timeZone is technically required for PATCH
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
        },
      },
      {
        name: "delete-event",
        description: "Remove event from calendar. Returns: empty on success. Use when: canceling appointments. Note: permanent deletion, not recoverable.",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar containing the event",
            },
            eventId: {
              type: "string",
              description: "ID of the event to delete",
            },
          },
          required: ["calendarId", "eventId"],
        },
      },
      {
        name: "get-freebusy",
        description: "Check calendar availability. Returns: busy time blocks per calendar. Use when: finding available slots, scheduling across calendars. Note: only shows busy/free, not event details.",
        inputSchema: {
          type: "object",
          properties: {
            timeMin: {
              type: "string",
              description: "The start of the interval in RFC3339 format",
            },
            timeMax: {
              type: "string",
              description: "The end of the interval in RFC3339 format",
            },
            timeZone: {
              type: "string",
              description: "Optional. Time zone used in the response (default is UTC)",
            },
            groupExpansionMax: {
              type: "integer",
              description: "Optional. Maximum number of calendar identifiers to expand per group (max 100)",
            },
            calendarExpansionMax: {
              type: "integer",
              description: "Optional. Maximum number of calendars to expand (max 50)",
            },
            items: {
              type: "array",
              description: "List of calendar or group identifiers to check for availability",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "The identifier of a calendar or group, it usually is a mail format",
                  },
                },
                required: ["id"],
              },
            },
          },
          required: ["timeMin", "timeMax", "items"],
        },
      },
    ],
  };
}