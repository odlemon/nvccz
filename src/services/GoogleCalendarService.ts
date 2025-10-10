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

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Create a Google Calendar event
   */
  async createEvent(eventData: GoogleCalendarEvent): Promise<string> {
    try {
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: {
          summary: eventData.summary,
          description: eventData.description,
          start: {
            dateTime: eventData.start.dateTime,
            timeZone: eventData.start.timeZone || 'UTC',
          },
          end: {
            dateTime: eventData.end.dateTime,
            timeZone: eventData.end.timeZone || 'UTC',
          },
          location: eventData.location,
          attendees: eventData.attendees || [],
          reminders: eventData.reminders || {
            useDefault: true,
          },
        },
      });

      return response.data.id;
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
      await this.calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: {
          summary: eventData.summary,
          description: eventData.description,
          start: {
            dateTime: eventData.start.dateTime,
            timeZone: eventData.start.timeZone || 'UTC',
          },
          end: {
            dateTime: eventData.end.dateTime,
            timeZone: eventData.end.timeZone || 'UTC',
          },
          location: eventData.location,
          attendees: eventData.attendees || [],
          reminders: eventData.reminders || {
            useDefault: true,
          },
        },
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
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
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
      const response = await this.calendar.events.get({
        calendarId: 'primary',
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
    return `${process.env.FRONTEND_URL}/events/${eventId}/rsvp?email=${encodeURIComponent(attendeeEmail)}`;
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
          timeZone: 'UTC',
        },
        end: {
          dateTime: eventData.endDate,
          timeZone: 'UTC',
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

      const googleEventId = await this.createEvent(googleEvent);
      const googleCalendarLink = this.generateEventLink(googleEventId);

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
        calendarId: 'primary',
        eventId: googleEventId,
        resource: updatedEvent,
      });
    } catch (error) {
      console.error('Error updating event attendees:', error);
      throw new Error('Failed to update event attendees');
    }
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


