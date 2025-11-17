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
      {
        name: "list-contacts",
        description: "List Google Contacts. Returns: array with resourceName, names, emailAddresses, phoneNumbers per contact. Use when: viewing contact list, searching by name. Note: use personFields to limit data.",
        inputSchema: {
          type: "object",
          properties: {
            pageSize: {
              type: "number",
              description: "Maximum number of contacts to return (default: 100, max: 2000)",
            },
            pageToken: {
              type: "string",
              description: "Token for pagination to get the next page of results",
            },
            query: {
              type: "string",
              description: "Optional search query to filter contacts",
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
          required: [],
        },
      },
      {
        name: "get-contact",
        description: "Retrieve one contact by resourceName. Returns: full contact with all requested fields. Use when: viewing detailed contact info. Note: resourceName format is 'people/c[ID]'.",
        inputSchema: {
          type: "object",
          properties: {
            resourceName: {
              type: "string",
              description: "Resource name of the contact (e.g., 'people/c1234567890')",
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
          required: ["resourceName"],
        },
      },
      {
        name: "create-contact",
        description: "Create new contact. Returns: created contact with resourceName, etag, metadata. Use when: adding new person to contacts. Note: returns new resourceName for future operations.",
        inputSchema: {
          type: "object",
          properties: {
            givenName: {
              type: "string",
              description: "First name of the contact",
            },
            familyName: {
              type: "string",
              description: "Last name of the contact",
            },
            middleName: {
              type: "string",
              description: "Middle name of the contact",
            },
            displayName: {
              type: "string",
              description: "Display name (defaults to 'givenName familyName' if not provided)",
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
                    description: "Email address",
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of email address (default: home)",
                  },
                },
                required: ["value"],
              },
            },
            phoneNumbers: {
              type: "array",
              description: "Phone numbers for the contact",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Phone number",
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "mobile", "homeFax", "workFax", "otherFax", "pager", "workMobile", "workPager", "main", "googleVoice", "other"],
                    description: "Type of phone number (default: home)",
                  },
                },
                required: ["value"],
              },
            },
            addresses: {
              type: "array",
              description: "Physical addresses for the contact",
              items: {
                type: "object",
                properties: {
                  streetAddress: {
                    type: "string",
                    description: "Street address",
                  },
                  city: {
                    type: "string",
                    description: "City",
                  },
                  region: {
                    type: "string",
                    description: "State or region",
                  },
                  postalCode: {
                    type: "string",
                    description: "Postal or ZIP code",
                  },
                  country: {
                    type: "string",
                    description: "Country",
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of address (default: home)",
                  },
                },
              },
            },
            organizations: {
              type: "array",
              description: "Organizations/companies for the contact",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Organization name",
                  },
                  title: {
                    type: "string",
                    description: "Job title",
                  },
                  department: {
                    type: "string",
                    description: "Department",
                  },
                  type: {
                    type: "string",
                    enum: ["work", "school", "other"],
                    description: "Type of organization (default: work)",
                  },
                },
              },
            },
            biographies: {
              type: "array",
              description: "Biographical information",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Biography text",
                  },
                  contentType: {
                    type: "string",
                    enum: ["TEXT_PLAIN", "TEXT_HTML"],
                    description: "Content type (default: TEXT_PLAIN)",
                  },
                },
                required: ["value"],
              },
            },
            notes: {
              type: "string",
              description: "Notes about the contact (will be added as a biography if biographies not provided)",
            },
          },
          required: [],
        },
      },
      {
        name: "update-contact",
        description: "Modify existing contact. Returns: updated contact with new etag. Use when: changing contact details. Note: requires updatePersonFields to specify what to update.",
        inputSchema: {
          type: "object",
          properties: {
            resourceName: {
              type: "string",
              description: "Resource name of the contact to update (e.g., 'people/c1234567890')",
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
              description: "First name (required if updating names)",
            },
            familyName: {
              type: "string",
              description: "Last name (required if updating names)",
            },
            middleName: {
              type: "string",
              description: "Middle name",
            },
            displayName: {
              type: "string",
              description: "Display name",
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
                    description: "Email address",
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of email address",
                  },
                },
                required: ["value"],
              },
            },
            phoneNumbers: {
              type: "array",
              description: "Phone numbers (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Phone number",
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "mobile", "homeFax", "workFax", "otherFax", "pager", "workMobile", "workPager", "main", "googleVoice", "other"],
                    description: "Type of phone number",
                  },
                },
                required: ["value"],
              },
            },
            addresses: {
              type: "array",
              description: "Physical addresses (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  streetAddress: {
                    type: "string",
                    description: "Street address",
                  },
                  city: {
                    type: "string",
                    description: "City",
                  },
                  region: {
                    type: "string",
                    description: "State or region",
                  },
                  postalCode: {
                    type: "string",
                    description: "Postal or ZIP code",
                  },
                  country: {
                    type: "string",
                    description: "Country",
                  },
                  type: {
                    type: "string",
                    enum: ["home", "work", "other"],
                    description: "Type of address",
                  },
                },
              },
            },
            organizations: {
              type: "array",
              description: "Organizations (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Organization name",
                  },
                  title: {
                    type: "string",
                    description: "Job title",
                  },
                  department: {
                    type: "string",
                    description: "Department",
                  },
                  type: {
                    type: "string",
                    enum: ["work", "school", "other"],
                    description: "Type of organization",
                  },
                },
              },
            },
            biographies: {
              type: "array",
              description: "Biographical information (replaces all existing if updating)",
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    description: "Biography text",
                  },
                  contentType: {
                    type: "string",
                    enum: ["TEXT_PLAIN", "TEXT_HTML"],
                    description: "Content type",
                  },
                },
                required: ["value"],
              },
            },
          },
          required: ["resourceName", "updatePersonFields"],
        },
      },
      {
        name: "delete-contact",
        description: "Remove contact permanently. Returns: empty on success. Use when: deleting person from contacts. Note: permanent deletion, use resourceName from list/get.",
        inputSchema: {
          type: "object",
          properties: {
            resourceName: {
              type: "string",
              description: "Resource name of the contact to delete (e.g., 'people/c1234567890')",
            },
          },
          required: ["resourceName"],
        },
      },
      {
        name: "list-emails",
        description: "Search emails in Gmail. Returns: array with id, threadId only (no content/labels). Use when: finding emails to get IDs for other operations. Note: retrieve full content with get-email per ID.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Gmail search operators: 'from:email@domain.com', 'to:email', 'subject:text', 'is:unread', 'is:read', 'is:starred', 'is:important', 'has:attachment', 'in:inbox', 'in:sent', 'after:2024/1/1', 'before:2024/12/31', 'larger:1M', 'smaller:5M'. Combine with spaces for AND, OR for alternatives.",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of emails to return (default: 20, max: 500)",
            },
            pageToken: {
              type: "string",
              description: "Token for pagination to get the next page of results",
            },
            includeSpamTrash: {
              type: "boolean",
              description: "Include emails from SPAM and TRASH (default: false)",
            },
            labelIds: {
              type: "array",
              description: "Filter by specific label IDs",
              items: {
                type: "string"
              }
            }
          },
          required: [],
        },
      },
      {
        name: "get-email",
        description: "Retrieve one email by messageId. Returns: full message with headers, body (plain/html), attachments metadata. Use when: reading email content after list-emails. Note: messageId from list-emails required.",
        inputSchema: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "The ID of the email message to retrieve",
            },
            markAsRead: {
              type: "boolean",
              description: "Mark the email as read when retrieving (default: true)",
            },
            format: {
              type: "string",
              enum: ["full", "metadata", "minimal"],
              description: "The format to return the message in (default: full)",
            }
          },
          required: ["messageId"],
        },
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
              description: "Recipient email address(es)",
            },
            subject: {
              type: "string",
              description: "Email subject line",
            },
            body: {
              type: "string",
              description: "Email body content",
            },
            cc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "CC recipient email address(es)",
            },
            bcc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "BCC recipient email address(es)",
            },
            isHtml: {
              type: "boolean",
              description: "Whether the body is HTML content (default: false)",
            },
            replyToMessageId: {
              type: "string",
              description: "Message ID to reply to (for threading)",
            },
            threadId: {
              type: "string",
              description: "Thread ID to reply within",
            }
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "update-email",
        description: "Modify single email labels/status. Returns: updated message with new labelIds. Use when: marking one email read/unread/starred. For multiple: use batch-update-emails. Labels: UNREAD, STARRED, IMPORTANT, INBOX.",
        inputSchema: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "Message ID from list-emails or get-email response (not email address)",
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
              description: "Remove UNREAD label (shortcut for removeLabelIds: ['UNREAD'])",
            },
            markAsUnread: {
              type: "boolean",
              description: "Add UNREAD label (shortcut for addLabelIds: ['UNREAD'])",
            },
            star: {
              type: "boolean",
              description: "Star the email",
            },
            unstar: {
              type: "boolean",
              description: "Unstar the email",
            },
            markAsImportant: {
              type: "boolean",
              description: "Mark as important",
            },
            markAsNotImportant: {
              type: "boolean",
              description: "Mark as not important",
            },
            archive: {
              type: "boolean",
              description: "Archive the email (remove from inbox)",
            },
            unarchive: {
              type: "boolean",
              description: "Unarchive the email (add to inbox)",
            },
            moveToTrash: {
              type: "boolean",
              description: "Move to trash",
            },
            removeFromTrash: {
              type: "boolean",
              description: "Remove from trash",
            }
          },
          required: ["messageId"],
        },
      },
      {
        name: "delete-email",
        description: "Move email to trash or delete permanently. Returns: success status. Use when: removing emails. Default: trash (recoverable). Set permanent=true for unrecoverable deletion.",
        inputSchema: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "Message ID from list-emails or get-email response",
            },
            permanent: {
              type: "boolean",
              description: "Permanently delete instead of moving to trash (default: false)",
            }
          },
          required: ["messageId"],
        },
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
              description: "Recipient email address(es)",
            },
            subject: {
              type: "string",
              description: "Email subject line",
            },
            body: {
              type: "string",
              description: "Email body content",
            },
            cc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "CC recipient email address(es)",
            },
            bcc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "BCC recipient email address(es)",
            },
            isHtml: {
              type: "boolean",
              description: "Whether the body is HTML content (default: false)",
            },
            replyToMessageId: {
              type: "string",
              description: "Message ID to reply to (for threading)",
            },
            threadId: {
              type: "string",
              description: "Thread ID to reply within",
            }
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "update-draft",
        description: "Modify existing draft. Returns: updated draft with id, message. Use when: editing unsent draft content. Note: replaces entire draft content.",
        inputSchema: {
          type: "object",
          properties: {
            draftId: {
              type: "string",
              description: "The ID of the draft to update",
            },
            to: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "Recipient email address(es)",
            },
            subject: {
              type: "string",
              description: "Email subject line",
            },
            body: {
              type: "string",
              description: "Email body content",
            },
            cc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "CC recipient email address(es)",
            },
            bcc: {
              oneOf: [
                { type: "string", format: "email" },
                { type: "array", items: { type: "string", format: "email" } }
              ],
              description: "BCC recipient email address(es)",
            },
            isHtml: {
              type: "boolean",
              description: "Whether the body is HTML content (default: false)",
            },
            replyToMessageId: {
              type: "string",
              description: "Message ID to reply to (for threading)",
            },
            threadId: {
              type: "string",
              description: "Thread ID to reply within",
            }
          },
          required: ["draftId", "to", "subject", "body"],
        },
      },
      {
        name: "send-draft",
        description: "Send saved draft. Returns: sent message with id, threadId, labelIds. Use when: sending previously created draft. Note: draft is deleted after sending.",
        inputSchema: {
          type: "object",
          properties: {
            draftId: {
              type: "string",
              description: "The ID of the draft to send",
            }
          },
          required: ["draftId"],
        },
      },
      {
        name: "list-labels",
        description: "List Gmail labels. Returns: array with id, name, type (system/user). Use when: showing folder structure, finding label IDs. Note: includes system labels like INBOX, SENT.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "create-label",
        description: "Create custom label. Returns: new label with id, name, type='user'. Use when: organizing emails with new categories. Note: can't create system labels.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the label",
            },
            messageListVisibility: {
              type: "string",
              enum: ["show", "hide"],
              description: "Whether to show messages with this label in message lists (default: show)",
            },
            labelListVisibility: {
              type: "string",
              enum: ["labelShow", "labelShowIfUnread", "labelHide"],
              description: "Whether to show this label in the label list (default: labelShow)",
            },
            backgroundColor: {
              type: "string",
              description: "Background color for the label (hex color like '#0000FF')",
            },
            textColor: {
              type: "string",
              description: "Text color for the label (hex color like '#FFFFFF')",
            }
          },
          required: ["name"],
        },
      },
      {
        name: "update-label",
        description: "Modify label properties. Returns: updated label. Use when: renaming labels, changing visibility. Note: can't modify system labels.",
        inputSchema: {
          type: "object",
          properties: {
            labelId: {
              type: "string",
              description: "The ID of the label to update",
            },
            name: {
              type: "string",
              description: "New name for the label",
            },
            messageListVisibility: {
              type: "string",
              enum: ["show", "hide"],
              description: "Whether to show messages with this label in message lists",
            },
            labelListVisibility: {
              type: "string",
              enum: ["labelShow", "labelShowIfUnread", "labelHide"],
              description: "Whether to show this label in the label list",
            },
            backgroundColor: {
              type: "string",
              description: "Background color for the label (hex color)",
            },
            textColor: {
              type: "string",
              description: "Text color for the label (hex color)",
            }
          },
          required: ["labelId"],
        },
      },
      {
        name: "delete-label",
        description: "Remove custom label. Returns: empty on success. Use when: cleaning up unused labels. Note: can't delete system labels, emails keep label reference.",
        inputSchema: {
          type: "object",
          properties: {
            labelId: {
              type: "string",
              description: "The ID of the label to delete",
            }
          },
          required: ["labelId"],
        },
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
              maxItems: 1000
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
              description: "Mark all emails as read",
            },
            markAsUnread: {
              type: "boolean",
              description: "Mark all emails as unread",
            },
            star: {
              type: "boolean",
              description: "Star all emails",
            },
            unstar: {
              type: "boolean",
              description: "Unstar all emails",
            },
            markAsImportant: {
              type: "boolean",
              description: "Mark all as important",
            },
            markAsNotImportant: {
              type: "boolean",
              description: "Mark all as not important",
            },
            archive: {
              type: "boolean",
              description: "Archive all emails",
            },
            unarchive: {
              type: "boolean",
              description: "Unarchive all emails",
            },
            moveToTrash: {
              type: "boolean",
              description: "Move all to trash",
            }
          },
          required: ["messageIds"],
        },
      }
    ],
  };
}