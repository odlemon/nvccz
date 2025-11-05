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
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        logger.info('Starting shortlisting process', { applicationId, attempt: retryCount + 1 });

        // Fetch application with documents (with timeout handling)
        const application = await Promise.race([
          prisma.application.findUnique({
            where: { id: applicationId },
            include: {
              documents: {
                where: { isSubmitted: true }
              }
            }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), 30000) // 30 second timeout
          )
        ]) as any;

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
      logger.info('🤖 Starting AI Analysis for Application', {
        applicationId,
        businessName: application.businessName,
        applicantEmail: application.applicantEmail,
        requestedAmount: application.requestedAmount,
        documentCount: documentUrls.length,
        documents: documentUrls.map(d => ({ type: d.type, fileName: d.fileName }))
      });

      logger.info('📋 Application Data for AI Analysis', {
        applicationId,
        data: {
          applicantName: applicationData.applicantName,
          businessName: applicationData.businessName,
          businessDescription: applicationData.businessDescription,
          industry: applicationData.industry,
          businessStage: applicationData.businessStage,
          requestedAmount: applicationData.requestedAmount,
          foundingDate: applicationData.foundingDate,
          applicantAddress: applicationData.applicantAddress
        }
      });

      logger.info('📄 Document URLs for AI Analysis', {
        applicationId,
        documentUrls: documentUrls.map(d => ({
          type: d.type,
          fileName: d.fileName,
          url: d.url
        }))
      });

      const scoringResult = await ChatGPTService.scoreApplication(applicationData, documentUrls);

      const score = scoringResult.score;
      const reasoning = scoringResult.reasoning;
      const applicantDetails = scoringResult.applicantDetails;

      logger.info('✅ AI Analysis Complete', {
        applicationId,
        score,
        businessName: application.businessName,
        applicantEmail: application.applicantEmail,
        decision: score >= 50 ? 'SHORTLISTED' : 'REJECTED',
        reasoning: reasoning.substring(0, 200) + (reasoning.length > 200 ? '...' : ''),
        applicantDetails
      });

      logger.info('📊 Detailed AI Scoring Results', {
        applicationId,
        score,
        reasoning,
        applicantDetails,
        breakdown: {
          scoreCategory: score >= 50 ? 'PASS' : 'FAIL',
          threshold: 50,
          margin: score >= 50 ? score - 50 : 50 - score
        }
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
          // Reject the application - pass the score so it's included in the email
          await this.rejectApplication(application, reasoning, score);
        }
        
        // Success - exit retry loop
        return;
      } catch (error: any) {
        retryCount++;
        const isTimeout = error.message?.includes('timeout') || 
                          error.message?.includes('Socket timeout') ||
                          error.code === 'P1008' || // Prisma timeout error code
                          error.code === 'ETIMEDOUT';
        
        if (isTimeout && retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
          logger.warn('Database timeout, retrying shortlisting process', {
            applicationId,
            attempt: retryCount,
            maxRetries,
            delayMs: delay,
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }
        
        // Non-timeout error or max retries reached
        logger.error('Error processing application for shortlisting', {
          applicationId,
          attempt: retryCount,
          error: error.message,
          stack: error.stack,
          isTimeout
        });

        // On error, reject the application to be safe
        try {
          const application = await Promise.race([
            prisma.application.findUnique({
              where: { id: applicationId }
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 10000)
            )
          ]) as any;
          
          if (application && application.currentStage === 'PENDING_SHORTLISTING') {
            await this.rejectApplication(application, 'Technical error during evaluation', 0);
          }
        } catch (rejectError: any) {
          logger.error('Error rejecting application after scoring error', {
            applicationId,
            error: rejectError.message
          });
        }
        
        // Exit retry loop on non-timeout errors or after max retries
        return;
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

      logger.info('✅ Application SHORTLISTED', {
        applicationId: application.id,
        score,
        businessName: application.businessName,
        applicantEmail: application.applicantEmail,
        reasoning: reasoning.substring(0, 200) + (reasoning.length > 200 ? '...' : '')
      });

      // Fetch document URLs for email
      const documentUrls = await prisma.applicationDocument.findMany({
        where: { applicationId: application.id },
        select: {
          documentType: true,
          fileName: true,
          fileUrl: true
        }
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
            reasoning,
            documents: documentUrls.map(doc => ({
              type: doc.documentType,
              fileName: doc.fileName,
              url: doc.fileUrl
            }))
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
    rejectionReason: string,
    score?: number
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

      logger.info('❌ Application REJECTED', {
        applicationId: application.id,
        businessName: application.businessName,
        applicantEmail: application.applicantEmail,
        reason: rejectionReason.substring(0, 200) + (rejectionReason.length > 200 ? '...' : '')
      });

      // Fetch application data with updated score for detailed rejection email
      const updatedApplication = await prisma.application.findUnique({
        where: { id: application.id },
        select: {
          id: true,
          applicantName: true,
          applicantEmail: true,
          businessName: true,
          initialScreeningScore: true
        }
      });

      // Use the score from parameter or from updated application
      const finalScore = score || updatedApplication?.initialScreeningScore || 0;

      logger.info('📧 Preparing to send rejection email', {
        applicationId: application.id,
        applicantEmail: application.applicantEmail,
        score: finalScore,
        hasReasoning: !!rejectionReason
      });

      // Send rejection email with AI reasoning
      try {
        await EmailNotificationService.sendApplicationRejectedEmail({
          applicantName: application.applicantName,
          applicantEmail: application.applicantEmail,
          businessName: application.businessName,
          applicationId: application.id,
          currentStage: 'REJECTED',
          additionalInfo: {
            rejectionReason: rejectionReason,
            score: finalScore,
            aiReasoning: rejectionReason // AI-generated reasoning
          }
        });

        logger.info('✅ Rejection email sent successfully', {
          applicationId: application.id,
          applicantEmail: application.applicantEmail,
          score: finalScore
        });
      } catch (emailError: any) {
        logger.error('❌ Failed to send rejection email', {
          applicationId: application.id,
          applicantEmail: application.applicantEmail,
          error: emailError.message,
          stack: emailError.stack
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

