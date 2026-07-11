// Клиентское сжатие изображений (аватары) перед загрузкой в Supabase Storage.
// Уменьшаем до квадрата maxSize×maxSize (обрезка по центру — «cover»), кодируем
// в WebP (если браузер умеет), иначе в JPEG. Это резко снижает вес файла в БД/
// хранилище: исходное фото на несколько МБ превращается в ~20–60 КБ.

export interface CompressOptions {
  /** Максимальная сторона результата, px. По умолчанию 512. */
  maxSize?: number;
  /** Качество кодирования 0..1. По умолчанию 0.85. */
  quality?: number;
}

/** Загружает File в HTMLImageElement (через object URL, с гарантированным revoke). */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
    img.src = url;
  });
}

/** canvas.toBlob как промис (null → ошибка). */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * Сжимает изображение до квадрата и возвращает готовый к загрузке File.
 * Если по какой-то причине сжать не удалось — возвращает исходный файл
 * (загрузка не должна падать из-за сжатия).
 */
export async function compressAvatar(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxSize = opts.maxSize ?? 512;
  const quality = opts.quality ?? 0.85;

  try {
    const img = await loadImage(file);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) return file;

    // Квадратная обрезка по центру (cover) + даунскейл до maxSize.
    const side = Math.min(sw, sh);
    const sx = (sw - side) / 2;
    const sy = (sh - side) / 2;
    const target = Math.min(maxSize, side);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

    // Пробуем WebP, затем JPEG.
    let type = 'image/webp';
    let blob = await canvasToBlob(canvas, type, quality);
    if (!blob || blob.type !== 'image/webp') {
      type = 'image/jpeg';
      blob = await canvasToBlob(canvas, type, quality);
    }
    if (!blob) return file;

    // Если вдруг результат тяжелее оригинала — оставляем оригинал.
    if (blob.size >= file.size && file.size > 0) return file;

    const ext = type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `avatar.${ext}`, { type });
  } catch {
    return file;
  }
}
