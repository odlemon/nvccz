// @ts-nocheck
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

export interface RSVPResponse {
  attendeeEmail: string;
  responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  responseTime: string;
}

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client;
  private calendar: any;
  private calendarId: string;
  private timeZone: string;

  constructor() {
    // Initialize OAuth2 client with credentials
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
    );

    // Set credentials (you'll need to implement token management)
    this.oauth2Client.setCredentials({
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    this.timeZone = process.env.GOOGLE_CALENDAR_TIMEZONE || 'UTC';

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  private asRfc3339DateTime(input: any): string {
    if (!input) return new Date().toISOString();
    if (input instanceof Date) return input.toISOString();
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return String(input);
  }

  private isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  }

  /**
   * Create a Google Calendar event
   */
  async createEvent(eventData: GoogleCalendarEvent): Promise<{ id: string; htmlLink?: string | null }> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Google Calendar is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN)');
      }
      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        resource: {
          summary: eventData.summary,
          description: eventData.description,
          start: {
            dateTime: this.asRfc3339DateTime(eventData.start.dateTime),
            timeZone: eventData.start.timeZone || this.timeZone,
          },
          end: {
            dateTime: this.asRfc3339DateTime(eventData.end.dateTime),
            timeZone: eventData.end.timeZone || this.timeZone,
          },
          location: eventData.location,
          attendees: eventData.attendees || [],
          reminders: eventData.reminders || {
            useDefault: true,
          },
        },
      });

      return { id: response.data.id, htmlLink: response.data.htmlLink || null };
    } catch (error) {
      console.error('Error creating Google Calendar event:', error);
      throw new Error('Failed to create Google Calendar event');
    }
  }

  /**
   * Update a Google Calendar event
   */
  async updateEvent(eventId: string, eventData: GoogleCalendarEvent): Promise<void> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Google Calendar is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN)');
      }
      // Important: only include fields we intend to change.
      // If we send `attendees: []` Google will remove all attendees and email cancellations.
      const resource: any = {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: this.asRfc3339DateTime(eventData.start.dateTime),
          timeZone: eventData.start.timeZone || this.timeZone,
        },
        end: {
          dateTime: this.asRfc3339DateTime(eventData.end.dateTime),
          timeZone: eventData.end.timeZone || this.timeZone,
        },
        location: eventData.location,
      };
      if (eventData.attendees !== undefined) {
        resource.attendees = eventData.attendees;
      }
      if (eventData.reminders !== undefined) {
        resource.reminders = eventData.reminders;
      }

      await this.calendar.events.update({
        calendarId: this.calendarId,
        eventId: eventId,
        sendUpdates: 'all',
        resource,
      });
    } catch (error) {
      console.error('Error updating Google Calendar event:', error);
      throw new Error('Failed to update Google Calendar event');
    }
  }

  /**
   * Delete a Google Calendar event
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Google Calendar is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN)');
      }
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId: eventId,
        sendUpdates: 'all',
      });
    } catch (error) {
      console.error('Error deleting Google Calendar event:', error);
      throw new Error('Failed to delete Google Calendar event');
    }
  }

  /**
   * Get event details from Google Calendar
   */
  async getEvent(eventId: string): Promise<any> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Google Calendar is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN)');
      }
      const response = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId: eventId,
      });

      return response.data;
    } catch (error) {
      console.error('Error getting Google Calendar event:', error);
      throw new Error('Failed to get Google Calendar event');
    }
  }

  /**
   * Get RSVP responses for an event
   */
  async getEventRSVPs(eventId: string): Promise<RSVPResponse[]> {
    try {
      const event = await this.getEvent(eventId);
      
      if (!event.attendees) {
        return [];
      }

      return event.attendees.map((attendee: any) => ({
        attendeeEmail: attendee.email,
        responseStatus: attendee.responseStatus || 'needsAction',
        responseTime: attendee.responseTime || new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error getting RSVP responses:', error);
      throw new Error('Failed to get RSVP responses');
    }
  }

  /**
   * Generate Google Calendar event link
   */
  generateEventLink(eventId: string): string {
    return `https://calendar.google.com/calendar/event?eid=${eventId}`;
  }

  /**
   * Generate RSVP link for attendees
   */
  generateRSVPLink(eventId: string, attendeeEmail: string): string {
    // This would typically be a custom RSVP page that handles the response
    return `${process.env.EVENTS_PORTAL_URL || 'http://app.kyntaro.com'}/events/${eventId}/rsvp?email=${encodeURIComponent(attendeeEmail)}`;
  }

  /**
   * Sync event with Google Calendar
   */
  async syncEventWithGoogle(eventData: any): Promise<{ googleEventId: string; googleCalendarLink: string }> {
    try {
      const googleEvent: GoogleCalendarEvent = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startDate,
          timeZone: this.timeZone,
        },
        end: {
          dateTime: eventData.endDate,
          timeZone: this.timeZone,
        },
        location: eventData.location,
        attendees: eventData.guests?.map((guest: any) => ({
          email: guest.email,
          displayName: guest.name,
          responseStatus: 'needsAction',
        })) || [],
        reminders: {
          useDefault: true,
        },
      };

      const created = await this.calendar.events.insert({
        calendarId: this.calendarId,
        sendUpdates: 'all',
        resource: {
          summary: googleEvent.summary,
          description: googleEvent.description,
          start: {
            dateTime: this.asRfc3339DateTime(googleEvent.start.dateTime),
            timeZone: googleEvent.start.timeZone || this.timeZone,
          },
          end: {
            dateTime: this.asRfc3339DateTime(googleEvent.end.dateTime),
            timeZone: googleEvent.end.timeZone || this.timeZone,
          },
          location: googleEvent.location,
          attendees: googleEvent.attendees || [],
          reminders: googleEvent.reminders || { useDefault: true },
        },
      });
      const googleEventId = created.data.id;
      const googleCalendarLink = created.data.htmlLink || this.generateEventLink(googleEventId);

      return {
        googleEventId,
        googleCalendarLink,
      };
    } catch (error) {
      console.error('Error syncing event with Google Calendar:', error);
      throw new Error('Failed to sync event with Google Calendar');
    }
  }

  /**
   * Update event attendees in Google Calendar
   */
  async updateEventAttendees(googleEventId: string, attendees: Array<{ email: string; name: string }>): Promise<void> {
    try {
      const event = await this.getEvent(googleEventId);
      
      const updatedEvent = {
        ...event,
        attendees: attendees.map(attendee => ({
          email: attendee.email,
          displayName: attendee.name,
          responseStatus: 'needsAction',
        })),
      };

      await this.calendar.events.update({
        calendarId: this.calendarId,
        eventId: googleEventId,
        sendUpdates: 'all',
        resource: updatedEvent,
      });
    } catch (error) {
      console.error('Error updating event attendees:', error);
      throw new Error('Failed to update event attendees');
    }
  }

  async updateAttendeeResponse(
    googleEventId: string,
    attendeeEmail: string,
    responseStatus: 'declined' | 'tentative' | 'accepted' | 'needsAction'
  ): Promise<void> {
    const event = await this.getEvent(googleEventId);
    const attendees = Array.isArray(event?.attendees) ? event.attendees : [];
    const emailNorm = String(attendeeEmail || '').trim().toLowerCase();
    const next = attendees.map((a: any) => {
      const aEmail = String(a?.email || '').trim().toLowerCase();
      if (aEmail !== emailNorm) return a;
      return { ...a, responseStatus };
    });
    await this.calendar.events.update({
      calendarId: this.calendarId,
      eventId: googleEventId,
      sendUpdates: 'all',
      resource: { ...event, attendees: next },
    });
  }

  /**
   * Get authorization URL for OAuth
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: scopes,
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code: string): Promise<any> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      return tokens;
    } catch (error) {
      console.error('Error getting tokens:', error);
      throw new Error('Failed to get authorization tokens');
    }
  }
}


