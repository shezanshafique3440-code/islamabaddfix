export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  /** PUBLIC objects may be served without an auth check; PRIVATE never are. */
  isPublic: boolean;
}

export interface StorageDriver {
  readonly name: string;
  isConfigured(): boolean;
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string }>;
  delete(key: string): Promise<void>;
  /**
   * A time-limited direct URL, when the backend supports one. Returning null
   * means the caller must stream the bytes through the authorized API route.
   */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>;
}
