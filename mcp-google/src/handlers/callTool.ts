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

/**
 * Handles incoming tool calls, validates arguments, calls the appropriate service,
 * and formats the response.
 *
 * @param request The CallToolRequest containing tool name and arguments.
 * @param oauth2Client The authenticated OAuth2 client instance.
 * @returns A Promise resolving to the CallToolResponse.
 */
interface CallToolRequest {
    params: {
        name: string;
        arguments?: Record<string, unknown>;
    };
}

export async function handleCallTool(request: CallToolRequest, oauth2Client: OAuth2Client) {
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
};

function getHandler(toolName: string): BaseToolHandler {
    const handler = handlerMap[toolName];
    if (!handler) {
        throw new Error(`Unknown tool: ${toolName}`);
    }
    return handler;
}
