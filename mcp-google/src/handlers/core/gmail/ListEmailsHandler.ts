import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface ListEmailsArgs {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  includeSpamTrash?: boolean;
  labelIds?: string[];
}

export class ListEmailsHandler extends BaseToolHandler {
  async runTool(args: ListEmailsArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Build the request parameters
      const params: gmail_v1.Params$Resource$Users$Messages$List = {
        userId: 'me',
        maxResults: args.maxResults || 20,
        includeSpamTrash: args.includeSpamTrash || false,
      };
      
      // Add optional parameters
      if (args.query) {
        params.q = args.query;
      }
      
      if (args.pageToken) {
        params.pageToken = args.pageToken;
      }
      
      if (args.labelIds && args.labelIds.length > 0) {
        params.labelIds = args.labelIds;
      }
      
      // List messages
      const response = await gmail.users.messages.list(params);
      
      const messages = response.data.messages || [];
      
      // Fetch basic info for each message
      const messageDetails = await Promise.all(
        messages.slice(0, 10).map(async (message) => {
          try {
            const details = await gmail.users.messages.get({
              userId: 'me',
              id: message.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date']
            });
            
            return this.formatMessageMetadata(details.data);
          } catch (error) {
            console.error(`Error fetching message ${message.id}:`, error);
            return { id: message.id, error: 'Failed to fetch details' };
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

  private formatMessageMetadata(message: gmail_v1.Schema$Message): any {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';
    
    return {
      id: message.id,
      threadId: message.threadId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      snippet: message.snippet,
      labelIds: message.labelIds || [],
      isUnread: message.labelIds?.includes('UNREAD') || false,
      isImportant: message.labelIds?.includes('IMPORTANT') || false,
      isStarred: message.labelIds?.includes('STARRED') || false,
      hasAttachments: this.hasAttachments(message.payload)
    };
  }
  
  private hasAttachments(payload?: gmail_v1.Schema$MessagePart): boolean {
    if (!payload) return false;
    
    // Check if this part is an attachment
    if (payload.filename && payload.filename.length > 0) {
      return true;
    }
    
    // Recursively check parts
    if (payload.parts) {
      return payload.parts.some(part => this.hasAttachments(part));
    }
    
    return false;
  }
}