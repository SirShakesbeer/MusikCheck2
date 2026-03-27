import { api } from './api';
import type { LocalSource } from './mediaSourceController';
import type { IndexedTrackState } from '../types';

export type LocalTeam = {
  id: string;
  name: string;
  score: number;
};

export type LocalSong = {
  title: string;
  artist: string;
  sourceType: 'local' | 'youtube' | 'spotify';
  sourceValue: string;
  snippetUrl: string;
  durationSeconds?: number;
  spotifyTrackId?: string;
};

function mapTrackToSong(track: IndexedTrackState, apiBase: string): LocalSong {
  return {
    title: track.title,
    artist: track.artist,
    sourceType:
      track.provider_key === 'youtube_playlist'
        ? 'youtube'
        : track.provider_key === 'spotify_playlist'
          ? 'spotify'
          : 'local',
    sourceValue: track.source_value,
    snippetUrl: track.playback_url.startsWith('http') ? track.playback_url : `${apiBase}${track.playback_url}`,
    durationSeconds: typeof track.duration_seconds === 'number' ? track.duration_seconds : undefined,
    spotifyTrackId: track.provider_key === 'spotify_playlist' ? track.file_path : undefined,
  };
}

export async function buildSongsForLocalGame(params: {
  runtimeTestMode: boolean;
  localSources: LocalSource[];
  mockSongs: LocalSong[];
  apiBase: string;
}): Promise<LocalSong[]> {
  if (params.runtimeTestMode) {
    return params.mockSongs;
  }

  if (params.localSources.length < 1) {
    throw new Error('Please add at least one source before starting in non-test mode.');
  }

  const sourceIds = params.localSources.map((source) => source.backendSourceId).filter(Boolean) as string[];
  const result = await api.getIndexedTracks(sourceIds);
  const dynamicSongs = result.data.tracks.map((track) => mapTrackToSong(track, params.apiBase));

  if (dynamicSongs.length < 1) {
    throw new Error('No indexed tracks found. Add a source and sync/index before starting.');
  }

  return dynamicSongs;
}

export function buildTeams(setupTeams: string): LocalTeam[] {
  const names = setupTeams
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (names.length < 1) {
    throw new Error('Please enter at least one team name.');
  }

  return names.map((name, index) => ({ id: `local-${index + 1}`, name, score: 0 }));
}

export function getActiveSnippetPoints(params: {
  snippet1Points: string;
  snippet2Points: string;
  snippet3Points: string;
  highestPlayedStageIndex: number;
  fallbackPoints: number[];
}): number {
  const points = [params.snippet1Points, params.snippet2Points, params.snippet3Points].map((value) => Number.parseInt(value, 10));
  const index = Math.max(0, Math.min(points.length - 1, params.highestPlayedStageIndex));
  const selected = points[index];
  return Number.isFinite(selected) ? selected : params.fallbackPoints[index];
}


