import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, people_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface UpdateContactArgs {
  resourceName: string;
  updatePersonFields: string[];
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
}

export class UpdateContactHandler extends BaseToolHandler {
  async runTool(args: UpdateContactArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const people = google.people({ version: 'v1', auth: oauth2Client });
      
      // First, get the existing contact to get the etag
      const existingContact = await people.people.get({
        resourceName: args.resourceName,
        personFields: 'names'
      });
      
      // Build the person object with updates
      const person: people_v1.Schema$Person = {
        etag: existingContact.data.etag,
        resourceName: args.resourceName
      };
      
      // Names
      if (args.updatePersonFields.includes('names')) {
        person.names = [{
          givenName: args.givenName,
          familyName: args.familyName,
          middleName: args.middleName,
          displayName: args.displayName || `${args.givenName || ''} ${args.familyName || ''}`.trim()
        }];
      }
      
      // Email addresses
      if (args.updatePersonFields.includes('emailAddresses') && args.emailAddresses) {
        person.emailAddresses = args.emailAddresses.map(email => ({
          value: email.value,
          type: email.type || 'home'
        }));
      }
      
      // Phone numbers
      if (args.updatePersonFields.includes('phoneNumbers') && args.phoneNumbers) {
        person.phoneNumbers = args.phoneNumbers.map(phone => ({
          value: phone.value,
          type: phone.type || 'home'
        }));
      }
      
      // Addresses
      if (args.updatePersonFields.includes('addresses') && args.addresses) {
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
      if (args.updatePersonFields.includes('organizations') && args.organizations) {
        person.organizations = args.organizations.map(org => ({
          name: org.name,
          title: org.title,
          department: org.department,
          type: org.type || 'work'
        }));
      }
      
      // Biographies
      if (args.updatePersonFields.includes('biographies') && args.biographies) {
        person.biographies = args.biographies;
      }
      
      const response = await people.people.updateContact({
        resourceName: args.resourceName,
        updatePersonFields: args.updatePersonFields.join(','),
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