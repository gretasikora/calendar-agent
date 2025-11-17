import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, people_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface CreateContactArgs {
  givenName?: string;
  familyName?: string;
  middleName?: string;
  displayName?: string;
  emailAddresses?: Array<{
    value: string;
    type?: string;
  }>;
  phoneNumbers?: Array<{
    value: string;
    type?: string;
  }>;
  addresses?: Array<{
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    type?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    department?: string;
    type?: string;
  }>;
  biographies?: Array<{
    value: string;
    contentType?: string;
  }>;
  notes?: string;
}

export class CreateContactHandler extends BaseToolHandler {
  async runTool(args: CreateContactArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const people = google.people({ version: 'v1', auth: oauth2Client });
      
      // Build the person object
      const person: people_v1.Schema$Person = {};
      
      // Names
      if (args.givenName || args.familyName || args.middleName || args.displayName) {
        person.names = [{
          givenName: args.givenName,
          familyName: args.familyName,
          middleName: args.middleName,
          displayName: args.displayName || `${args.givenName || ''} ${args.familyName || ''}`.trim()
        }];
      }
      
      // Email addresses
      if (args.emailAddresses && args.emailAddresses.length > 0) {
        person.emailAddresses = args.emailAddresses.map(email => ({
          value: email.value,
          type: email.type || 'home'
        }));
      }
      
      // Phone numbers
      if (args.phoneNumbers && args.phoneNumbers.length > 0) {
        person.phoneNumbers = args.phoneNumbers.map(phone => ({
          value: phone.value,
          type: phone.type || 'home'
        }));
      }
      
      // Addresses
      if (args.addresses && args.addresses.length > 0) {
        person.addresses = args.addresses.map(address => ({
          streetAddress: address.streetAddress,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
          type: address.type || 'home'
        }));
      }
      
      // Organizations
      if (args.organizations && args.organizations.length > 0) {
        person.organizations = args.organizations.map(org => ({
          name: org.name,
          title: org.title,
          department: org.department,
          type: org.type || 'work'
        }));
      }
      
      // Biographies
      if (args.biographies && args.biographies.length > 0) {
        person.biographies = args.biographies;
      } else if (args.notes) {
        // Use notes as a biography if no biographies provided
        person.biographies = [{
          value: args.notes,
          contentType: 'TEXT_PLAIN'
        }];
      }
      
      const response = await people.people.createContact({
        requestBody: person,
        personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,biographies'
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              contact: {
                resourceName: response.data.resourceName,
                etag: response.data.etag,
                ...this.formatContactResponse(response.data)
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }

  private formatContactResponse(contact: people_v1.Schema$Person): any {
    return {
      names: contact.names,
      emailAddresses: contact.emailAddresses,
      phoneNumbers: contact.phoneNumbers,
      addresses: contact.addresses,
      organizations: contact.organizations,
      biographies: contact.biographies
    };
  }
}