// @ts-nocheck
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { envConfig } from '../utils/env';

export const initializeSentry = () => {
  // Only initialize Sentry in production or if DSN is provided
  if (process.env.NODE_ENV === 'production' || process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      
      // Performance monitoring
      integrations: [
        // Enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // Enable Express.js middleware tracing
        new Sentry.Integrations.Express({ app: require('express') }),
        // Enable profiling
        new ProfilingIntegration(),
      ],
      
      // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
      // We recommend adjusting this value in production
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      
      // Set profilesSampleRate to 1.0 to profile every transaction
      // We recommend adjusting this value in production
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      
      // Enable debug mode in development
      debug: process.env.NODE_ENV === 'development',
      
      // Before sending event to Sentry
      beforeSend(event, hint) {
        // Don't send events in development unless explicitly enabled
        if (process.env.NODE_ENV === 'development' && !process.env.SENTRY_DSN) {
          return null;
        }
        
        // Add custom context
        event.tags = {
          ...event.tags,
          service: 'nvccz-api',
          version: process.env.npm_package_version || '1.0.0'
        };
        
        // Add user context if available
        if (hint.originalException?.user) {
          event.user = {
            id: hint.originalException.user.id,
            email: hint.originalException.user.email
          };
        }
        
        return event;
      },
      
      // Ignore certain errors
      ignoreErrors: [
        // Ignore specific error types
        'Network Error',
        'Request timeout',
        // Ignore Prisma connection errors in development
        ...(process.env.NODE_ENV === 'development' ? [
          'P1001', // Can't reach database server
          'P1002', // Database server doesn't exist
        ] : [])
      ],
      
      // Configure sampling
      sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
    
    console.log('🚀 Sentry initialized successfully');
  } else {
    console.log('📝 Sentry not initialized (development mode, no DSN)');
  }
};

// Export Sentry for use in other files
export { Sentry };

// Helper function to capture errors with context
export const captureException = (error: Error, context?: any) => {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
};

// Helper function to capture messages
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info') => {
  Sentry.captureMessage(message, level);
};

// Helper function to set user context
export const setUserContext = (user: { id: string; email: string; firstName?: string; lastName?: string }) => {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: `${user.firstName || ''} ${user.lastName || ''}`.trim()
  });
};

// Helper function to clear user context
export const clearUserContext = () => {
  Sentry.setUser(null);
};

