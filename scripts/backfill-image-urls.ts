import 'dotenv/config';
import { db } from '../server/db';
import { products } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

function toRelative(url?: string | null): string | null {
  if (!url) return url ?? null;
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.pathname;
    }
    return url;
  } catch {
    return url;
  }
}

async function run() {
  const rows = await db.select().from(products);
  let updated = 0;
  for (const p of rows as any[]) {
    const next: any = {};
    const nextImage = toRelative(p.imageUrl);
    if (nextImage !== p.imageUrl) next.imageUrl = nextImage;

    if (Array.isArray(p.photos)) {
      const updatedPhotos = p.photos.map((ph: any) => {
        if (typeof ph === 'string') return toRelative(ph);
        if (ph && typeof ph === 'object') return { ...ph, url: toRelative(ph.url) };
        return ph;
      });
      // Only persist if changed
      if (JSON.stringify(updatedPhotos) !== JSON.stringify(p.photos)) {
        next.photos = updatedPhotos;
      }
    }

    if (Object.keys(next).length > 0) {
      await db.update(products).set(next).where(eq(products.id, p.id));
      updated++;
    }
  }
  console.log(`Backfill complete. Updated ${updated} products.`);
  process.exit(0);
}

run().catch((e) => {
  console.error('Backfill failed', e);
  process.exit(1);
});


