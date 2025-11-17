/**
 * Utility functions for converting period filters (month/quarter/year) to date ranges
 */

export type PeriodType = 'month' | 'quarter' | 'year';

export interface PeriodFilter {
  periodType: PeriodType;
  periodValue: string; // Format: "2025-01" for month, "2025-Q1" for quarter, "2025" for year
  currencyId?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Parse period value and convert to date range
 * @param periodType - Type of period: 'month', 'quarter', or 'year'
 * @param periodValue - Period value in format:
 *   - Month: "2025-01" (YYYY-MM)
 *   - Quarter: "2025-Q1" or "2025-1" (YYYY-QN or YYYY-N)
 *   - Year: "2025" (YYYY)
 * @returns Date range with startDate (00:00:00) and endDate (23:59:59)
 */
export function parsePeriodToDateRange(periodType: PeriodType, periodValue: string): DateRange {
  let startDate: Date;
  let endDate: Date;

  switch (periodType) {
    case 'month': {
      // Format: "2025-01" (YYYY-MM)
      const match = periodValue.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        throw new Error(`Invalid month format. Expected YYYY-MM, got: ${periodValue}`);
      }
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      
      if (month < 1 || month > 12) {
        throw new Error(`Invalid month. Must be between 01-12, got: ${month}`);
      }

      startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      // Get last day of month
      endDate = new Date(year, month, 0, 23, 59, 59, 999);
      break;
    }

    case 'quarter': {
      // Format: "2025-Q1" or "2025-1" (YYYY-QN or YYYY-N)
      const match = periodValue.match(/^(\d{4})-(?:Q)?(\d)$/);
      if (!match) {
        throw new Error(`Invalid quarter format. Expected YYYY-Q1 or YYYY-1, got: ${periodValue}`);
      }
      const year = parseInt(match[1], 10);
      const quarter = parseInt(match[2], 10);
      
      if (quarter < 1 || quarter > 4) {
        throw new Error(`Invalid quarter. Must be between 1-4, got: ${quarter}`);
      }

      // Calculate start month (Q1=Jan, Q2=Apr, Q3=Jul, Q4=Oct)
      const startMonth = (quarter - 1) * 3;
      startDate = new Date(year, startMonth, 1, 0, 0, 0, 0);
      
      // Calculate end month (Q1=Mar, Q2=Jun, Q3=Sep, Q4=Dec)
      const endMonth = startMonth + 2;
      endDate = new Date(year, endMonth + 1, 0, 23, 59, 59, 999);
      break;
    }

    case 'year': {
      // Format: "2025" (YYYY)
      const match = periodValue.match(/^(\d{4})$/);
      if (!match) {
        throw new Error(`Invalid year format. Expected YYYY, got: ${periodValue}`);
      }
      const year = parseInt(match[1], 10);
      
      startDate = new Date(year, 0, 1, 0, 0, 0, 0); // January 1
      endDate = new Date(year, 11, 31, 23, 59, 59, 999); // December 31
      break;
    }

    default:
      throw new Error(`Invalid period type: ${periodType}. Must be 'month', 'quarter', or 'year'`);
  }

  return { startDate, endDate };
}

/**
 * Extract period filter from request (supports both query params and body)
 * @param req - Express request object
 * @returns PeriodFilter or null if not provided
 */
export function extractPeriodFilter(req: any): PeriodFilter | null {
  // Try query params first (for GET requests)
  const periodType = (req.query?.periodType || req.body?.periodType) as PeriodType | undefined;
  const periodValue = (req.query?.periodValue || req.body?.periodValue) as string | undefined;
  const currencyId = (req.query?.currencyId || req.body?.currencyId) as string | undefined;

  if (!periodType || !periodValue) {
    return null;
  }

  if (!['month', 'quarter', 'year'].includes(periodType)) {
    throw new Error(`Invalid periodType: ${periodType}. Must be 'month', 'quarter', or 'year'`);
  }

  return {
    periodType: periodType as PeriodType,
    periodValue,
    currencyId
  };
}

/**
 * Convert period filter to date range for use in services
 * @param periodFilter - Period filter object
 * @returns DateRange with startDate and endDate
 */
export function periodFilterToDateRange(periodFilter: PeriodFilter): DateRange & { currencyId?: string } {
  const { startDate, endDate } = parsePeriodToDateRange(periodFilter.periodType, periodFilter.periodValue);
  return {
    startDate,
    endDate,
    currencyId: periodFilter.currencyId
  };
}

