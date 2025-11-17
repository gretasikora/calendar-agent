import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

export class ListLabelsHandler extends BaseToolHandler {
  async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // List all labels
      const response = await gmail.users.labels.list({
        userId: 'me'
      });
      
      const labels = response.data.labels || [];
      
      // Separate system and user labels
      const systemLabels = labels.filter(label => label.type === 'system');
      const userLabels = labels.filter(label => label.type === 'user');
      
      // Format labels for better readability
      const formattedLabels = {
        systemLabels: systemLabels.map(this.formatLabel),
        userLabels: userLabels.map(this.formatLabel),
        totalCount: labels.length,
        systemCount: systemLabels.length,
        userCount: userLabels.length
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedLabels, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }

  private formatLabel(label: any): any {
    return {
      id: label.id,
      name: label.name,
      type: label.type,
      messageListVisibility: label.messageListVisibility,
      labelListVisibility: label.labelListVisibility,
      color: label.color ? {
        textColor: label.color.textColor,
        backgroundColor: label.color.backgroundColor
      } : undefined,
      messagesTotal: label.messagesTotal,
      messagesUnread: label.messagesUnread,
      threadsTotal: label.threadsTotal,
      threadsUnread: label.threadsUnread
    };
  }
}