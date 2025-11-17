import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface UpdateLabelArgs {
  labelId: string;
  name?: string;
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  backgroundColor?: string;
  textColor?: string;
}

export class UpdateLabelHandler extends BaseToolHandler {
  async runTool(args: UpdateLabelArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Build the update object
      const requestBody: gmail_v1.Schema$Label = {};
      
      if (args.name) {
        requestBody.name = args.name;
      }
      
      if (args.messageListVisibility) {
        requestBody.messageListVisibility = args.messageListVisibility;
      }
      
      if (args.labelListVisibility) {
        requestBody.labelListVisibility = args.labelListVisibility;
      }
      
      // Add color if provided
      if (args.backgroundColor || args.textColor) {
        requestBody.color = {
          backgroundColor: args.backgroundColor,
          textColor: args.textColor
        };
      }
      
      // Update the label (using patch for partial updates)
      const response = await gmail.users.labels.patch({
        userId: 'me',
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
}