export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export function isValidImageFile(file: File): boolean {
  if (!file) return false;
  const extension = '.' + (file.name.split('.').pop() || '').toLowerCase();
  const mimeType = (file.type || '').toLowerCase();
  return (
    ALLOWED_IMAGE_TYPES.includes(mimeType) ||
    ALLOWED_EXTENSIONS.includes(extension) ||
    mimeType.startsWith('image/')
  );
}

/**
 * Ultra-fast client side image compressor.
 * Downscales images to lightweight, web-optimized size (max 1200x900 @ 0.70 quality),
 * resulting in 30KB - 50KB files that load instantly.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = { maxWidth: 1200, maxHeight: 900, quality: 0.70 }
): Promise<Blob> {
  if (!file) return file;

  const { maxWidth = 1200, maxHeight = 900, quality = 0.70 } = options;

  const compressionWork = new Promise<Blob>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let width = img.width || 1200;
        let height = img.height || 900;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size > 0) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        console.warn('Canvas compression error, using original file:', err);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });

  // Strict 1.5s timeout on compression so it NEVER hangs
  const timeoutGuard = new Promise<Blob>((resolve) => {
    setTimeout(() => resolve(file), 1500);
  });

  return Promise.race([compressionWork, timeoutGuard]);
}

/**
 * Converts a file or Blob to a lightweight Data URL string.
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}
