import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { google, people_v1 } from "googleapis";
import { BaseToolHandler } from "../BaseToolHandler.js";

interface GetContactArgs {
  resourceName: string;
  personFields?: string[];
}

export class GetContactHandler extends BaseToolHandler {
  async runTool(args: GetContactArgs, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    try {
      const people = google.people({ version: 'v1', auth: oauth2Client });
      
      // Default person fields if not specified
      const personFields = args.personFields && args.personFields.length > 0 
        ? args.personFields.join(',')
        : 'names,emailAddresses,phoneNumbers,addresses,organizations,biographies,photos,birthdays,events,relations,urls,userDefined,memberships,metadata';
      
      const response = await people.people.get({
        resourceName: args.resourceName,
        personFields
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              contact: this.formatContact(response.data)
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
      metadata: contact.metadata,
      names: contact.names?.map(name => ({
        displayName: name.displayName,
        familyName: name.familyName,
        givenName: name.givenName,
        middleName: name.middleName,
        honorificPrefix: name.honorificPrefix,
        honorificSuffix: name.honorificSuffix,
        metadata: name.metadata
      })),
      emailAddresses: contact.emailAddresses?.map(email => ({
        value: email.value,
        type: email.type,
        formattedType: email.formattedType,
        metadata: email.metadata
      })),
      phoneNumbers: contact.phoneNumbers?.map(phone => ({
        value: phone.value,
        type: phone.type,
        formattedType: phone.formattedType,
        canonicalForm: phone.canonicalForm,
        metadata: phone.metadata
      })),
      addresses: contact.addresses?.map(address => ({
        formattedValue: address.formattedValue,
        type: address.type,
        formattedType: address.formattedType,
        streetAddress: address.streetAddress,
        extendedAddress: address.extendedAddress,
        poBox: address.poBox,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
        countryCode: address.countryCode,
        metadata: address.metadata
      })),
      organizations: contact.organizations?.map(org => ({
        name: org.name,
        phoneticName: org.phoneticName,
        title: org.title,
        department: org.department,
        symbol: org.symbol,
        location: org.location,
        type: org.type,
        formattedType: org.formattedType,
        startDate: org.startDate,
        endDate: org.endDate,
        current: org.current,
        metadata: org.metadata
      })),
      biographies: contact.biographies?.map(bio => ({
        value: bio.value,
        contentType: bio.contentType,
        metadata: bio.metadata
      })),
      birthdays: contact.birthdays?.map(birthday => ({
        date: birthday.date,
        text: birthday.text,
        metadata: birthday.metadata
      })),
      events: contact.events?.map(event => ({
        date: event.date,
        type: event.type,
        formattedType: event.formattedType,
        metadata: event.metadata
      })),
      relations: contact.relations?.map(relation => ({
        person: relation.person,
        type: relation.type,
        formattedType: relation.formattedType,
        metadata: relation.metadata
      })),
      urls: contact.urls?.map(url => ({
        value: url.value,
        type: url.type,
        formattedType: url.formattedType,
        metadata: url.metadata
      })),
      memberships: contact.memberships?.map(membership => ({
        contactGroupMembership: membership.contactGroupMembership,
        domainMembership: membership.domainMembership,
        metadata: membership.metadata
      })),
      photos: contact.photos?.map(photo => ({
        url: photo.url,
        default: photo.default,
        metadata: photo.metadata
      }))
    };
  }
}