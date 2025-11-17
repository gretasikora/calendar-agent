import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface CreateLabelArgs {
  name: string;
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  backgroundColor?: string;
  textColor?: string;
}

export class CreateLabelHandler extends BaseToolHandler {
  async runTool(args: CreateLabelArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Build the label object
      const requestBody: gmail_v1.Schema$Label = {
        name: args.name,
        messageListVisibility: args.messageListVisibility || 'show',
        labelListVisibility: args.labelListVisibility || 'labelShow'
      };
      
      // Add color if provided
      if (args.backgroundColor || args.textColor) {
        requestBody.color = {
          backgroundColor: args.backgroundColor,
          textColor: args.textColor
        };
      }
      
      // Create the label
      const response = await gmail.users.labels.create({
        userId: 'me',
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
}