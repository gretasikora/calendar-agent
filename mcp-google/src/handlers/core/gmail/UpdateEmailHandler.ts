import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";
import { LabelMutationBuilder, LabelMutationFlags } from "./utils/labelMutationBuilder.js";

interface UpdateEmailArgs extends LabelMutationFlags {
  messageId: string;
  moveToTrash?: boolean;
  removeFromTrash?: boolean;
}

export class UpdateEmailHandler extends BaseToolHandler {
  async runTool(args: UpdateEmailArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Handle trash operations separately
      if (args.moveToTrash) {
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
                action: 'moved_to_trash'
              }, null, 2)
            }
          ]
        };
      }
      
      if (args.removeFromTrash) {
        await gmail.users.messages.untrash({
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
                action: 'removed_from_trash'
              }, null, 2)
            }
          ]
        };
      }
      
      // Build label mutations with validation
      const mutation = LabelMutationBuilder.build(args);
      
      // Check if there are any changes to make
      if (mutation.addLabelIds.length === 0 && mutation.removeLabelIds.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: args.messageId,
                message: 'No changes were made'
              }, null, 2)
            }
          ]
        };
      }
      
      // Check if message can be modified (TRASH/SPAM restrictions)
      const preCheck = await gmail.users.messages.get({
        userId: 'me',
        id: args.messageId,
        format: 'minimal'
      });
      
      const currentLabels = preCheck.data.labelIds || [];
      
      if (!LabelMutationBuilder.canModifyLabels(currentLabels, mutation)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                messageId: args.messageId,
                error: 'Cannot modify labels on messages in TRASH or SPAM folders',
                currentLabels: currentLabels
              }, null, 2)
            }
          ]
        };
      }
      
      console.log('UpdateEmail - Calling modify with:', {
        messageId: args.messageId,
        addLabelIds: mutation.addLabelIds,
        removeLabelIds: mutation.removeLabelIds
      });
      
      const response = await gmail.users.messages.modify({
        userId: 'me',
        id: args.messageId,
        requestBody: {
          addLabelIds: mutation.addLabelIds,
          removeLabelIds: mutation.removeLabelIds
        }
      });
      
      console.log('UpdateEmail - API response:', response.status, response.statusText);
      
      // Verify the change took effect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const postCheck = await gmail.users.messages.get({
        userId: 'me',
        id: args.messageId,
        format: 'minimal'
      });
      
      const finalLabels = postCheck.data.labelIds || [];
      
      // Verify changes were applied
      const expectedAdded = mutation.addLabelIds.every(label => 
        finalLabels.includes(label)
      );
      const expectedRemoved = mutation.removeLabelIds.every(label => 
        !finalLabels.includes(label)
      );
      
      const verified = expectedAdded && expectedRemoved;
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: verified,
              messageId: response.data.id,
              threadId: response.data.threadId,
              labelIds: finalLabels,
              addedLabels: mutation.addLabelIds,
              removedLabels: mutation.removeLabelIds,
              verified: verified,
              warning: verified ? undefined : 'Changes may not have been fully applied'
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      console.error('UpdateEmail - Error details:', {
        message: error.message,
        code: error.code,
        errors: error.errors,
        response: error.response?.data
      });
      this.handleGoogleApiError(error);
      throw error;
    }
  }
}