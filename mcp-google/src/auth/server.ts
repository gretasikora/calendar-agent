import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { TokenManager } from './tokenManager.js';
import http from 'http';
import open from 'open';
import { loadCredentials } from './client.js';

export class AuthServer {
  private baseOAuth2Client: OAuth2Client; // Used by TokenManager for validation/refresh
  private flowOAuth2Client: OAuth2Client | null = null; // Used specifically for the auth code flow
  private app: express.Express;
  private server: http.Server | null = null;
  private tokenManager: TokenManager;
  private portRange: { start: number; end: number };
  public authCompletedSuccessfully = false; // Flag for standalone script

  constructor(oauth2Client: OAuth2Client) {
    this.baseOAuth2Client = oauth2Client;
    this.tokenManager = new TokenManager(oauth2Client);
    this.app = express();
    this.portRange = { start: 3000, end: 3004 };
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/', (req, res) => {
      // Generate the URL using the active flow client if available, else base
      const clientForUrl = this.flowOAuth2Client || this.baseOAuth2Client;
      const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.labels'
      ];
      const authUrl = clientForUrl.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
      });
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Google Workspace MCP Authentication</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #f5f5f5; margin: 0; padding: 20px; }
                .container { text-align: center; padding: 2.5em; background-color: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; }
                h1 { color: #1a73e8; margin-bottom: 0.5em; }
                h2 { color: #333; font-weight: normal; font-size: 1.2em; margin-bottom: 1.5em; }
                p { color: #666; line-height: 1.6; margin-bottom: 1.5em; }
                .btn { display: inline-block; background-color: #1a73e8; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500; transition: background-color 0.2s; }
                .btn:hover { background-color: #1557b0; }
                .permissions { background-color: #f8f9fa; padding: 1em; border-radius: 8px; margin: 1.5em 0; text-align: left; }
                .permissions h3 { margin: 0 0 0.5em 0; font-size: 1em; color: #333; }
                .permissions ul { margin: 0; padding-left: 1.5em; color: #666; }
                .permissions li { margin: 0.3em 0; }
                .footer { margin-top: 2em; font-size: 0.9em; color: #999; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🗓️ Google Workspace MCP</h1>
                <h2>Authentication Required</h2>
                <p>Claude Desktop needs permission to access your Google Calendar, Contacts, and Gmail.</p>
                
                <div class="permissions">
                    <h3>This will allow Claude to:</h3>
                    <ul>
                        <li>View your calendar events</li>
                        <li>Create new calendar events</li>
                        <li>Update existing events</li>
                        <li>Delete events</li>
                        <li>Check your availability</li>
                        <li>View and manage your contacts</li>
                        <li>Create new contacts</li>
                        <li>Update existing contacts</li>
                        <li>Delete contacts</li>
                        <li>Read and search your emails</li>
                        <li>Send emails on your behalf</li>
                        <li>Create and manage email drafts</li>
                        <li>Organize emails with labels</li>
                        <li>Mark emails as read/unread</li>
                    </ul>
                </div>
                
                <a href="${authUrl}" class="btn">Connect Google Workspace</a>
                
                <p class="footer">You'll be redirected to Google to sign in securely.<br>Your credentials are never stored by this application.</p>
            </div>
        </body>
        </html>
      `);
    });

    this.app.get('/oauth2callback', async (req, res) => {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).send('Authorization code missing');
        return;
      }
      // IMPORTANT: Use the flowOAuth2Client to exchange the code
      if (!this.flowOAuth2Client) {
        res.status(500).send('Authentication flow not properly initiated.');
        return;
      }
      try {
        const { tokens } = await this.flowOAuth2Client.getToken(code);
        // Save tokens using the TokenManager (which uses the base client)
        await this.tokenManager.saveTokens(tokens);
        this.authCompletedSuccessfully = true;

        // Get the path where tokens were saved
        const tokenPath = this.tokenManager.getTokenPath();

        // Send a more informative HTML response including the path
        res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Authentication Successful</title>
              <style>
                  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f4f4f4; margin: 0; }
                  .container { text-align: center; padding: 2em; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                  h1 { color: #4CAF50; }
                  p { color: #333; margin-bottom: 0.5em; }
                  code { background-color: #eee; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
              </style>
          </head>
          <body>
              <div class="container">
                  <h1>Authentication Successful!</h1>
                  <p>Your authentication tokens have been saved successfully to:</p>
                  <p><code>${tokenPath}</code></p>
                  <p>You can now close this browser window.</p>
              </div>
          </body>
          </html>
        `);
      } catch (error: unknown) {
        this.authCompletedSuccessfully = false;
        const message = error instanceof Error ? error.message : 'Unknown error';
        // Send an HTML error response
        res.status(500).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Authentication Failed</title>
              <style>
                  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f4f4f4; margin: 0; }
                  .container { text-align: center; padding: 2em; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                  h1 { color: #F44336; }
                  p { color: #333; }
              </style>
          </head>
          <body>
              <div class="container">
                  <h1>Authentication Failed</h1>
                  <p>An error occurred during authentication:</p>
                  <p><code>${message}</code></p>
                  <p>Please try again or check the server logs.</p>
              </div>
          </body>
          </html>
        `);
      }
    });
  }

  async start(openBrowser = true): Promise<boolean> {
    if (await this.tokenManager.validateTokens()) {
      this.authCompletedSuccessfully = true;
      return true;
    }
    
    // Try to start the server and get the port
    const port = await this.startServerOnAvailablePort();
    if (port === null) {
      this.authCompletedSuccessfully = false;
      return false;
    }

    // Successfully started server on `port`. Now create the flow-specific OAuth client.
    try {
      const { client_id, client_secret } = await loadCredentials();
      this.flowOAuth2Client = new OAuth2Client(
        client_id,
        client_secret,
        `http://localhost:${port}/oauth2callback`
      );
    } catch (error) {
        // Could not load credentials, cannot proceed with auth flow
        this.authCompletedSuccessfully = false;
        await this.stop(); // Stop the server we just started
        return false;
    }

    if (openBrowser) {
      // Generate Auth URL using the newly created flow client
      const authorizeUrl = this.flowOAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/contacts',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.labels'
        ],
        prompt: 'consent'
      });
      await open(authorizeUrl);
    }

    return true; // Auth flow initiated
  }

  private async startServerOnAvailablePort(): Promise<number | null> {
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      try {
        await new Promise<void>((resolve, reject) => {
          // Create a temporary server instance to test the port
          const testServer = this.app.listen(port, () => {
            this.server = testServer; // Assign to class property *only* if successful
            resolve();
          });
          testServer.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
              // Port is in use, close the test server and reject
              testServer.close(() => reject(err)); 
            } else {
              // Other error, reject
              reject(err);
            }
          });
        });
        return port; // Port successfully bound
      } catch (error: unknown) {
        // Check if it's EADDRINUSE, otherwise rethrow or handle
        if (!(error instanceof Error && 'code' in error && error.code === 'EADDRINUSE')) {
            // An unexpected error occurred during server start
            return null;
        }
        // EADDRINUSE occurred, loop continues
      }
    }
    return null; // No port found
  }

  public getRunningPort(): number | null {
    if (this.server) {
      const address = this.server.address();
      if (typeof address === 'object' && address !== null) {
        return address.port;
      }
    }
    return null;
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.server = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
} 