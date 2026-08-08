import { BaseAudioProvider } from './baseProvider';
import type { AudioQuery, CandidateTrack } from '../types';
import { curatedFreeTracks } from '../curatedTracks';

export class CuratedProvider extends BaseAudioProvider {
  name = 'curated_open_catalog';

  async search(query: AudioQuery): Promise<CandidateTrack[]> {
    const cleanQTitle = (query.title || '').toLowerCase().trim();
    const cleanQArtist = (query.artist || '').toLowerCase().trim();

    const matches = curatedFreeTracks.filter((track) => {
      const tTitle = track.title.toLowerCase();
      const tArtist = track.artist.toLowerCase();

      return (
        cleanQTitle.includes(tTitle) ||
        tTitle.includes(cleanQTitle) ||
        (cleanQArtist && (cleanQArtist.includes(tArtist) || tArtist.includes(cleanQArtist)))
      );
    });

    return matches.map((t) => ({
      provider: this.name,
      providerItemId: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      mediaUrl: t.downloadUrl || t.previewUrl || '',
      mediaFormat: 'mp3',
      license: {
        name: 'Creative Commons / NoCopyrightSounds Official Release',
        url: t.sourceUrl,
        verified: true,
      },
    }));
  }
}
