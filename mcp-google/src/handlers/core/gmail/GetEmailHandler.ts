import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface GetEmailArgs {
  messageId: string;
  markAsRead?: boolean;
  format?: 'full' | 'metadata' | 'minimal';
}

export class GetEmailHandler extends BaseToolHandler {
  async runTool(args: GetEmailArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Get the message
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: args.messageId,
        format: args.format || 'full'
      });
      
      const message = response.data;
      
      // Mark as read if requested (default true unless explicitly false)
      if (args.markAsRead !== false && message.labelIds?.includes('UNREAD')) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: args.messageId,
          requestBody: {
            removeLabelIds: ['UNREAD']
          }
        });
      }
      
      // Format the message based on format type
      const formattedMessage = args.format === 'metadata' 
        ? this.formatMessageMetadata(message)
        : this.formatFullMessage(message);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedMessage, null, 2)
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
      cc: getHeader('Cc'),
      bcc: getHeader('Bcc'),
      date: getHeader('Date'),
      snippet: message.snippet,
      labelIds: message.labelIds || [],
      sizeEstimate: message.sizeEstimate,
      historyId: message.historyId
    };
  }

  private formatFullMessage(message: gmail_v1.Schema$Message): any {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';
    
    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds || [],
      snippet: message.snippet,
      historyId: message.historyId,
      internalDate: message.internalDate,
      sizeEstimate: message.sizeEstimate,
      headers: {
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        cc: getHeader('Cc'),
        bcc: getHeader('Bcc'),
        date: getHeader('Date'),
        messageId: getHeader('Message-ID'),
        inReplyTo: getHeader('In-Reply-To'),
        references: getHeader('References')
      },
      body: this.extractBody(message.payload),
      attachments: this.extractAttachments(message.payload),
      isUnread: message.labelIds?.includes('UNREAD') || false,
      isImportant: message.labelIds?.includes('IMPORTANT') || false,
      isStarred: message.labelIds?.includes('STARRED') || false,
      isDraft: message.labelIds?.includes('DRAFT') || false
    };
  }

  private extractBody(payload?: gmail_v1.Schema$MessagePart): { text?: string; html?: string } {
    if (!payload) return {};
    
    const result: { text?: string; html?: string } = {};
    
    // Direct body
    if (payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      if (payload.mimeType === 'text/plain') {
        result.text = decoded;
      } else if (payload.mimeType === 'text/html') {
        result.html = decoded;
      }
    }
    
    // Process parts
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          result.text = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          result.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType?.startsWith('multipart/')) {
          // Recursively process multipart
          const nestedBody = this.extractBody(part);
          if (nestedBody.text) result.text = nestedBody.text;
          if (nestedBody.html) result.html = nestedBody.html;
        }
      }
    }
    
    return result;
  }

  private extractAttachments(payload?: gmail_v1.Schema$MessagePart): any[] {
    if (!payload) return [];
    
    const attachments: any[] = [];
    
    const processPartForAttachments = (part: gmail_v1.Schema$MessagePart) => {
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body?.size || 0,
          attachmentId: part.body?.attachmentId
        });
      }
      
      if (part.parts) {
        part.parts.forEach(processPartForAttachments);
      }
    };
    
    processPartForAttachments(payload);
    return attachments;
  }
}