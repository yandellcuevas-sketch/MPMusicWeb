export interface CuratedTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  sourceUrl: string;
  previewUrl: string;
  downloadUrl: string;
}

export const curatedFreeTracks: CuratedTrack[] = [
  {
    id: 'cf_001',
    title: 'Hope',
    artist: 'Tobu',
    duration: 283,
    sourceUrl: 'https://nocopyrightsounds.co/track/tobu-hope',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: 'cf_002',
    title: 'Spectre',
    artist: 'Alan Walker',
    duration: 226,
    sourceUrl: 'https://nocopyrightsounds.co/track/alan-walker-spectre',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'cf_003',
    title: 'My Heart',
    artist: 'Different Heaven & EH!DE',
    duration: 267,
    sourceUrl: 'https://nocopyrightsounds.co/track/different-heaven-ehide-my-heart',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: 'cf_004',
    title: 'Cielo',
    artist: 'Huma-Huma',
    duration: 134,
    sourceUrl: 'https://archive.org/details/huma-huma-cielo',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: 'cf_005',
    title: 'Synthwave Neon',
    artist: 'Retroforce',
    duration: 302,
    sourceUrl: 'https://archive.org/details/retroforce-synthwave-neon',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
];
