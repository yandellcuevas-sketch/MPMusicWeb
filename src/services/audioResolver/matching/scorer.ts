import type { AudioQuery, CandidateTrack, ResolutionScore } from '../types';

export const PENALTY_TERMS = [
  'cover',
  'remix',
  'instrumental',
  'live',
  'karaoke',
  'tribute',
  'slowed',
  'sped up',
  'nightcore',
  'reverb',
  'edit',
  'mix',
  'mashup',
  'acoustic',
  'piano',
  'parody',
  'backing track',
];

/**
 * Clean YouTube video titles by removing noise tags, resolutions, and standard boilerplate
 */
export function cleanTitle(title: string): string {
  let cleaned = (title || '').toLowerCase();

  // Remove bracketed or parenthesized tags containing standard YouTube annotations
  cleaned = cleaned
    .replace(/\[[^\]]*(?:official|lyric|video|audio|4k|hd|hq|visualizer|clip|release)[^\]]*\]/gi, ' ')
    .replace(/\([^)]*(?:official|lyric|video|audio|4k|hd|hq|visualizer|clip|release)[^)]*\)/gi, ' ')
    .replace(/\|\s*official\s*(?:video|audio|music\s*video)/gi, ' ')
    .replace(/\b(?:feat\.?|ft\.?)\s+[^([-]+/gi, ' ') // normalize features
    .replace(/[^\w\s\u00C0-\u024F]/gi, ' ') // remove special symbols but keep accented characters
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

export function cleanArtist(artist: string): string {
  let cleaned = (artist || '').toLowerCase();

  // Strip common YouTube channel suffixes (e.g., "VEVO", "Official", "Topic", "- Topic")
  cleaned = cleaned
    .replace(/\b(?:vevo|official|channel|music|records|topic)\b/gi, ' ')
    .replace(/[^\w\s\u00C0-\u024F]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Computes Dice bigram coefficient for fuzzy string similarity (0.0 to 1.0)
 */
export function diceSimilarity(a: string, b: string): number {
  const strA = a.toLowerCase().trim();
  const strB = b.toLowerCase().trim();

  if (strA === strB) return 1.0;
  if (!strA || !strB) return 0.0;
  if (strA.length === 1 || strB.length === 1) {
    return strA === strB ? 1.0 : 0.0;
  }

  const getBigrams = (str: string): Map<string, number> => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const bigramsA = getBigrams(strA);
  const bigramsB = getBigrams(strB);

  let intersection = 0;
  for (const [bigram, countA] of bigramsA.entries()) {
    const countB = bigramsB.get(bigram) || 0;
    intersection += Math.min(countA, countB);
  }

  const total = strA.length - 1 + (strB.length - 1);
  return total > 0 ? (2.0 * intersection) / total : 0.0;
}

/**
 * Computes token-level Jaccard overlap similarity
 */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter((t) => t.length > 1));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter((t) => t.length > 1));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0.0;
}

/**
 * Composite string similarity combining character bigrams and word tokens
 */
export function computeStringSimilarity(a: string, b: string): number {
  const dice = diceSimilarity(a, b);
  const token = tokenSimilarity(a, b);
  return dice * 0.6 + token * 0.4;
}

/**
 * Duration similarity score based on absolute time difference
 */
export function computeDurationScore(queryDuration: number, candidateDuration?: number): number {
  if (!queryDuration || !candidateDuration || candidateDuration <= 0) {
    return 0.7;
  }

  const diff = Math.abs(queryDuration - candidateDuration);

  if (diff <= 3) return 1.0;
  if (diff <= 8) return 0.95;
  if (diff <= 15) return 0.85;
  if (diff <= 30) return 0.60;
  if (diff <= 60) return 0.30;
  return 0.0;
}

/**
 * Detects mismatched modifier terms (cover, remix, instrumental, live, etc.)
 */
export function calculatePenalty(queryText: string, candidateText: string): { penalty: number; detectedTerms: string[] } {
  const lowerQuery = queryText.toLowerCase();
  const lowerCandidate = candidateText.toLowerCase();

  const detectedTerms: string[] = [];
  let penalty = 0;

  for (const term of PENALTY_TERMS) {
    const inCandidate = new RegExp(`\\b${term}\\b`, 'i').test(lowerCandidate);
    const inQuery = new RegExp(`\\b${term}\\b`, 'i').test(lowerQuery);

    // If candidate contains the modifier term but the original YouTube track does not
    if (inCandidate && !inQuery) {
      detectedTerms.push(term);
      penalty += 0.35;
    }
  }

  return { penalty, detectedTerms };
}

/**
 * Main confidence scoring evaluator
 * Strict Thresholds:
 * - >= 0.92 -> resolved (AUTO RESOLVED)
 * - 0.80 - 0.919 -> ambiguous (NEEDS REVIEW)
 * - < 0.80 -> unavailable
 */
export function scoreCandidate(query: AudioQuery, candidate: CandidateTrack): ResolutionScore {
  const details: string[] = [];

  const cleanQueryTitle = cleanTitle(query.title);
  const cleanCandTitle = cleanTitle(candidate.title);
  const titleSimilarity = computeStringSimilarity(cleanQueryTitle, cleanCandTitle);

  const cleanQueryArtist = cleanArtist(query.artist);
  const cleanCandArtist = cleanArtist(candidate.artist);
  const artistSimilarity = computeStringSimilarity(cleanQueryArtist, cleanCandArtist);

  const durationScore = computeDurationScore(query.duration, candidate.duration);

  // Check modifier penalty
  const fullQueryText = `${query.title} ${query.artist}`;
  const fullCandText = `${candidate.title} ${candidate.artist}`;
  const { penalty, detectedTerms } = calculatePenalty(fullQueryText, fullCandText);

  if (detectedTerms.length > 0) {
    details.push(`Penalty for unexpected terms: ${detectedTerms.join(', ')} (-${penalty.toFixed(2)})`);
  }

  // Weight distribution: Title (45%), Artist (40%), Duration (15%)
  let baseScore = titleSimilarity * 0.45 + artistSimilarity * 0.40 + durationScore * 0.15;

  // Apply penalty
  let composite = Math.max(0, baseScore - penalty);

  // STRICT RULE 1: Strong artist match required for auto-resolution
  if (artistSimilarity < 0.70 && composite >= 0.80) {
    composite = Math.min(composite, 0.79);
    details.push(`Artist similarity too low (${(artistSimilarity * 100).toFixed(0)}%) - clamped below auto-match threshold`);
  }

  // STRICT RULE 2: If penalty terms exist, max confidence is capped below 0.80
  if (detectedTerms.length > 0 && composite >= 0.80) {
    composite = Math.min(composite, 0.75);
  }

  const compositeConfidence = Math.round(composite * 1000) / 1000;

  let status: ResolutionScore['status'] = 'unavailable';
  if (compositeConfidence >= 0.92) {
    status = 'resolved';
    details.push(`Auto-match approved (confidence ${(compositeConfidence * 100).toFixed(1)}% >= 92%)`);
  } else if (compositeConfidence >= 0.80) {
    status = 'ambiguous';
    details.push(`Review required (confidence ${(compositeConfidence * 100).toFixed(1)}% between 80% and 91.9%)`);
  } else {
    status = 'unavailable';
    details.push(`Confidence too low (${(compositeConfidence * 100).toFixed(1)}% < 80%)`);
  }

  return {
    titleSimilarity,
    artistSimilarity,
    durationScore,
    penaltyScore: penalty,
    compositeConfidence,
    status,
    details,
  };
}
