export type ReviewDraft = {
  destinationId: number;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
};

export type UploadAsset = {
  localId: string;
  mimeType: string;
  previewUrl: string;
};

