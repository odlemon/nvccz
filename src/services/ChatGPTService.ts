//@ts-nocheck
import axios from 'axios';
import { logger } from '../utils/logger';
import { ExtractedDocumentContent } from './DocumentTextExtractionService';

/**
 * ChatGPT Service for Application Scoring
 * Uses OpenAI API to analyze application documents and calculate scores
 */
export class ChatGPTService {
  private static readonly API_KEY = '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';
  private static readonly API_URL = 'https://api.openai.com/v1/chat/completions';
  private static readonly MODEL = 'gpt-4o'; // Use GPT-4 for better analysis

  /**
   * Score an investment application based on documents and application data
   * @param applicationData - Application details
   * @param documents - Extracted document content with text summaries
   * @returns Score percentage (0-100)
   */
  static async scoreApplication(
    applicationData: {
      applicantName: string;
      businessName: string;
      businessDescription: string;
      industry: string;
      businessStage: string;
      requestedAmount: number;
      foundingDate?: Date;
      applicantAddress?: string;
    },
    documents: ExtractedDocumentContent[]
  ): Promise<{ score: number; reasoning: string; applicantDetails: any }> {
    try {
      logger.info('🤖 ChatGPT API: Building scoring prompt', {
        businessName: applicationData.businessName,
        documentCount: documents.length
      });

      // Build the prompt for ChatGPT
      const prompt = this.buildScoringPrompt(applicationData, documents);

      logger.info('🤖 ChatGPT API: Sending request to OpenAI', {
        businessName: applicationData.businessName,
        model: this.MODEL,
        promptLength: prompt.length,
        documentCount: documents.length
      });

      const startTime = Date.now();

      // Call ChatGPT API
      const response = await axios.post(
        this.API_URL,
        {
          model: this.MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert investment analyst evaluating startup applications for an investment fund. Analyze the provided documents and application data to calculate a comprehensive score.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent scoring
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.info('🤖 ChatGPT API: Received response', {
        businessName: applicationData.businessName,
        responseTime: `${duration}ms`,
        hasResponse: !!response.data.choices?.[0]?.message?.content
      });

      const aiResponse = response.data.choices[0].message.content;

      logger.info('🤖 ChatGPT API: Raw AI Response', {
        businessName: applicationData.businessName,
        responseLength: aiResponse.length,
        responsePreview: aiResponse.substring(0, 300) + (aiResponse.length > 300 ? '...' : '')
      });
      
      // Parse the AI response to extract score and reasoning
      const parsed = this.parseAIResponse(aiResponse);

      logger.info('✅ ChatGPT API: Parsed response', {
        businessName: applicationData.businessName,
        score: parsed.score,
        reasoningLength: parsed.reasoning.length,
        hasApplicantDetails: !!parsed.applicantDetails,
        applicantDetails: parsed.applicantDetails
      });

      return parsed;
    } catch (error: any) {
      logger.error('❌ ChatGPT API Error', {
        error: error.message,
        errorCode: error.response?.status,
        errorData: error.response?.data,
        businessName: applicationData.businessName,
        stack: error.stack
      });
      
      // Return a default low score if ChatGPT fails
      return {
        score: 0,
        reasoning: `Unable to analyze application due to technical error: ${error.message}`,
        applicantDetails: {}
      };
    }
  }

  /**
   * Build the scoring prompt for ChatGPT
   */
  private static buildScoringPrompt(
    applicationData: any,
    documents: ExtractedDocumentContent[]
  ): string {
    const hashCounts: Record<string, number> = {};
    documents.forEach(doc => {
      if (doc.contentHash) {
        hashCounts[doc.contentHash] = (hashCounts[doc.contentHash] || 0) + 1;
      }
    });

    const documentInfo = documents.map((doc, index) => {
      const header = `### Document ${index + 1}: ${doc.type} - ${doc.fileName}`;
      const meta = doc.extractionError
        ? `Extraction Error: ${doc.extractionError}`
        : [
            `Text Length: ${doc.text.length} characters${doc.truncated ? ' (truncated)' : ''}`,
            doc.contentHash ? `Content Hash: ${doc.contentHash}` : 'Content Hash: N/A',
            doc.contentHash && hashCounts[doc.contentHash] > 1
              ? `Duplicate Documents: ${hashCounts[doc.contentHash]} copies detected`
              : 'Duplicate Documents: none detected'
          ].join(' | ');
      const content = doc.extractionError ? '' : `\n"""${doc.text}"""`;
      return `${header}\n${meta}${content}`;
    }).join('\n\n');

    return `You are evaluating an investment application. Please analyze the provided documents and application data.

**Application Details:**
- Applicant Name: ${applicationData.applicantName}
- Business Name: ${applicationData.businessName}
- Business Description: ${applicationData.businessDescription}
- Industry: ${applicationData.industry}
- Business Stage: ${applicationData.businessStage}
- Requested Amount: $${applicationData.requestedAmount.toLocaleString()}
- Founding Date: ${applicationData.foundingDate || 'Not provided'}
- Location: ${applicationData.applicantAddress || 'Not provided'}

**Documents (extracted text provided below):**

${documentInfo}

**Note:** The text above is extracted directly from the applicant's uploaded documents. If any extraction errors are listed, consider the documents as unavailable and base your assessment on the remaining information.

**Task:**
1. Analyze the application data provided (applicant details, business information, requested amount, etc.)
2. Extract and infer applicant details from the provided information (geographical location, sector, potential demographics if inferable from business name/description)
3. Calculate an Application Score (0-100%) based on weighted criteria:
   - **Requested Budget** (15%): Score based on whether amount is within $20k-$150k band
   - **Innovation** (15%): Level of innovation and uniqueness
   - **Growth Potential** (15%): Market size and scalability potential
   - **Scalability** (15%): Ability to scale the business model
   - **Sustainability** (10%): Long-term viability and sustainability
   - **Proven Concept** (10%): Evidence of concept validation or traction
   - **Business Stage** (10%): Maturity and readiness (IDEA < STARTUP < OPERATIONAL)
   - **Strategic Parameters** (10%): 
     - Geographical location alignment
     - Sector alignment
     - Gender focus (Youth/Women/Male) - prioritize Youth and Women

3. Extract applicant details from documents (especially pitch deck) including:
   - Demographics (gender, age group if mentioned)
   - Location details
   - Any strategic alignment indicators

4. Pay close attention to potential issues:
   - Penalize heavily if documents appear to be identical copies or generic templates with no company-specific information.
   - Penalize if key required documents are missing, corrupted, or contain irrelevant content.
   - Call out duplicate documents explicitly in your reasoning and reflect this in the score.

**Important Rules:**
- If score < 40%: Application should be REJECTED
- If score >= 40%: Application should be SHORTLISTED
- Be lenient and generous in your scoring - give credit for effort and potential
- Consider the strategic parameters (Youth/Women focus gets higher scores)
- Don't be too strict - if there's potential, give it a chance
- Missing some details is okay - focus on what's there and the business potential

**Response Format (JSON only):**
{
  "score": <number between 0-100>,
  "reasoning": "<detailed explanation of the score, including breakdown by criteria>",
  "applicantDetails": {
    "gender": "<if mentioned>",
    "ageGroup": "<if mentioned>",
    "location": "<extracted location details>",
    "sectorAlignment": "<sector alignment notes>",
    "strategicAlignment": "<strategic alignment notes>"
  }
}

**Important:** While the documents are available at the provided Firebase URLs, you should analyze based on the application data provided. For a production system, these documents should be downloaded and text-extracted before analysis. For now, provide the best possible score based on the available application information and typical investment criteria.`;
  }

  /**
   * Parse ChatGPT response to extract score and reasoning
   */
  private static parseAIResponse(response: string): { score: number; reasoning: string; applicantDetails: any } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
          reasoning: parsed.reasoning || 'No reasoning provided',
          applicantDetails: parsed.applicantDetails || {}
        };
      }

      // Fallback: try to extract score from text
      const scoreMatch = response.match(/score[:\s]+(\d+(?:\.\d+)?)/i);
      const score = scoreMatch ? Math.max(0, Math.min(100, Number(scoreMatch[1]))) : 0;

      return {
        score,
        reasoning: response || 'Could not parse reasoning',
        applicantDetails: {}
      };
    } catch (error: any) {
      logger.error('Error parsing ChatGPT response', { error: error.message });
      return {
        score: 0,
        reasoning: 'Error parsing AI response',
        applicantDetails: {}
      };
    }
  }
}

