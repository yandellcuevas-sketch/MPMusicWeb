export interface SearchResult {
  id: string;
  source: 'youtube' | 'direct' | 'local';
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration: number; // in seconds
  sourceUrl: string;
  previewUrl?: string; // direct audio streamable URL
  downloadUrl?: string; // direct media download URL (for legal processing)
  allowProcessing: boolean;
}

/**
 * Parses ISO 8601 duration format (e.g. PT4M21S, PT1H2M30S) into seconds.
 */
export function parseISO8601Duration(durationStr: string): number {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = durationStr.match(regex);
  if (!matches) return 0;
  
  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

// A collection of copyright-free, directly streamable & downloadable tracks (Legal, CC Licensed)
// allows testing the search -> preview -> add to cart -> convert -> edit metadata -> USB export flow.
export const curatedFreeTracks: SearchResult[] = [
  {
    id: 'cf_001',
    source: 'direct',
    title: 'Hope',
    artist: 'Tobu',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=60',
    duration: 283, // 4:43
    sourceUrl: 'https://nocopyrightsounds.co/track/tobu-hope',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // high-quality placeholder preview
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    allowProcessing: true
  },
  {
    id: 'cf_002',
    source: 'direct',
    title: 'Spectre',
    artist: 'Alan Walker',
    thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=60',
    duration: 226, // 3:46
    sourceUrl: 'https://nocopyrightsounds.co/track/alan-walker-spectre',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    allowProcessing: true
  },
  {
    id: 'cf_003',
    source: 'direct',
    title: 'My Heart',
    artist: 'Different Heaven & EH!DE',
    thumbnailUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=60',
    duration: 267, // 4:27
    sourceUrl: 'https://nocopyrightsounds.co/track/different-heaven-ehide-my-heart',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    allowProcessing: true
  },
  {
    id: 'cf_004',
    source: 'direct',
    title: 'Cielo',
    artist: 'Huma-Huma',
    thumbnailUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=300&auto=format&fit=crop&q=60',
    duration: 134, // 2:14
    sourceUrl: 'https://archive.org/details/huma-huma-cielo',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    allowProcessing: true
  },
  {
    id: 'cf_005',
    source: 'direct',
    title: 'Synthwave Neon',
    artist: 'Retroforce',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=60',
    duration: 302, // 5:02
    sourceUrl: 'https://archive.org/details/retroforce-synthwave-neon',
    previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    allowProcessing: true
  }
];

export class YoutubeService {
  /**
   * Search for tracks. Searches YouTube API if key is present,
   * otherwise filters and returns the curated catalog.
   */
  async search(query: string, apiKey?: string): Promise<SearchResult[]> {
    const cleanQuery = query.toLowerCase().trim();
    
    // Filter local curated database first
    const curatedMatches = curatedFreeTracks.filter(
      (track) =>
        track.title.toLowerCase().includes(cleanQuery) ||
        track.artist.toLowerCase().includes(cleanQuery)
    );

    // If query is empty, return all curated tracks as recommendations
    if (!cleanQuery) {
      return curatedFreeTracks;
    }

    if (!apiKey) {
      return curatedMatches;
    }

    try {
      // 1. Fetch search results from YouTube API
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(
        query
      )}&type=video&key=${apiKey}`;
      
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        throw new Error(`YouTube API Search error: ${searchRes.statusText}`);
      }
      
      const searchData = await searchRes.json();
      const items = searchData.items || [];
      if (items.length === 0) {
        return curatedMatches;
      }

      const videoIds = items.map((item: any) => item.id.videoId).filter(Boolean).join(',');

      // 2. Fetch contentDetails to retrieve exact video durations
      const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      if (!detailsRes.ok) {
        throw new Error(`YouTube API Details error: ${detailsRes.statusText}`);
      }
      
      const detailsData = await detailsRes.json();
      const videoDetails = detailsData.items || [];

      const youtubeResults: SearchResult[] = videoDetails.map((video: any) => {
        const durationStr = video.contentDetails?.duration || 'PT0S';
        const duration = parseISO8601Duration(durationStr);
        
        return {
          id: video.id,
          source: 'youtube',
          title: video.snippet?.title || 'Unknown Video',
          artist: video.snippet?.channelTitle || 'Unknown Channel',
          thumbnailUrl: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || '',
          duration,
          sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
          previewUrl: '', // No direct audio stream available natively due to TOS, can play embedded iframe
          allowProcessing: false // YouTube items are preview-only unless linked to local file or direct link
        };
      });

      // Combine matches
      return [...curatedMatches, ...youtubeResults];
    } catch (error) {
      console.error('YouTube Search API failed, falling back to curated list:', error);
      return curatedMatches;
    }
  }

  /**
   * Resolve info from a single pasted URL (YouTube or Direct Audio).
   */
  async resolveUrl(url: string, apiKey?: string): Promise<SearchResult | null> {
    const cleanUrl = url.trim();
    
    // Check if it's a YouTube URL
    const ytMatch = cleanUrl.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );

    if (ytMatch && ytMatch[1]) {
      const videoId = ytMatch[1];
      if (!apiKey) {
        return {
          id: videoId,
          source: 'youtube',
          title: `YouTube Video (${videoId})`,
          artist: 'YouTube Link',
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          duration: 0,
          sourceUrl: cleanUrl,
          allowProcessing: false
        };
      }

      try {
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoId}&key=${apiKey}`;
        const res = await fetch(detailsUrl);
        if (res.ok) {
          const data = await res.json();
          const video = data.items?.[0];
          if (video) {
            const duration = parseISO8601Duration(video.contentDetails?.duration || 'PT0S');
            return {
              id: videoId,
              source: 'youtube',
              title: video.snippet?.title || 'Unknown Video',
              artist: video.snippet?.channelTitle || 'Unknown Channel',
              thumbnailUrl: video.snippet?.thumbnails?.medium?.url || '',
              duration,
              sourceUrl: cleanUrl,
              allowProcessing: false
            };
          }
        }
      } catch (err) {
        console.error('Failed to resolve YouTube URL info:', err);
      }
      
      // Fallback YouTube metadata
      return {
        id: videoId,
        source: 'youtube',
        title: `YouTube Video`,
        artist: 'YouTube',
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        duration: 0,
        sourceUrl: cleanUrl,
        allowProcessing: false
      };
    }

    // Otherwise treat as a direct audio URL if it ends with extensions or looks like a direct link
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      const filename = cleanUrl.split('/').pop()?.split('?')[0] || 'direct_link';
      const cleanName = filename.replace(/\.[^/.]+$/, '');
      const extension = filename.split('.').pop()?.toLowerCase() || '';
      
      const isAudio = ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'].includes(extension);

      return {
        id: `direct_${Math.random().toString(36).substring(7)}`,
        source: 'direct',
        title: cleanName,
        artist: 'Direct Stream',
        thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=60',
        duration: 0, // Will be fetched via Audio element during playback/loading
        sourceUrl: cleanUrl,
        previewUrl: cleanUrl,
        downloadUrl: isAudio ? cleanUrl : undefined,
        allowProcessing: isAudio
      };
    }

    return null;
  }
}

export const youtubeService = new YoutubeService();
