import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface SendDraftArgs {
  draftId: string;
}

export class SendDraftHandler extends BaseToolHandler {
  async runTool(args: SendDraftArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Send the draft
      const response = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: {
          id: args.draftId
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              messageId: response.data.id,
              threadId: response.data.threadId,
              labelIds: response.data.labelIds
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