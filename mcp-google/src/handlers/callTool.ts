import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from 'google-auth-library';
import { BaseToolHandler } from "./core/BaseToolHandler.js";
import { ListCalendarsHandler } from "./core/ListCalendarsHandler.js";
import { ListEventsHandler } from "./core/ListEventsHandler.js";
import { SearchEventsHandler } from "./core/SearchEventsHandler.js";
import { ListColorsHandler } from "./core/ListColorsHandler.js";
import { CreateEventHandler } from "./core/CreateEventHandler.js";
import { UpdateEventHandler } from "./core/UpdateEventHandler.js";
import { DeleteEventHandler } from "./core/DeleteEventHandler.js";
import { FreeBusyEventHandler } from "./core/FreeBusyEventHandler.js";
import { ListContactsHandler } from "./core/contacts/ListContactsHandler.js";
import { GetContactHandler } from "./core/contacts/GetContactHandler.js";
import { CreateContactHandler } from "./core/contacts/CreateContactHandler.js";
import { UpdateContactHandler } from "./core/contacts/UpdateContactHandler.js";
import { DeleteContactHandler } from "./core/contacts/DeleteContactHandler.js";
import { ListEmailsHandler } from "./core/gmail/ListEmailsHandler.js";
import { GetEmailHandler } from "./core/gmail/GetEmailHandler.js";
import { SendEmailHandler } from "./core/gmail/SendEmailHandler.js";
import { UpdateEmailHandler } from "./core/gmail/UpdateEmailHandler.js";
import { DeleteEmailHandler } from "./core/gmail/DeleteEmailHandler.js";
import { CreateDraftHandler } from "./core/gmail/CreateDraftHandler.js";
import { UpdateDraftHandler } from "./core/gmail/UpdateDraftHandler.js";
import { SendDraftHandler } from "./core/gmail/SendDraftHandler.js";
import { ListLabelsHandler } from "./core/gmail/ListLabelsHandler.js";
import { CreateLabelHandler } from "./core/gmail/CreateLabelHandler.js";
import { UpdateLabelHandler } from "./core/gmail/UpdateLabelHandler.js";
import { DeleteLabelHandler } from "./core/gmail/DeleteLabelHandler.js";
import { BatchUpdateEmailsHandler } from "./core/gmail/BatchUpdateEmailsHandler.js";

/**
 * Handles incoming tool calls, validates arguments, calls the appropriate service,
 * and formats the response.
 *
 * @param request The CallToolRequest containing tool name and arguments.
 * @param oauth2Client The authenticated OAuth2 client instance.
 * @returns A Promise resolving to the CallToolResponse.
 */
export async function handleCallTool(request: typeof CallToolRequestSchema._type, oauth2Client: OAuth2Client) {
    const { name, arguments: args } = request.params;

    try {
        const handler = getHandler(name);
        return await handler.runTool(args, oauth2Client);
    } catch (error: unknown) {
        console.error(`Error executing tool '${name}':`, error);
        // Re-throw the error to be handled by the main server logic or error handler
        throw error;
    }
}

const handlerMap: Record<string, BaseToolHandler> = {
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
    "batch-update-emails": new BatchUpdateEmailsHandler(),
};

function getHandler(toolName: string): BaseToolHandler {
    const handler = handlerMap[toolName];
    if (!handler) {
        throw new Error(`Unknown tool: ${toolName}`);
    }
    return handler;
}
