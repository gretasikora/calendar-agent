import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

// Load credentials from Claude Desktop config
const configPath = path.join(process.env.HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const googleConfig = config.mcpServers['Google Workspace'];

async function testBatchUpdate() {
  // Create OAuth2 client
  const oauth2Client = new OAuth2Client(
    googleConfig.env.GOOGLE_CLIENT_ID,
    googleConfig.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  // Need to get refresh token from separate location
  // For now, we'll test without authentication and use a mock
  console.log('Note: This test requires a valid refresh token to be set manually');
  
  // You would need to set this manually or get it from your environment
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  if (!REFRESH_TOKEN) {
    console.error('Please set GOOGLE_REFRESH_TOKEN environment variable');
    process.exit(1);
  }
  
  // Set credentials
  oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    // First, get list of unread emails
    console.log('Fetching unread emails...');
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 10
    });

    const messages = listResponse.data.messages || [];
    console.log(`Found ${messages.length} unread emails`);

    if (messages.length === 0) {
      console.log('No unread emails to test with');
      return;
    }

    // Extract message IDs
    const messageIds = messages.map(m => m.id);
    console.log('Message IDs:', messageIds);

    // Test 1: Verify each message exists and can be accessed
    console.log('\n--- Testing individual message access ---');
    const accessResults = [];
    
    for (const messageId of messageIds) {
      try {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'minimal'
        });
        accessResults.push({
          id: messageId,
          accessible: true,
          labelIds: msg.data.labelIds
        });
        console.log(`✓ Message ${messageId}: Accessible`);
      } catch (error) {
        accessResults.push({
          id: messageId,
          accessible: false,
          error: error.message
        });
        console.log(`✗ Message ${messageId}: ${error.message}`);
      }
    }

    // Test 2: Try batch modify with all messages
    console.log('\n--- Testing batch modify (all at once) ---');
    try {
      const batchResponse = await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          removeLabelIds: ['UNREAD']
        }
      });
      console.log('Batch modify succeeded for all messages');
    } catch (batchError) {
      console.log('Batch modify failed:', batchError.message);
      
      // Test 3: Try individual updates
      console.log('\n--- Testing individual updates ---');
      const individualResults = [];
      
      for (const messageId of messageIds) {
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
              removeLabelIds: ['UNREAD']
            }
          });
          individualResults.push({
            id: messageId,
            success: true
          });
          console.log(`✓ Message ${messageId}: Updated successfully`);
        } catch (error) {
          individualResults.push({
            id: messageId,
            success: false,
            error: error.message
          });
          console.log(`✗ Message ${messageId}: ${error.message}`);
        }
      }
      
      console.log('\n--- Individual update summary ---');
      const successCount = individualResults.filter(r => r.success).length;
      console.log(`Successful: ${successCount}/${individualResults.length}`);
      
      if (successCount < individualResults.length) {
        console.log('\nFailed messages:');
        individualResults.filter(r => !r.success).forEach(r => {
          console.log(`  - ${r.id}: ${r.error}`);
        });
      }
    }

    // Test 4: Check final state
    console.log('\n--- Checking final state ---');
    const finalStates = [];
    
    for (const messageId of messageIds) {
      try {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'minimal'
        });
        const isUnread = msg.data.labelIds?.includes('UNREAD') || false;
        finalStates.push({
          id: messageId,
          isUnread
        });
        console.log(`Message ${messageId}: ${isUnread ? 'STILL UNREAD' : 'Marked as read'}`);
      } catch (error) {
        finalStates.push({
          id: messageId,
          error: error.message
        });
        console.log(`Message ${messageId}: Error checking - ${error.message}`);
      }
    }

    const stillUnread = finalStates.filter(s => s.isUnread).length;
    console.log(`\nFinal summary: ${stillUnread}/${finalStates.length} messages are still unread`);

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testBatchUpdate();