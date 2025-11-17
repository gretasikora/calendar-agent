import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, people_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface ListContactsArgs {
  pageSize?: number;
  pageToken?: string;
  personFields?: string[];
  sources?: string[];
  query?: string;
}

export class ListContactsHandler extends BaseToolHandler {
  async runTool(args: ListContactsArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const people = google.people({ version: 'v1', auth: oauth2Client });
      
      // Default person fields if not specified
      const personFields = args.personFields && args.personFields.length > 0 
        ? args.personFields.join(',')
        : 'names,emailAddresses,phoneNumbers,addresses,organizations,biographies,photos';
      
      // Default sources if not specified
      const sources = args.sources && args.sources.length > 0
        ? args.sources
        : ['READ_SOURCE_TYPE_CONTACT'];
      
      const response = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: args.pageSize || 100,
        pageToken: args.pageToken,
        personFields,
        sources,
        ...(args.query && { query: args.query })
      });

      const contacts = response.data.connections || [];
      const formattedContacts = contacts.map(contact => this.formatContact(contact));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              contacts: formattedContacts,
              totalItems: response.data.totalItems || formattedContacts.length,
              nextPageToken: response.data.nextPageToken || null
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      this.handleGoogleApiError(error);
      throw error;
    }
  }

  private formatContact(contact: people_v1.Schema$Person): any {
    return {
      resourceName: contact.resourceName,
      etag: contact.etag,
      names: contact.names?.map(name => ({
        displayName: name.displayName,
        familyName: name.familyName,
        givenName: name.givenName,
        middleName: name.middleName,
        honorificPrefix: name.honorificPrefix,
        honorificSuffix: name.honorificSuffix
      })),
      emailAddresses: contact.emailAddresses?.map(email => ({
        value: email.value,
        type: email.type,
        formattedType: email.formattedType
      })),
      phoneNumbers: contact.phoneNumbers?.map(phone => ({
        value: phone.value,
        type: phone.type,
        formattedType: phone.formattedType
      })),
      addresses: contact.addresses?.map(address => ({
        formattedValue: address.formattedValue,
        type: address.type,
        formattedType: address.formattedType,
        streetAddress: address.streetAddress,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
        countryCode: address.countryCode
      })),
      organizations: contact.organizations?.map(org => ({
        name: org.name,
        title: org.title,
        department: org.department,
        type: org.type,
        formattedType: org.formattedType
      })),
      biographies: contact.biographies?.map(bio => ({
        value: bio.value,
        contentType: bio.contentType
      })),
      photos: contact.photos?.map(photo => ({
        url: photo.url,
        default: photo.default
      }))
    };
  }
}