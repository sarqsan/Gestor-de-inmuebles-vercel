/**
 * Compresses an image file (JPEG, PNG, WebP) using HTML Canvas.
 * Keeps resolution high enough for OCR / document verification (max 1400px),
 * but reduces file size to ~40KB-120KB so that base64 / uploads are instantaneous
 * and never exceed Firestore limits.
 */
export async function compressImageForUpload(file: File, maxWidth = 1100, maxHeight = 1100, quality = 0.65): Promise<{
  blob: Blob;
  dataUrl: string;
  sizeBytes: number;
}> {
  // If not an image, return original
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = (reader.result as string) || '';
        resolve({
          blob: file,
          dataUrl,
          sizeBytes: file.size,
        });
      };
      reader.onerror = () => {
        resolve({
          blob: file,
          dataUrl: '',
          sizeBytes: file.size,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          const rawData = (e.target?.result as string) || '';
          resolve({ blob: file, dataUrl: rawData, sizeBytes: file.size });
          return;
        }

        // Draw image
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = file.type === 'image/png' ? 'image/jpeg' : file.type;
        const dataUrl = canvas.toDataURL(mimeType, quality);

        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob) {
              resolve({
                blob: compressedBlob,
                dataUrl,
                sizeBytes: compressedBlob.size,
              });
            } else {
              const rawData = (e.target?.result as string) || '';
              resolve({ blob: file, dataUrl: rawData, sizeBytes: file.size });
            }
          },
          mimeType,
          quality
        );
      };
      img.onerror = () => {
        const rawData = (e.target?.result as string) || '';
        resolve({ blob: file, dataUrl: rawData, sizeBytes: file.size });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      resolve({ blob: file, dataUrl: '', sizeBytes: file.size });
    };
    reader.readAsDataURL(file);
  });
}
