# MCP Google Workspace

**The ONLY comprehensive MCP server for Google Workspace that enables Claude, Cursor, Windsurf and other AI systems to fully manage Google Calendar, Contacts, AND Gmail** - read, create, update, delete, and organize across all three services!

Complete Google Workspace integration for Claude Desktop and other AI agents using the Model Context Protocol (MCP). This server provides comprehensive management capabilities for Calendar, Contacts, and Gmail with OAuth2 authentication.

## Why This MCP Server?

Other calendar MCP servers only provide **read-only** access. This is the **only MCP server** that gives AI systems like Claude, Cursor, and Windsurf the ability to:

### Calendar Management
- ✅ **Create** new calendar events
- ✅ **Update** existing events (including recurring events)
- ✅ **Delete** events
- ✅ **Manage** multiple calendars
- ✅ **Check availability** across calendars

### Contact Management
- ✅ **List** and search contacts
- ✅ **Create** new contacts with full details
- ✅ **Update** existing contacts
- ✅ **Delete** contacts
- ✅ **Manage** contact details (emails, phones, addresses, organizations)

### Gmail Management (NEW!)
- ✅ **Search** and list emails with powerful queries
- ✅ **Read** full email content with attachments
- ✅ **Send** new emails and replies
- ✅ **Organize** with labels and folders
- ✅ **Update** email status (read/unread, starred, important)
- ✅ **Create** and manage drafts
- ✅ **Batch operations** for bulk email management

## Features

### Calendar Features
- **Multi-Calendar Support**: List events from multiple calendars simultaneously
- **Event Management**: Create, update (including notifications), delete, and search calendar events
- **Recurring Events**: Advanced modification scopes for recurring events (single instance, all instances, or future instances only)
- **Calendar Management**: List calendars and their properties
- **Free/Busy Queries**: Check availability across calendars

### Contact Features
- **Contact Search**: Search contacts by name, email, or other criteria
- **Full Contact Details**: Manage names, emails, phone numbers, addresses, organizations, and notes
- **Batch Operations**: List contacts with pagination support
- **Field Selection**: Choose which contact fields to retrieve for optimized responses

### Gmail Features (NEW!)
- **Advanced Search**: Use Gmail's powerful search operators
- **Email Management**: Read, send, reply, forward, and delete emails
- **Label Organization**: Create and manage labels/folders
- **Draft Management**: Create, update, and send drafts
- **Batch Operations**: Update multiple emails at once
- **Thread Support**: Handle email conversations
- **Attachment Info**: View attachment details (names, sizes, types)

### Authentication
- **OAuth2 Authentication**: Secure authentication with automatic token refresh
- **Unified Permissions**: Single authentication flow for Calendar, Contacts, and Gmail access

## Installation

### Via npx (Recommended)

```bash
npx mcp-google
```

### Via npm

```bash
npm install -g mcp-google
```

