export interface FileValidationOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

export class FileValidator {
  static validate(file: { size: number; mimetype: string }, options: FileValidationOptions): { isValid: boolean; error?: string } {
    if (options.maxSizeBytes && file.size > options.maxSizeBytes) {
      const maxMb = Math.round(options.maxSizeBytes / (1024 * 1024));
      return { isValid: false, error: `File size exceeds the limit of ${maxMb}MB` };
    }

    if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
      const isAllowed = options.allowedMimeTypes.some((type) => {
        if (type.endsWith('/*')) {
          const prefix = type.replace('/*', '');
          return file.mimetype.startsWith(prefix);
        }
        return file.mimetype === type;
      });

      if (!isAllowed) {
        return { isValid: false, error: `File type '${file.mimetype}' is not permitted` };
      }
    }

    return { isValid: true };
  }
}
