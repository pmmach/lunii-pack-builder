export interface DownloadResult {
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TrimOptions {
  startSeconds: number;
  endSeconds: number;
}

export interface AudioProcessResult {
  filePath: string;
  durationSeconds: number;
}

export interface ImageCropOptions {
  sourcePath: string;
  outputPath: string;
  size?: number;
  focusX?: number;
  focusY?: number;
}
