export type Image = {
  sha256: string;
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
  createdAt: Date;
};

/** Everything but the bytes - for callers that only need dimensions/mime, not the blob itself. */
export type ImageMeta = Omit<Image, "bytes">;
