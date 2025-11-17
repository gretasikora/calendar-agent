import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface UpdateDraftArgs {
  draftId: string;
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  isHtml?: boolean;
  replyToMessageId?: string;
  threadId?: string;
}

export class UpdateDraftHandler extends BaseToolHandler {
  async runTool(args: UpdateDraftArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Get user's email address
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const userEmail = profile.data.emailAddress;
      
      // Create the updated email message
      const message = this.createMessage(
        userEmail!,
        args.to,
        args.subject,
        args.body,
        args.cc,
        args.bcc,
        args.isHtml || false,
        args.replyToMessageId
      );
      
      // Update the draft
      const requestBody: gmail_v1.Schema$Draft = {
        message: {
          raw: message,
          threadId: args.threadId
        }
      };
      
      const response = await gmail.users.drafts.update({
        userId: 'me',
        id: args.draftId,
        requestBody
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              draftId: response.data.id,
              messageId: response.data.message?.id,
              threadId: response.data.message?.threadId
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }

  private createMessage(
    from: string,
    to: string | string[],
    subject: string,
    body: string,
    cc?: string | string[],
    bcc?: string | string[],
    isHtml: boolean = false,
    replyToMessageId?: string
  ): string {
    const boundary = "boundary_" + Date.now();
    const toAddresses = Array.isArray(to) ? to.join(', ') : to;
    
    let messageParts = [
      `From: ${from}`,
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0'
    ];
    
    // Add CC if provided
    if (cc) {
      const ccAddresses = Array.isArray(cc) ? cc.join(', ') : cc;
      messageParts.push(`Cc: ${ccAddresses}`);
    }
    
    // Add BCC if provided
    if (bcc) {
      const bccAddresses = Array.isArray(bcc) ? bcc.join(', ') : bcc;
      messageParts.push(`Bcc: ${bccAddresses}`);
    }
    
    // Add In-Reply-To header if replying
    if (replyToMessageId) {
      messageParts.push(`In-Reply-To: ${replyToMessageId}`);
      messageParts.push(`References: ${replyToMessageId}`);
    }
    
    // Set content type
    if (isHtml) {
      messageParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      messageParts.push('');
      messageParts.push(`--${boundary}`);
      messageParts.push('Content-Type: text/plain; charset=UTF-8');
      messageParts.push('');
      messageParts.push(this.htmlToText(body));
      messageParts.push('');
      messageParts.push(`--${boundary}`);
      messageParts.push('Content-Type: text/html; charset=UTF-8');
      messageParts.push('');
      messageParts.push(body);
      messageParts.push('');
      messageParts.push(`--${boundary}--`);
    } else {
      messageParts.push('Content-Type: text/plain; charset=UTF-8');
      messageParts.push('');
      messageParts.push(body);
    }
    
    const message = messageParts.join('\r\n');
    
    // Encode in base64
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    return encodedMessage;
  }
  
  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
}