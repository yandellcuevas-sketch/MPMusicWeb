import { BaseAudioProvider } from './baseProvider';
import type { AudioQuery, CandidateTrack } from '../types';
import { cleanTitle, cleanArtist } from '../matching/scorer';

interface ArchiveDoc {
  identifier: string;
  title?: string;
  creator?: string;
  length?: string;
  year?: string;
  licenseurl?: string;
  rights?: string;
}

interface ArchiveFile {
  name: string;
  format?: string;
  length?: string;
  size?: string;
  title?: string;
  creator?: string;
}

export class ArchiveOrgProvider extends BaseAudioProvider {
  name = 'archive_org';

  async search(query: AudioQuery): Promise<CandidateTrack[]> {
    const cleanedTitle = cleanTitle(query.title);
    const cleanedArtist = cleanArtist(query.artist);

    if (!cleanedTitle) return [];

    try {
      // Build targeted query for audio media
      const searchQuery = `mediatype:audio AND (title:(${cleanedTitle}) OR (${cleanedTitle} ${cleanedArtist}))`;
      const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
        searchQuery
      )}&fl[]=identifier,title,creator,length,year,licenseurl,rights&rows=5&output=json`;

      const res = await this.timeoutFetch(searchUrl, {}, 6000);
      if (!res.ok) return [];

      const data = await res.json();
      const docs: ArchiveDoc[] = data.response?.docs || [];

      if (docs.length === 0) return [];

      const candidates: CandidateTrack[] = [];

      // Query metadata for the top matching documents in parallel
      await Promise.all(
        docs.slice(0, 3).map(async (doc) => {
          try {
            const metaUrl = `https://archive.org/metadata/${doc.identifier}`;
            const metaRes = await this.timeoutFetch(metaUrl, {}, 6000);
            if (!metaRes.ok) return;

            const metaData = await metaRes.json();
            const files: ArchiveFile[] = metaData.files || [];

            // Find best audio file (MP3 or FLAC)
            const audioFile = files.find(
              (f) =>
                f.name.toLowerCase().endsWith('.mp3') ||
                f.format === 'VBR MP3' ||
                f.format === 'MP3' ||
                f.name.toLowerCase().endsWith('.flac') ||
                f.format === 'Flac'
            );

            if (!audioFile) return;

            const mediaUrl = `https://archive.org/download/${doc.identifier}/${encodeURIComponent(audioFile.name)}`;

            // Extract duration from file or document
            let duration = 0;
            if (audioFile.length) {
              duration = Math.round(parseFloat(audioFile.length));
            } else if (doc.length) {
              duration = Math.round(parseFloat(doc.length));
            }

            // Determine license status
            const licenseUrl = metaData.metadata?.licenseurl || doc.licenseurl;
            const rights = metaData.metadata?.rights || doc.rights;

            const isVerifiedOpenLicense = Boolean(
              (licenseUrl && licenseUrl.includes('creativecommons.org')) ||
                (rights && /creative\s*commons|public\s*domain|cc-by|cc0/i.test(rights))
            );

            candidates.push({
              provider: this.name,
              providerItemId: doc.identifier,
              title: audioFile.title || doc.title || cleanedTitle,
              artist: audioFile.creator || doc.creator || query.artist,
              duration: duration > 0 ? duration : undefined,
              mediaUrl,
              mediaFormat: audioFile.name.toLowerCase().endsWith('.flac') ? 'flac' : 'mp3',
              mediaSize: audioFile.size ? parseInt(audioFile.size, 10) : undefined,
              license: {
                name: isVerifiedOpenLicense
                  ? 'Creative Commons / Verified Open License'
                  : 'Source available — verify rights',
                url: licenseUrl || `https://archive.org/details/${doc.identifier}`,
                verified: isVerifiedOpenLicense,
              },
            });
          } catch {
            // Ignore single doc failure and proceed
          }
        })
      );

      return candidates;
    } catch {
      return [];
    }
  }
}
