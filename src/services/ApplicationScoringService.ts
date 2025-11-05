//@ts-nocheck
import { prisma } from '../utils/database';
import { ChatGPTService } from './ChatGPTService';
import { EmailNotificationService } from './EmailNotificationService';
import { logger } from '../utils/logger';

/**
 * Application Scoring Service
 * Handles automated shortlisting using ChatGPT scoring
 */
export class ApplicationScoringService {
  /**
   * Process application for shortlisting (async, no response needed)
   * This method is called after application creation
   */
  static async processApplicationForShortlisting(applicationId: string): Promise<void> {
    try {
      logger.info('Starting shortlisting process', { applicationId });

      // Fetch application with documents
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          documents: {
            where: { isSubmitted: true }
          }
        }
      });

      if (!application) {
        logger.error('Application not found for shortlisting', { applicationId });
        return;
      }

      if (application.currentStage !== 'PENDING_SHORTLISTING') {
        logger.info('Application already processed or not in pending shortlisting stage', {
          applicationId,
          currentStage: application.currentStage
        });
        return;
      }

      // Prepare document URLs for ChatGPT
      const documentUrls = application.documents.map(doc => ({
        url: doc.fileUrl,
        type: doc.documentType,
        fileName: doc.fileName
      }));

      if (documentUrls.length === 0) {
        logger.warn('No documents found for application', { applicationId });
        // Reject if no documents
        await this.rejectApplication(application, 'No documents provided');
        return;
      }

      // Prepare application data for scoring
      const applicationData = {
        applicantName: application.applicantName,
        businessName: application.businessName,
        businessDescription: application.businessDescription || '',
        industry: application.industry || '',
        businessStage: application.businessStage || '',
        requestedAmount: Number(application.requestedAmount),
        foundingDate: application.foundingDate,
        applicantAddress: application.applicantAddress || ''
      };

      // Call ChatGPT to score the application
      logger.info('Calling ChatGPT for application scoring', { applicationId });
      const scoringResult = await ChatGPTService.scoreApplication(applicationData, documentUrls);

      const score = scoringResult.score;
      const reasoning = scoringResult.reasoning;
      const applicantDetails = scoringResult.applicantDetails;

      logger.info('Application scored by ChatGPT', {
        applicationId,
        score,
        businessName: application.businessName
      });

      // Update application with score
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          initialScreeningScore: score,
          screeningOutcome: score >= 50 ? 'SHORTLISTED' : 'REJECTED',
          // Store applicant details in metadata if needed
        }
      });

      // Determine if shortlisted or rejected
      if (score >= 50) {
        // Shortlist the application
        await this.shortlistApplication(application, score, reasoning, applicantDetails);
      } else {
        // Reject the application
        await this.rejectApplication(application, reasoning);
      }
    } catch (error: any) {
      logger.error('Error processing application for shortlisting', {
        applicationId,
        error: error.message,
        stack: error.stack
      });

      // On error, reject the application to be safe
      try {
        const application = await prisma.application.findUnique({
          where: { id: applicationId }
        });
        if (application && application.currentStage === 'PENDING_SHORTLISTING') {
          await this.rejectApplication(application, 'Technical error during evaluation');
        }
      } catch (rejectError: any) {
        logger.error('Error rejecting application after scoring error', {
          applicationId,
          error: rejectError.message
        });
      }
    }
  }

  /**
   * Shortlist an application
   */
  private static async shortlistApplication(
    application: any,
    score: number,
    reasoning: string,
    applicantDetails: any
  ): Promise<void> {
    try {
      // Update application status to SHORTLISTED
      await prisma.application.update({
        where: { id: application.id },
        data: {
          currentStage: 'SHORTLISTED',
          initialScreeningScore: score,
          screeningOutcome: 'SHORTLISTED',
          updatedAt: new Date()
        }
      });

      logger.info('Application shortlisted', {
        applicationId: application.id,
        score,
        businessName: application.businessName
      });

      // Send shortlisted email
      try {
        await EmailNotificationService.sendApplicationShortlistedEmail({
          applicantName: application.applicantName,
          applicantEmail: application.applicantEmail,
          businessName: application.businessName,
          applicationId: application.id,
          currentStage: 'SHORTLISTED',
          additionalInfo: {
            score,
            reasoning
          }
        });

        logger.info('Shortlisted email sent successfully', {
          applicationId: application.id,
          applicantEmail: application.applicantEmail
        });
      } catch (emailError: any) {
        logger.error('Failed to send shortlisted email', {
          applicationId: application.id,
          error: emailError.message
        });
        // Don't fail the shortlisting if email fails
      }
    } catch (error: any) {
      logger.error('Error shortlisting application', {
        applicationId: application.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reject an application
   */
  private static async rejectApplication(
    application: any,
    rejectionReason: string
  ): Promise<void> {
    try {
      // Update application status to REJECTED
      await prisma.application.update({
        where: { id: application.id },
        data: {
          currentStage: 'REJECTED',
          screeningOutcome: 'REJECTED',
          updatedAt: new Date()
        }
      });

      logger.info('Application rejected', {
        applicationId: application.id,
        businessName: application.businessName,
        reason: rejectionReason
      });

      // Send rejection email
      try {
        await EmailNotificationService.sendApplicationRejectedEmail({
          applicantName: application.applicantName,
          applicantEmail: application.applicantEmail,
          businessName: application.businessName,
          applicationId: application.id,
          currentStage: 'REJECTED',
          additionalInfo: {
            rejectionReason
          }
        });

        logger.info('Rejection email sent successfully', {
          applicationId: application.id,
          applicantEmail: application.applicantEmail
        });
      } catch (emailError: any) {
        logger.error('Failed to send rejection email', {
          applicationId: application.id,
          error: emailError.message
        });
        // Don't fail the rejection if email fails
      }
    } catch (error: any) {
      logger.error('Error rejecting application', {
        applicationId: application.id,
        error: error.message
      });
      throw error;
    }
  }
}

