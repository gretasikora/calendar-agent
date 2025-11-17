import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";
import { LabelMutationBuilder, LabelMutationFlags } from "./utils/labelMutationBuilder.js";
import { GmailRateLimiter } from "./utils/rateLimiter.js";

interface BatchUpdateEmailsArgs extends LabelMutationFlags {
  messageIds: string[];
  moveToTrash?: boolean;
}

interface MessageVerification {
  id: string;
  success: boolean;
  preLabels?: string[];
  postLabels?: string[];
  error?: string;
  skippedReason?: string;
}

export class BatchUpdateEmailsHandler extends BaseToolHandler {
  private static readonly CHUNK_SIZE = 50; // Gmail recommends max 50 for batch operations
  private static readonly PARALLEL_VERIFY_LIMIT = 20; // Concurrent verification requests
  
  async runTool(args: BatchUpdateEmailsArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      // Early validation: empty array
      if (!args.messageIds || args.messageIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              message: 'No message IDs provided',
              messageCount: 0
            }, null, 2)
          }]
        };
      }

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Handle trash operation separately (uses batchDelete)
      if (args.moveToTrash) {
        return this.handleBatchTrash(gmail, args.messageIds);
      }
      
      // Build label mutations with validation
      const mutation = LabelMutationBuilder.build(args);
      
      // Check if there are any changes to make
      if (mutation.addLabelIds.length === 0 && mutation.removeLabelIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              message: 'No label changes requested',
              messageCount: args.messageIds.length
            }, null, 2)
          }]
        };
      }

      console.log('BatchUpdateEmails - Starting operation:', {
        totalMessages: args.messageIds.length,
        addLabelIds: mutation.addLabelIds,
        removeLabelIds: mutation.removeLabelIds
      });
      
      // Process messages with verification and retry
      const results = await this.processMessagesWithVerification(
        gmail,
        args.messageIds,
        mutation
      );
      
      // Calculate final statistics
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      console.log('BatchUpdateEmails - Final summary:', {
        total: args.messageIds.length,
        successful: successful.length,
        failed: failed.length
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: failed.length === 0,
            action: 'batch_modified',
            summary: {
              total: args.messageIds.length,
              successful: successful.length,
              failed: failed.length
            },
            details: {
              successfulIds: successful.map(r => r.id),
              failedOperations: failed.map(r => ({
                id: r.id,
                reason: r.error || r.skippedReason || 'Unknown error'
              })),
              addedLabels: mutation.addLabelIds,
              removedLabels: mutation.removeLabelIds
            }
          }, null, 2)
        }]
      };
    } catch (error: any) {
      console.error('BatchUpdateEmails - Fatal error:', {
        message: error.message,
        code: error.code,
        errors: error.errors,
        response: error.response?.data
      });
      this.handleGoogleApiError(error);
      throw error;
    }
  }

  private async handleBatchTrash(
    gmail: gmail_v1.Gmail,
    messageIds: string[]
  ): Promise<CallToolResult> {
    try {
      // Process in chunks for batchDelete
      const chunks = this.chunkArray(messageIds, 1000); // batchDelete supports up to 1000
      
      for (const chunk of chunks) {
        await gmail.users.messages.batchDelete({
          userId: 'me',
          requestBody: {
            ids: chunk
          }
        });
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            action: 'batch_moved_to_trash',
            messageCount: messageIds.length,
            messageIds: messageIds
          }, null, 2)
        }]
      };
    } catch (error: any) {
      // batchDelete might partially succeed
      console.error('BatchUpdateEmails - Trash operation failed:', error);
      throw error;
    }
  }

  private async processMessagesWithVerification(
    gmail: gmail_v1.Gmail,
    messageIds: string[],
    mutation: { addLabelIds: string[]; removeLabelIds: string[] }
  ): Promise<MessageVerification[]> {
    const rateLimiter = new GmailRateLimiter();
    const chunks = this.chunkArray(messageIds, BatchUpdateEmailsHandler.CHUNK_SIZE);
    const allResults: MessageVerification[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkIndex = i + 1;
      const totalChunks = chunks.length;
      
      console.log(`BatchUpdateEmails - Processing chunk ${chunkIndex}/${totalChunks} (${chunk.length} messages)`);
      
      // Add delay based on rate limiting
      if (i > 0) {
        await rateLimiter.wait();
      }
      
      try {
        // Execute batch modify
        const response = await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: chunk,
            addLabelIds: mutation.addLabelIds,
            removeLabelIds: mutation.removeLabelIds
          }
        });
        
        // Extract and use rate limit info
        const rateLimitInfo = GmailRateLimiter.extractRateLimitInfo(response.headers);
        console.log('BatchUpdateEmails - Rate limit info:', rateLimitInfo);
        rateLimiter.calculateDelay(rateLimitInfo);
        
        // Verify the batch operation results
        const chunkResults = await this.verifyBatchResults(gmail, chunk, mutation);
        allResults.push(...chunkResults);
        
        // Retry failures individually
        const failures = chunkResults.filter(r => !r.success);
        if (failures.length > 0) {
          console.log(`BatchUpdateEmails - Retrying ${failures.length} failed messages individually`);
          
          for (const failed of failures) {
            const retryResult = await this.retryIndividualMessage(
              gmail,
              failed.id,
              mutation,
              rateLimiter
            );
            
            // Update the result
            const index = allResults.findIndex(r => r.id === failed.id);
            if (index !== -1) {
              allResults[index] = retryResult;
            }
          }
        }
        
      } catch (error: any) {
        console.error(`BatchUpdateEmails - Chunk ${chunkIndex} failed:`, error);
        
        // Handle rate limiting
        if (error.code === 429) {
          const retryAfter = error.response?.headers?.['retry-after'];
          const delay = rateLimiter.handle429(retryAfter);
          console.log(`BatchUpdateEmails - Rate limited, waiting ${delay}ms`);
          await rateLimiter.wait();
          
          // Retry the chunk
          i--; // Retry this chunk
          continue;
        }
        
        // Mark all messages in chunk as failed
        chunk.forEach(id => {
          allResults.push({
            id,
            success: false,
            error: error.message || 'Batch operation failed'
          });
        });
      }
    }
    
    return allResults;
  }

  private async verifyBatchResults(
    gmail: gmail_v1.Gmail,
    messageIds: string[],
    mutation: { addLabelIds: string[]; removeLabelIds: string[] }
  ): Promise<MessageVerification[]> {
    // Verify in parallel with concurrency limit
    const verifyPromises = messageIds.map(id => 
      this.createThrottledVerification(gmail, id, mutation)
    );
    
    // Process with limited concurrency
    const results: MessageVerification[] = [];
    const limit = BatchUpdateEmailsHandler.PARALLEL_VERIFY_LIMIT;
    
    for (let i = 0; i < verifyPromises.length; i += limit) {
      const batch = verifyPromises.slice(i, i + limit);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    
    return results;
  }

  private async createThrottledVerification(
    gmail: gmail_v1.Gmail,
    messageId: string,
    mutation: { addLabelIds: string[]; removeLabelIds: string[] }
  ): Promise<MessageVerification> {
    try {
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'minimal'
      });
      
      const currentLabels = message.data.labelIds || [];
      
      // Check if changes were applied
      const expectedAdded = mutation.addLabelIds.every(label => 
        currentLabels.includes(label)
      );
      const expectedRemoved = mutation.removeLabelIds.every(label => 
        !currentLabels.includes(label)
      );
      
      const success = expectedAdded && expectedRemoved;
      
      return {
        id: messageId,
        success,
        postLabels: currentLabels,
        error: success ? undefined : 'Labels not updated as expected'
      };
    } catch (error: any) {
      return {
        id: messageId,
        success: false,
        error: `Verification failed: ${error.message}`
      };
    }
  }

  private async retryIndividualMessage(
    gmail: gmail_v1.Gmail,
    messageId: string,
    mutation: { addLabelIds: string[]; removeLabelIds: string[] },
    rateLimiter: GmailRateLimiter
  ): Promise<MessageVerification> {
    try {
      // First check if the message can be modified
      const preCheck = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'minimal'
      });
      
      const currentLabels = preCheck.data.labelIds || [];
      
      // Check if labels can be modified (TRASH/SPAM restrictions)
      if (!LabelMutationBuilder.canModifyLabels(currentLabels, mutation)) {
        return {
          id: messageId,
          success: false,
          preLabels: currentLabels,
          skippedReason: 'Message in TRASH/SPAM - label modifications not allowed'
        };
      }
      
      // Attempt the modification
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: mutation.addLabelIds,
          removeLabelIds: mutation.removeLabelIds
        }
      });
      
      // Wait a bit for consistency
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the change actually took effect
      const postCheck = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
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
      
      const success = expectedAdded && expectedRemoved;
      
      return {
        id: messageId,
        success,
        preLabels: currentLabels,
        postLabels: finalLabels,
        error: success ? undefined : 'Retry succeeded but verification failed'
      };
      
    } catch (error: any) {
      // Check for rate limiting
      if (error.code === 429) {
        const retryAfter = error.response?.headers?.['retry-after'];
        rateLimiter.handle429(retryAfter);
      }
      
      return {
        id: messageId,
        success: false,
        error: `Individual retry failed: ${error.message}`
      };
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}