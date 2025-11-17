import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface DeleteLabelArgs {
  labelId: string;
}

export class DeleteLabelHandler extends BaseToolHandler {
  async runTool(args: DeleteLabelArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Delete the label
      await gmail.users.labels.delete({
        userId: 'me',
        id: args.labelId
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Label ${args.labelId} deleted successfully`,
              warning: 'This action removed the label from all messages and threads'
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