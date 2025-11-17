import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface DeleteContactArgs {
  resourceName: string;
}

export class DeleteContactHandler extends BaseToolHandler {
  async runTool(args: DeleteContactArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const people = google.people({ version: 'v1', auth: oauth2Client });
      
      await people.people.deleteContact({
        resourceName: args.resourceName
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Contact ${args.resourceName} deleted successfully`
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