## Setup

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable these APIs:
   - [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   - [Google People API](https://console.cloud.google.com/apis/library/people.googleapis.com)
4. Configure OAuth consent screen:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Choose "External" user type
   - Fill in required fields (app name, support email, etc.)
   - Add your email as a test user (required while in test mode)
5. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose **"Desktop app"** as the application type
   - Name your OAuth client (e.g., "MCP Calendar Client")
   - Download the credentials JSON file

### 2. Configure Claude Desktop

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Option A: Direct Environment Variables (Simplest - No JSON file needed!)

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "mcp-google"],
      "env": {
        "GOOGLE_CLIENT_ID": "YOUR_CLIENT_ID.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

#### Option B: Use Downloaded Google Credentials File

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "mcp-google"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/downloaded/credentials.json"
      }
    }
  }
}
```

Just use the file path where you saved the JSON file downloaded from Google Cloud Console.

### 3. Authenticate

1. Restart Claude Desktop
2. The MCP server will open a browser window for authentication
3. Log in with your Google account and grant Calendar, Contacts, AND Gmail permissions
4. Tokens will be saved securely for future use

**Note:** If upgrading from a previous version, you'll need to re-authenticate to grant the new Gmail permissions.

## Environment Variables

- `GOOGLE_OAUTH_CREDENTIALS`: Path to OAuth credentials JSON file
- `GOOGLE_CALENDAR_MCP_TOKEN_PATH`: Custom path for token storage (optional)
- `NODE_ENV`: Set to "production" for production use

## Available Tools

### Calendar Tools

#### list-calendars
List all accessible calendars with their properties.

#### list-events
List events from one or more calendars with filtering options.

#### create-event
Create a new calendar event with support for:
- Single or recurring events
- Attendees and notifications
- Custom colors
- Time zones

#### update-event
Update existing events including:
- Modifying single instances of recurring events
- Changing event details
- Managing attendees

#### delete-event
Delete events from calendars.

#### search-events
Search for events across calendars using text queries.

#### get-freebusy
Query free/busy information across multiple calendars.

#### list-colors
List available calendar event colors.

### Contact Tools

#### list-contacts
List and search contacts with pagination support.

#### get-contact
Get detailed information about a specific contact.

#### create-contact
Create new contacts with:
- Names and nicknames
- Multiple email addresses
- Phone numbers
- Physical addresses
- Organizations and job titles
- Notes and biographies

#### update-contact
Update existing contact information with field-specific updates.

#### delete-contact
Delete contacts from Google Contacts.

### Gmail Tools (NEW!)

#### list-emails
Search and list emails with powerful Gmail queries.

#### get-email
Read full email content including body and attachments.

#### send-email
Send new emails or replies with HTML support.

#### update-email
Modify email properties (labels, read status, star, archive).

#### delete-email
Move emails to trash or permanently delete.

#### create-draft
Create email drafts for later editing.

#### update-draft
Edit existing email drafts.

#### send-draft
Send a saved draft.

#### list-labels
List all Gmail labels/folders.

#### create-label
Create new labels for organizing emails.

#### update-label
Modify label properties and colors.

#### delete-label
Remove labels from Gmail.

#### batch-update-emails
Perform bulk operations on multiple emails.

## Example Usage

### Calendar Examples

#### Check availability
```
What times am I free tomorrow between 9am and 5pm?
```

#### Create an event
```
Create a meeting called "Team Standup" tomorrow at 10am for 30 minutes
```

#### Search for events
```
Find all events this week that mention "project review"
```

#### Update recurring events
```
Change all future instances of my weekly team meeting to 2pm
```

### Contact Examples

#### List contacts
```
Show me all my contacts with email addresses
```

#### Create a contact
```
Create a contact for John Doe, email: john@example.com, phone: 555-1234
```

#### Search contacts
```
Find contacts who work at Google
```

#### Update contact
```
Update Jane Smith's phone number to 555-5678
```

### Gmail Examples

#### Search emails
```
Show me all unread emails from this week
```

#### Send email
```
Send an email to john@example.com with subject "Meeting Tomorrow" and body "Let's meet at 2pm"
```

#### Organize inbox
```
Mark all newsletters as read and archive them
```

#### Manage labels
```
Create a label called "Important Projects" and apply it to all emails from my manager
```

#### Batch operations
```
Move all emails older than 30 days to trash
```

## Troubleshooting

### Authentication Issues
- Ensure redirect URI matches exactly: `http://localhost:3000/oauth2callback`
- Check that both Calendar API and People API are enabled in Google Cloud Console
- Verify OAuth credentials are for a "Desktop app" type
- If upgrading from calendar-only, re-run authentication to grant contacts permissions

### Token Expiration
- Tokens are automatically refreshed
- If issues persist, delete the token file and re-authenticate

### Permission Errors
- Ensure you've granted all requested Calendar, Contacts, and Gmail permissions
- Check that the Google account has access to the resources you're trying to access
- Ensure all required APIs are enabled in your Google Cloud project:
  - Google Calendar API
  - Google People API
  - Gmail API

## Security

- OAuth tokens are stored with restricted permissions (0600)
- Client secrets should never be committed to version control
- Use environment variables for sensitive configuration

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

## Team

Developed by **[Boris Djordjevic](https://github.com/biobook)** and the **[199 Longevity](https://github.com/199-biotechnologies)** team.

Built on top of the original [google-calendar-mcp](https://github.com/nspady/google-calendar-mcp) by nspady.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/199-biotechnologies/mcp-google-calendar-plus).

## Changelog

### v1.1.3
- Fixed timezone validation to support milliseconds in ISO timestamps
- Now compatible with JavaScript's `Date.toISOString()` format (e.g., `2024-01-01T00:00:00.000Z`)
- Improved datetime validation regex to handle both formats with and without milliseconds

### v1.1.2
- Improved authentication flow with clear, informative landing page
- Users now see exactly what permissions Claude will have before connecting
- Professional UI that clearly identifies this as Google Calendar authentication
- Added security note that credentials are never stored

### v1.1.1
- Enhanced documentation to highlight unique full calendar management capabilities
- Added "Why This MCP Server?" section emphasizing create/update/delete features
- Updated package description and keywords for better discoverability

### v1.1.0
- **Simplified setup**: Added support for direct environment variables (no JSON file needed!)
- Users can now use `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` directly in Claude config
- Updated README with clearer Desktop app OAuth setup instructions
- Removed unnecessary redirect URI configuration steps

### v1.0.1
- Added automatic retry logic for network errors
- Improved error handling for socket hang-up issues
- Silent recovery when events are created despite connection errors

### v1.0.0
- Initial release with enhanced OAuth2 authentication
- Comprehensive calendar management tools
- Multi-calendar support
- Free/busy queries