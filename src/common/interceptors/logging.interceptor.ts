import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Logging interceptor that logs all incoming requests and outgoing responses
 * Provides detailed logging for monitoring and debugging purposes
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    
    const { method, url, headers, body, params, query } = request;
    const userAgent = headers['user-agent'] || '';
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    
    // Get user info if available (after authentication)
    const user = (request as any).user;
    const userId = user?.id || 'anonymous';
    const orgId = user?.currentOrganizationId || 'none';

    const startTime = Date.now();

    // Log incoming request
    this.logger.log(`➡️  ${method} ${url}`, {
      method,
      url,
      userId,
      orgId,
      ip,
      userAgent,
      ...(Object.keys(params).length > 0 && { params }),
      ...(Object.keys(query).length > 0 && { query }),
      ...(this.shouldLogBody(method, url) && body && { body }),
    });
    
    console.log('incming; ', {
      method,
      url,
      userId,
      orgId,
      ip,
      userAgent,
      ...(Object.keys(params).length > 0 && { params }),
      ...(Object.keys(query).length > 0 && { query }),
      ...(this.shouldLogBody(method, url) && body && { body }),
    })

    return next.handle().pipe(
      tap({
        next: (data) => {
          console.log('Data from login interceptor', data)
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          
          // Log successful response
          this.logger.log(`⬅️  ${method} ${url} - ${statusCode} - ${duration}ms`, {
            method,
            url,
            statusCode,
            duration,
            userId,
            orgId,
            responseSize: this.getResponseSize(data),
          });
        },
        error: (error) => {
          console.log('Error form login interceptor', error);
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 500;
          
          // Log error response
          this.logger.error(`❌ ${method} ${url} - ${statusCode} - ${duration}ms`, {
            method,
            url,
            statusCode,
            duration,
            userId,
            orgId,
            error: error.message,
            stack: error.stack,
          });
        },
      }),
    );
  }

  /**
   * Determine if request body should be logged
   * Excludes sensitive endpoints and large payloads
   */
  private shouldLogBody(method: string, url: string): boolean {
    // Don't log body for GET requests
    if (method === 'GET') {
      return false;
    }

    // Don't log sensitive endpoints
    const sensitiveEndpoints = [
      '/auth/login',
      '/auth/register',
      '/auth/password',
      '/files/upload',
    ];

    return !sensitiveEndpoints.some(endpoint => url.includes(endpoint));
  }

  /**
   * Get approximate response size for logging
   */
  private getResponseSize(data: unknown): string {
    console.log('Inside Response size');
    try {
      if (!data) return '0B';
      
      const jsonString = JSON.stringify(data);
      const bytes = Buffer.byteLength(jsonString, 'utf8');
      
      if (bytes < 1024) return `${bytes}B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    } catch {
      return 'unknown';
    }
  }
}
