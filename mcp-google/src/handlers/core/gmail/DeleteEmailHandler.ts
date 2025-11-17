import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface DeleteEmailArgs {
  messageId: string;
  permanent?: boolean;
}

export class DeleteEmailHandler extends BaseToolHandler {
  async runTool(args: DeleteEmailArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      if (args.permanent) {
        // Permanently delete the message
        await gmail.users.messages.delete({
          userId: 'me',
          id: args.messageId
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                action: 'permanently_deleted',
                warning: 'This action cannot be undone'
              }, null, 2)
            }
          ]
        };
      } else {
        // Move to trash (default behavior)
        await gmail.users.messages.trash({
          userId: 'me',
          id: args.messageId
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                action: 'moved_to_trash',
                note: 'Email moved to trash. Use permanent=true to permanently delete.'
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
}