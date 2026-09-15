import { Inmueble, InmuebleImage } from '../types';

/**
 * Gets the primary cover image URL for a property.
 * Prefers an image marked as isCover=true. Falls back to the first available image or default placeholder.
 */
export function getInmuebleCoverUrl(inmueble?: Inmueble | null): string {
  const defaultFallback =
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80';

  if (!inmueble) return defaultFallback;

  if (inmueble.images && inmueble.images.length > 0) {
    const coverImage = inmueble.images.find((img) => img.isCover);
    if (coverImage) return coverImage.downloadURL;

    const sorted = [...inmueble.images].sort((a, b) => a.order - b.order);
    if (sorted.length > 0 && sorted[0].downloadURL) {
      return sorted[0].downloadURL;
    }
  }

  return inmueble.imagenUrl || defaultFallback;
}

/**
 * Retrieves the public images list for an inmueble to show in public candidate portals.
 */
export function getInmueblePublicImages(inmueble?: Inmueble | null): InmuebleImage[] {
  const defaultFallback =
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80';

  if (!inmueble) {
    return [
      {
        id: 'fallback-0',
        storagePath: '',
        downloadURL: defaultFallback,
        order: 0,
        isCover: true,
        isPublic: true,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  if (inmueble.images && inmueble.images.length > 0) {
    const publicList = inmueble.images.filter((img) => img.isPublic !== false);
    if (publicList.length > 0) {
      return [...publicList].sort((a, b) => {
        if (a.isCover) return -1;
        if (b.isCover) return 1;
        return a.order - b.order;
      });
    }
  }

  return [
    {
      id: 'fallback-0',
      storagePath: '',
      downloadURL: inmueble.imagenUrl || defaultFallback,
      order: 0,
      isCover: true,
      isPublic: true,
      createdAt: new Date().toISOString(),
    },
  ];
}
