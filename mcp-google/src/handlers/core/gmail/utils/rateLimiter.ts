/**
 * Rate limiter with exponential backoff based on Gmail API rate limit headers
 */

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: number;
}

export class GmailRateLimiter {
  private static readonly MIN_DELAY = 100; // 100ms
  private static readonly MAX_DELAY = 60000; // 60s
  private static readonly BACKOFF_MULTIPLIER = 2;
  private static readonly LOW_QUOTA_THRESHOLD = 0.1; // 10% remaining
  
  private currentDelay = GmailRateLimiter.MIN_DELAY;
  private consecutiveErrors = 0;

  /**
   * Extract rate limit info from response headers
   * Headers can be in various cases: x-ratelimit-limit, X-RateLimit-Limit, etc.
   */
  static extractRateLimitInfo(headers: any): RateLimitInfo {
    const info: RateLimitInfo = {};
    
    if (!headers) return info;
    
    // Normalize header access
    const getHeader = (name: string): string | undefined => {
      // Try lowercase first (most common)
      const lowercase = name.toLowerCase();
      if (headers[lowercase]) return headers[lowercase];
      
      // Try exact case
      if (headers[name]) return headers[name];
      
      // Try case-insensitive search
      for (const key in headers) {
        if (key.toLowerCase() === lowercase) {
          return headers[key];
        }
      }
      
      return undefined;
    };
    
    const limit = getHeader('x-ratelimit-limit');
    const remaining = getHeader('x-ratelimit-remaining');
    const reset = getHeader('x-ratelimit-reset');
    
    if (limit) info.limit = parseInt(limit);
    if (remaining) info.remaining = parseInt(remaining);
    if (reset) info.reset = parseInt(reset);
    
    return info;
  }

  /**
   * Calculate delay based on rate limit info and error status
   */
  calculateDelay(rateLimitInfo: RateLimitInfo, isError: boolean = false): number {
    if (isError) {
      this.consecutiveErrors++;
      // Exponential backoff on errors
      this.currentDelay = Math.min(
        this.currentDelay * Math.pow(GmailRateLimiter.BACKOFF_MULTIPLIER, this.consecutiveErrors),
        GmailRateLimiter.MAX_DELAY
      );
      return this.currentDelay;
    }
    
    // Reset on success
    this.consecutiveErrors = 0;
    
    // If we have rate limit info, use it
    if (rateLimitInfo.limit && rateLimitInfo.remaining !== undefined) {
      const quotaUsedRatio = 1 - (rateLimitInfo.remaining / rateLimitInfo.limit);
      
      // If quota is running low, increase delay
      if (quotaUsedRatio > (1 - GmailRateLimiter.LOW_QUOTA_THRESHOLD)) {
        // Scale delay based on how close we are to the limit
        const scaleFactor = 1 + (quotaUsedRatio - 0.9) * 10; // 1x to 2x scaling
        this.currentDelay = Math.min(
          GmailRateLimiter.MIN_DELAY * scaleFactor * 10,
          GmailRateLimiter.MAX_DELAY
        );
      } else {
        // Normal operation
        this.currentDelay = GmailRateLimiter.MIN_DELAY;
      }
    }
    
    return this.currentDelay;
  }

  /**
   * Wait for the calculated delay
   */
  async wait(): Promise<void> {
    if (this.currentDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.currentDelay));
    }
  }

  /**
   * Handle 429 rate limit error with retry-after header
   */
  handle429(retryAfter?: string): number {
    if (retryAfter) {
      // Retry-After can be seconds or HTTP date
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds)) {
        this.currentDelay = seconds * 1000;
      } else {
        // Try parsing as date
        const retryDate = new Date(retryAfter).getTime();
        if (!isNaN(retryDate)) {
          this.currentDelay = Math.max(0, retryDate - Date.now());
        }
      }
    } else {
      // No retry-after, use exponential backoff
      this.consecutiveErrors++;
      this.currentDelay = Math.min(
        1000 * Math.pow(GmailRateLimiter.BACKOFF_MULTIPLIER, this.consecutiveErrors),
        GmailRateLimiter.MAX_DELAY
      );
    }
    
    return this.currentDelay;
  }
}