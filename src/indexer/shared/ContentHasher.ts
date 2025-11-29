import * as crypto from 'crypto';

/**
 * Content hashing utility.
 * Extracts hash computation from IndexerService.
 */

/**
 * Generate SHA-256 hash of text content.
 */
export function hashContent(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Generate hash from buffer.
 */
export function hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}
