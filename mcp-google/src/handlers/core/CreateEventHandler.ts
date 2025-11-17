import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { CreateEventArgumentsSchema } from "../../schemas/validators.js";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3, google } from 'googleapis';
import { z } from 'zod';

export class CreateEventHandler extends BaseToolHandler {
    async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
        const validArgs = CreateEventArgumentsSchema.parse(args);
        const event = await this.createEvent(oauth2Client, validArgs);
        return {
            content: [{
                type: "text",
                text: `Event created: ${event.summary} (${event.id})`,
            }],
        };
    }

    private async createEvent(
        client: OAuth2Client,
        args: z.infer<typeof CreateEventArgumentsSchema>
    ): Promise<calendar_v3.Schema$Event> {
        try {
            const calendar = this.getCalendar(client);
            const requestBody: calendar_v3.Schema$Event = {
                summary: args.summary,
                description: args.description,
                start: { dateTime: args.start, timeZone: args.timeZone },
                end: { dateTime: args.end, timeZone: args.timeZone },
                attendees: args.attendees,
                location: args.location,
                colorId: args.colorId,
                reminders: args.reminders,
                recurrence: args.recurrence,
            };
            
            // Try to create the event with built-in retry logic
            const response = await calendar.events.insert({
                calendarId: args.calendarId,
                requestBody: requestBody,
            });
            
            if (!response.data) throw new Error('Failed to create event, no data returned');
            return response.data;
        } catch (error: any) {
            // If it's a socket error but we get a response, check if event was created
            if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                try {
                    // Wait a bit and then check if the event was created
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const calendar = this.getCalendar(client);
                    const now = new Date();
                    const events = await calendar.events.list({
                        calendarId: args.calendarId,
                        timeMin: new Date(now.getTime() - 60000).toISOString(), // Last minute
                        singleEvents: true,
                        orderBy: 'startTime',
                        maxResults: 10,
                    });
                    
                    // Look for the event we just tried to create
                    const createdEvent = events.data.items?.find(
                        event => event.summary === args.summary && 
                                event.start?.dateTime === args.start &&
                                event.end?.dateTime === args.end
                    );
                    
                    if (createdEvent) {
                        // Event was created despite the error
                        return createdEvent;
                    }
                } catch (checkError) {
                    // If check fails, throw the original error
                }
            }
            
            throw this.handleGoogleApiError(error);
        }
    }
}