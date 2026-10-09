import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import * as crypto from 'crypto';
import * as path from 'path';
import { Model, Types } from 'mongoose';
import { Readable } from 'stream';

import {
  RolePlaySession,
  RolePlaySessionDocument,
} from '@/database/schemas/rolePlaySession.schema';

/**
 * S3 upload options interface
 */
export interface S3UploadOptions {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  organizationId?: string;
  userId?: string;
  isPublic?: boolean;
  expiresIn?: number; // seconds
}

/**
 * Presigned URL response interface
 */
export interface PresignedUrlResponse {
  uploadUrl: string;
  downloadUrl: string;
  storagePath: string;
  expiresAt: Date;
  fields?: Record<string, string>;
}

interface ListFileResult {
  key: string;
  size: number;
  lastModified: Date;
}

interface UploadFileOptions {
  key: string;
  stream: Readable;
  contentType: string;
  contentLength: number;
  metadata?: Record<string, string>;
}

export function buildSpacesMultipartUploadCorsRule(
  allowedOrigins: string[],
  maxAgeSeconds: number,
): {
  AllowedOrigins: string[];
  AllowedMethods: ('GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD')[];
  AllowedHeaders: string[];
  ExposeHeaders: string[];
  MaxAgeSeconds: number;
} {
  return {
    AllowedOrigins: allowedOrigins,
    AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag', 'x-amz-request-id'],
    MaxAgeSeconds: maxAgeSeconds,
  };
}

/**
 * S3 Service
 * Handles all S3 operations including presigned URLs, file uploads, and CDN integration
 * Implements security best practices and performance optimizations
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly cdnDomain?: string;
  private readonly region: string;

  constructor(
    @InjectModel(RolePlaySession.name)
    private readonly rolePlaySessionModel: Model<RolePlaySessionDocument>,
    private readonly configService: ConfigService,
  ) {
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET',
      'volkai-hr-edu-files',
    );
    this.cdnDomain = this.configService.get<string>('AWS_CLOUDFRONT_DOMAIN');

    const endpoint = this.configService.get<string>(
      'AWS_S3_ENDPOINT',
      `https://${this.region}.digitaloceanspaces.com`,
    );

    this.s3Client = new S3Client({
      region: this.region,
      endpoint,
      forcePathStyle: false,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
          '',
        ),
      },
    });

    this.logger.log(
      `S3 Service initialized for bucket: ${this.bucketName} in region: ${this.region}`,
    );
  }

  // Confirms a roleplay session exists before issuing client-upload URLs.
  private async ensureRolePlaySessionExists(sessionId: string): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException(
        'recordingSessionId must be a valid MongoDB ObjectId',
      );
    }

    const exists = await this.rolePlaySessionModel
      .exists({ _id: new Types.ObjectId(sessionId) })
      .exec();

    if (!exists) {
      throw new NotFoundException('Recording session not found');
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private getErrorName(error: unknown): string | undefined {
    return error instanceof Error ? error.name : undefined;
  }

  /**
   * Upload file from stream
   */
  async uploadFileStream(options: UploadFileOptions): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: options.key,
        Body: options.stream,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
        ACL: 'public-read', // or 'public-read' based on your needs
        Metadata: options.metadata || {},
      });

      await this.s3Client.send(command);

      this.logger.log(`File uploaded successfully: ${options.key}`);

      // Return public URL
      return this.getPublicUrl(options.key);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(`Failed to upload file "${options.key}": ${message}`);
      throw new InternalServerErrorException(
        `Failed to upload file to storage: ${message}`,
      );
    }
  }

  /**
   * Delete Multiple Files
   */
  async deleteFiles(files: { key: string }[]): Promise<void> {
    if (!files.length) return;

    try {
      // S3 allows max 1000 objects per delete request
      const BATCH_SIZE = 1000;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);

        const command = new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: batch.map((file) => ({ Key: file.key })),
            Quiet: true,
          },
        });

        await this.s3Client.send(command);

        this.logger.debug(`Deleted ${batch.length} files from S3`);
      }
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(`Failed to delete files: ${message}`);
      throw new InternalServerErrorException(
        `Failed to delete files from storage: ${message}`,
      );
    }
  }

  /**
   * List files with a given prefix
   */
  async listFiles(prefix: string): Promise<ListFileResult[]> {
    try {
      const results: ListFileResult[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const response = await this.s3Client.send(command);

        if (response.Contents) {
          for (const item of response.Contents) {
            results.push({
              key: item.Key!,
              size: item.Size!,
              lastModified: item.LastModified!,
            });
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      this.logger.debug(
        `Listed ${results.length} files with prefix: ${prefix}`,
      );
      return results;
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(
        `Failed to list files with prefix "${prefix}": ${message}`,
      );
      throw new InternalServerErrorException(
        `Failed to list files from storage: ${message}`,
      );
    }
  }

  /**
   * Get file as a readable stream
   */
  async getFileStream(key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      // AWS SDK v3 returns the body as a stream
      if (!response.Body) {
        throw new NotFoundException(`File not found: ${key}`);
      }

      // The Body is already a Readable stream in SDK v3
      return response.Body as Readable;
    } catch (error) {
      if (this.getErrorName(error) === 'NoSuchKey') {
        this.logger.error(`File not found: ${key}`);
        throw new NotFoundException(`File not found: ${key}`);
      }

      const message = this.getErrorMessage(error);
      this.logger.error(`Failed to get file stream for "${key}": ${message}`);
      throw new InternalServerErrorException(
        `Failed to retrieve file from storage: ${message}`,
      );
    }
  }

  /**
   * Public URL for an object key (same pattern as chunk uploads: public-read ACL).
   */
  getPublicUrlForObjectKey(key: string): string {
    return this.getPublicUrl(key);
  }

  /**
   * Start a multipart upload (single final object key).
   */
  async createMultipartUpload(options: {
    key: string;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<{ uploadId: string; key: string; bucket: string }> {
    const { key, contentType, metadata = {} } = options;
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: 'private, max-age=3600',
        Metadata: metadata,
      });
      const out = await this.s3Client.send(command);
      if (!out.UploadId) {
        throw new InternalServerErrorException(
          'CreateMultipartUpload did not return UploadId',
        );
      }
      return { uploadId: out.UploadId, key, bucket: this.bucketName };
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(
        `createMultipartUpload failed for "${key}": ${message}`,
      );
      throw new InternalServerErrorException(
        `Failed to start multipart upload: ${message}`,
      );
    }
  }

  /**
   * Presigned PUT URL for one part of a multipart upload.
   */
  async getPresignedUrlForUploadPart(options: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresIn?: number;
  }): Promise<{ uploadUrl: string; expiresAt: Date }> {
    const { key, uploadId, partNumber, expiresIn = 1800 } = options;
    try {
      const command = new UploadPartCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });
      return {
        uploadUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(`getPresignedUrlForUploadPart failed: ${message}`);
      throw new InternalServerErrorException(
        `Failed to presign upload part: ${message}`,
      );
    }
  }

  /**
   * Complete multipart upload; parts must be sorted by PartNumber ascending.
   */
  async completeMultipartUpload(options: {
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<{ location?: string; key: string }> {
    const { key, uploadId, parts } = options;
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sorted.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      });
      const out = await this.s3Client.send(command);
      return {
        location: out.Location,
        key,
      };
    } catch (error: unknown) {
      const err = error as {
        name?: string;
        message?: string;
        Code?: string;
        $metadata?: { httpStatusCode?: number; requestId?: string };
      };
      const detail = [
        err?.name,
        err?.Code,
        err?.message,
        err?.$metadata?.httpStatusCode != null
          ? `httpStatus=${err.$metadata.httpStatusCode}`
          : '',
        err?.$metadata?.requestId ? `requestId=${err.$metadata.requestId}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      this.logger.error(
        `completeMultipartUpload failed: ${detail}`,
        err?.message,
      );
      throw new InternalServerErrorException(
        `Failed to complete multipart upload: ${err?.message || 'Unknown error'}`,
      );
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
      });
      await this.s3Client.send(command);
      this.logger.log(`Aborted multipart upload for key=${key}`);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(`abortMultipartUpload failed: ${message}`);
      throw new InternalServerErrorException(
        `Failed to abort multipart upload: ${message}`,
      );
    }
  }

  /**
   * Apply bucket CORS on DigitalOcean Spaces (S3 API). Required so browsers can read `ETag`
   * after presigned PUT / multipart part uploads. NestJS `enableCors()` does not affect this hop.
   */
  async putBucketCorsForBrowserMultipartUpload(
    allowedOrigins: string[],
    maxAgeSeconds?: number,
  ): Promise<void> {
    const origins = allowedOrigins.map((o) => o.trim()).filter(Boolean);
    if (!origins.length) {
      throw new BadRequestException(
        'allowedOrigins must include at least one origin (e.g. http://localhost:3000)',
      );
    }
    const parsedMaxAge = parseInt(
      this.configService.get<string>('AWS_S3_CORS_MAX_AGE_SECONDS', '3000'),
      10,
    );
    const maxAgeFromEnv =
      Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 3000;
    const maxAge = maxAgeSeconds ?? maxAgeFromEnv;
    try {
      const command = new PutBucketCorsCommand({
        Bucket: this.bucketName,
        CORSConfiguration: {
          CORSRules: [buildSpacesMultipartUploadCorsRule(origins, maxAge)],
        },
      });
      await this.s3Client.send(command);
      this.logger.log(
        `Bucket CORS applied for ${this.bucketName}; origins=${origins.join(', ')}; ETag exposed`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      this.logger.error(
        `putBucketCorsForBrowserMultipartUpload failed: ${err?.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to set bucket CORS: ${err?.message ?? 'Unknown error'}`,
      );
    }
  }

  /** Read current bucket CORS (verify ExposeHeaders includes ETag). */
  async getBucketCorsConfiguration() {
    try {
      const command = new GetBucketCorsCommand({ Bucket: this.bucketName });
      return await this.s3Client.send(command);
    } catch (error: unknown) {
      const err = error as { message?: string };
      this.logger.error(`getBucketCorsConfiguration failed: ${err?.message}`);
      throw new InternalServerErrorException(
        `Failed to read bucket CORS: ${err?.message ?? 'Unknown error'}`,
      );
    }
  }

  /**
   * Apply CORS using `AWS_S3_CORS_ALLOWED_ORIGINS` from env (comma-separated origins).
   */
  async putBucketCorsFromEnv(): Promise<void> {
    const raw = this.configService.get<string>(
      'AWS_S3_CORS_ALLOWED_ORIGINS',
      '',
    );
    const origins = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await this.putBucketCorsForBrowserMultipartUpload(origins);
  }

  /**
   * Get batch of presigned urls
   */
  async generateBatchPresignedChunkUrls(options: {
    overallAiFeedbackId: string;
    recordingSessionId: string;
    startIndex: number;
    chunkCount: number;
    mimeType: string;
    expiresIn?: number;
  }): Promise<{
    prefix: string;
    urls: Array<{
      chunkIndex: number;
      uploadUrl: string;
      storagePath: string;
      expiresAt: Date;
    }>;
  }> {
    const {
      overallAiFeedbackId,
      recordingSessionId,
      startIndex,
      chunkCount,
      mimeType,
      expiresIn = 1800, // 30 mins (recommended)
    } = options;

    await this.ensureRolePlaySessionExists(recordingSessionId);

    // Basic validation
    if (!mimeType.startsWith('video/')) {
      throw new BadRequestException('Only video chunks are allowed');
    }

    const prefix = `mock_interviews/feedback_${overallAiFeedbackId}/session_${recordingSessionId}`;

    const urls: Array<{
      chunkIndex: number;
      uploadUrl: string;
      storagePath: string;
      expiresAt: Date;
    }> = [];

    for (let i = 0; i < chunkCount; i++) {
      const chunkIndex = startIndex + i;
      const fileName = `chunk_${String(chunkIndex).padStart(4, '0')}.webm`;
      const storagePath = `${prefix}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: storagePath,
        ContentType: mimeType,
        ACL: 'public-read',
        // DO NOT set ContentLength for chunks (size varies)
        CacheControl: 'private, max-age=3600',
        Metadata: {
          'recording-session-id': recordingSessionId,
          'chunk-index': String(chunkIndex),
          'uploaded-at': new Date().toISOString(),
        },
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      urls.push({
        chunkIndex,
        uploadUrl,
        storagePath,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      });
    }

    return {
      prefix,
      urls,
    };
  }

  /**
   * Get batch of presigned urls for Viva Test Recording upload
   */
  async generateBatchPresignedChunkUrlsViva(options: {
    testAttemptId: string;
    recordingSessionId: string;
    startIndex: number;
    chunkCount: number;
    mimeType: string;
    expiresIn?: number;
  }): Promise<{
    prefix: string;
    urls: Array<{
      chunkIndex: number;
      uploadUrl: string;
      storagePath: string;
      expiresAt: Date;
    }>;
  }> {
    const {
      testAttemptId,
      recordingSessionId,
      startIndex,
      chunkCount,
      mimeType,
      expiresIn = 1800, // 30 mins (recommended)
    } = options;

    await this.ensureRolePlaySessionExists(recordingSessionId);

    // Basic validation
    if (!mimeType.startsWith('video/')) {
      throw new BadRequestException('Only video chunks are allowed');
    }

    const prefix = `viva_test/attempt_${testAttemptId}/session_${recordingSessionId}`;

    const urls: Array<{
      chunkIndex: number;
      uploadUrl: string;
      storagePath: string;
      expiresAt: Date;
    }> = [];

    for (let i = 0; i < chunkCount; i++) {
      const chunkIndex = startIndex + i;
      const fileName = `chunk_${String(chunkIndex).padStart(4, '0')}.webm`;
      const storagePath = `${prefix}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: storagePath,
        ContentType: mimeType,
        ACL: 'public-read',
        // DO NOT set ContentLength for chunks (size varies)
        CacheControl: 'private, max-age=3600',
        Metadata: {
          'recording-session-id': recordingSessionId,
          'chunk-index': String(chunkIndex),
          'uploaded-at': new Date().toISOString(),
        },
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      urls.push({
        chunkIndex,
        uploadUrl,
        storagePath,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      });
    }

    return {
      prefix,
      urls,
    };
  }

  /**
   * Upload file directly to S3
   */
  async uploadFile(
    buffer: Buffer,
    options: S3UploadOptions,
    downloadOnClick: boolean = false,
  ): Promise<{ storagePath: string; publicUrl?: string; cdnUrl?: string }> {
    const {
      filename,
      mimeType,
      organizationId,
      userId,
      isPublic = false,
    } = options;

    try {
      const storagePath = this.generateStoragePath(
        filename,
        organizationId,
        userId,
      );

      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: storagePath,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            'original-filename': filename,
            'uploaded-by': userId || 'anonymous',
            'organization-id': organizationId || 'none',
            'upload-timestamp': new Date().toISOString(),
          },
          ...(isPublic && {
            ACL: 'public-read',
          }),
          ContentDisposition: downloadOnClick
            ? `attachment; filename="${filename}"`
            : `inline; filename="${filename}"`,
          CacheControl: isPublic
            ? 'public, max-age=31536000'
            : 'private, max-age=3600',
        },
      });

      await upload.done();

      const publicUrl = isPublic ? this.getPublicUrl(storagePath) : undefined;
      const cdnUrl =
        isPublic && this.cdnDomain ? this.getCdnUrl(storagePath) : undefined;

      this.logger.log(
        `Successfully uploaded file: ${filename} to ${storagePath}`,
      );

      return {
        storagePath,
        publicUrl,
        cdnUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Upload file directly with storage path as argument to S3
   */
  async uploadFileWithStoragePath(
    buffer: Buffer,
    options: S3UploadOptions,
    storagePath: string,
  ): Promise<{ storagePath: string; publicUrl?: string; cdnUrl?: string }> {
    const {
      filename,
      mimeType,
      organizationId,
      userId,
      isPublic = false,
    } = options;

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: storagePath,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            'original-filename': filename,
            'uploaded-by': userId || 'anonymous',
            'organization-id': organizationId || 'none',
            'upload-timestamp': new Date().toISOString(),
          },
          ...(isPublic && {
            ACL: 'public-read',
          }),
          ContentDisposition: `inline; filename="${filename}"`,
          CacheControl: isPublic
            ? 'public, max-age=31536000'
            : 'private, max-age=3600',
        },
      });

      await upload.done();

      const publicUrl = isPublic ? this.getPublicUrl(storagePath) : undefined;
      const cdnUrl =
        isPublic && this.cdnDomain ? this.getCdnUrl(storagePath) : undefined;

      this.logger.log(
        `Successfully uploaded file: ${filename} to ${storagePath}`,
      );

      return {
        storagePath,
        publicUrl,
        cdnUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Generate presigned URL for file upload
   * Implements secure upload with size limits and content type validation
   */
  async generatePresignedUploadUrl(
    options: S3UploadOptions,
  ): Promise<PresignedUrlResponse> {
    const {
      filename,
      mimeType,
      sizeBytes,
      organizationId,
      userId,
      isPublic = false,
      expiresIn = 3600, // 1 hour default
    } = options;

    try {
      // Generate unique storage path
      const storagePath = this.generateStoragePath(
        filename,
        organizationId,
        userId,
      );

      // Validate file size (max 100MB for regular files, 500MB for videos)
      const maxSize = mimeType.startsWith('video/')
        ? 500 * 1024 * 1024
        : 100 * 1024 * 1024;
      if (sizeBytes > maxSize) {
        throw new Error(
          `File size ${sizeBytes} exceeds maximum allowed size ${maxSize}`,
        );
      }

      // Validate MIME type
      this.validateMimeType(mimeType);

      // Create put object command
      const putObjectCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: storagePath,
        ContentType: mimeType,
        ContentLength: sizeBytes,
        Metadata: {
          'original-filename': filename,
          'uploaded-by': userId || 'anonymous',
          'organization-id': organizationId || 'none',
          'upload-timestamp': new Date().toISOString(),
        },
        ...(isPublic && {
          ACL: 'public-read',
        }),
        // Add content disposition for better download experience
        ContentDisposition: `attachment; filename="${filename}"`,
        // Add cache control for performance
        CacheControl: isPublic
          ? 'public, max-age=31536000'
          : 'private, max-age=3600',
      });

      // Generate presigned upload URL
      const uploadUrl = await getSignedUrl(this.s3Client, putObjectCommand, {
        expiresIn,
      });

      // Generate download URL
      const downloadUrl = this.getDownloadUrl(storagePath, isPublic);

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      this.logger.log(
        `Generated presigned upload URL for: ${filename} at path: ${storagePath}`,
      );

      return {
        uploadUrl,
        downloadUrl,
        storagePath,
        expiresAt,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for ${filename}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Generate presigned URL for file download
   */
  async generatePresignedDownloadUrl(
    storagePath: string,
    expiresIn: number = 3600,
    filename?: string,
  ): Promise<string> {
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: storagePath,
        ...(filename && {
          ResponseContentDisposition: `attachment; filename="${filename}"`,
        }),
      });

      const downloadUrl = await getSignedUrl(this.s3Client, getObjectCommand, {
        expiresIn,
      });

      this.logger.log(`Generated presigned download URL for: ${storagePath}`);
      return downloadUrl;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned download URL for ${storagePath}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Extract storagePath from url
   */

  extractStoragePath(publicUrl: string): string {
    const url = new URL(publicUrl);
    return url.pathname.replace(/^\//, ''); // Remove leading slash
  }

  /**
   * Resolve the object key for a URL that actually points at this bucket or its
   * CDN, or `null` when the URL belongs to somewhere else (e.g. an avatar
   * hosted by a third party). Callers use this before deleting so a stored URL
   * from an external source can never remove an unrelated object.
   */
  extractOwnedStoragePath(url: string): string | null {
    try {
      const { hostname, pathname } = new URL(url);
      const ownedHosts = [
        `${this.bucketName}.${this.region}.digitaloceanspaces.com`,
        ...(this.cdnDomain ? [this.cdnDomain] : []),
      ];

      if (!ownedHosts.includes(hostname)) {
        return null;
      }

      const key = decodeURIComponent(pathname.replace(/^\//, ''));
      return key || null;
    } catch {
      return null;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(storagePath: string): Promise<void> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: storagePath,
      });

      await this.s3Client.send(deleteCommand);
      this.logger.log(`Successfully deleted file: ${storagePath}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${storagePath}:`, error);
      throw error;
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(storagePath: string): Promise<boolean> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storagePath,
      });

      await this.s3Client.send(headCommand);
      return true;
    } catch (error) {
      if (this.getErrorName(error) === 'NotFound') {
        return false;
      }
      this.logger.error(`Error checking file existence ${storagePath}:`, error);
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(storagePath: string): Promise<{
    contentType: string;
    contentLength: number;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storagePath,
      });

      const response = await this.s3Client.send(headCommand);

      return {
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        metadata: response.Metadata || {},
      };
    } catch (error) {
      this.logger.error(`Failed to get file metadata ${storagePath}:`, error);
      throw error;
    }
  }

  /**
   * Copy file within S3
   */
  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    try {
      const copyCommand = new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: destinationPath,
        CopySource: `${this.bucketName}/${sourcePath}`,
      });

      await this.s3Client.send(copyCommand);
      this.logger.log(
        `Successfully copied file from ${sourcePath} to ${destinationPath}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to copy file from ${sourcePath} to ${destinationPath}:`,
        error,
      );
      throw error;
    }
  }

  // helper methods

  /**
   * Generate storage path for subject material file
   */
  generateSubjectMaterialPath(file: any, organizationId: string): string {
    return `volkai-college/organizationId_${organizationId}/${file.originalname}`;
  }

  /**
   * Generate unique storage path for file
   */
  private generateStoragePath(
    filename: string,
    organizationId?: string,
    userId?: string,
  ): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const randomId = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(filename);
    const baseName = path.basename(filename, extension);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');

    let pathPrefix = 'volkai-college/files';

    if (organizationId) {
      pathPrefix = `volkai-college/organizations/${organizationId}`;
    } else if (userId) {
      pathPrefix = `volkai-college/users/${userId}`;
    }

    return `${pathPrefix}/${timestamp}/${randomId}_${sanitizedBaseName}${extension}`;
  }

  /**
   * Get public URL for file
   */
  private getPublicUrl(storagePath: string): string {
    return `https://${this.bucketName}.${this.region}.digitaloceanspaces.com/${storagePath}`;
  }

  /**
   * Get CDN URL for file
   */
  private getCdnUrl(storagePath: string): string {
    if (!this.cdnDomain) {
      return this.getPublicUrl(storagePath);
    }
    return `https://${this.cdnDomain}/${storagePath}`;
  }

  /**
   * Get download URL (public or CDN)
   */
  private getDownloadUrl(storagePath: string, isPublic: boolean): string {
    if (isPublic) {
      return this.cdnDomain
        ? this.getCdnUrl(storagePath)
        : this.getPublicUrl(storagePath);
    }
    // For private files, return a placeholder that will be replaced with presigned URL
    return `private://${storagePath}`;
  }

  /**
   * Validate MIME type against allowed types
   */
  private validateMimeType(mimeType: string): void {
    const allowedTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',

      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/json',
      'application/xml',

      // Archives
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip',

      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4',
      'audio/webm',

      // Video
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/avi',
      'video/quicktime',
      'video/x-msvideo',
    ];

    if (!allowedTypes.includes(mimeType)) {
      throw new Error(`MIME type ${mimeType} is not allowed`);
    }
  }
}
