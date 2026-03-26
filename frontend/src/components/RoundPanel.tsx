import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoundState, TeamState, TeamGuessState } from '../types';
import { api } from '../services/api';
import { HtmlAudioSnippetPlayer } from '../services/snippetPlayer';

type Props = {
  round: RoundState | null;
  teams: TeamState[];
  onStart: () => void;
  onNextStage: () => void;
  onToggleFact: (teamId: string, fact: 'artist' | 'title') => void;
  onApplyWrongGuess: (teamId: string) => void;
  onError?: (error: string) => void;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume: number;
}

interface SpotifyPlayer {
  addListener: (event: string, callback: (...args: any[]) => void) => boolean;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause?: () => void;
  activateElement?: () => Promise<void> | void;
}

export function RoundPanel({ round, teams, onStart, onNextStage, onToggleFact, onApplyWrongGuess, onError }: Props) {
  const snippetPlayer = useMemo(() => new HtmlAudioSnippetPlayer(), []);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [isPlayingSnippet, setIsPlayingSnippet] = useState(false);
  const spotifyPlayerRef = useRef<SpotifyPlayer | null>(null);
  const spotifyDeviceIdRef = useRef<string | null>(null);
  const spotifyPlaybackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isSpotifyTrack = Boolean(round?.snippet_url?.startsWith('spotify:track:'));

  // Initialize Spotify Web Playback SDK
  useEffect(() => {
    const initializeSpotifyWebPlayer = async (forceRecreate = false) => {
      if (forceRecreate && spotifyPlayerRef.current) {
        try {
          spotifyPlayerRef.current.disconnect();
        } catch {
        }
        spotifyPlayerRef.current = null;
        spotifyDeviceIdRef.current = null;
        setSpotifyDeviceId(null);
      }

      if (spotifyPlayerRef.current) {
        return;
      }

      const loadSdk = () =>
        new Promise<void>((resolve) => {
          const existing = document.querySelector('script[data-spotify-sdk="true"]');
          if (existing) {
            resolve();
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://sdk.scdn.co/spotify-player.js';
          script.async = true;
          script.setAttribute('data-spotify-sdk', 'true');
          script.onload = () => resolve();
          document.head.appendChild(script);
        });

      await loadSdk();

      const createPlayer = async () => {
        if (!window.Spotify) {
          return;
        }
        const player = new window.Spotify.Player({
          name: 'MusikCheck Host',
          getOAuthToken: async (callback: (token: string) => void) => {
            const tokenResponse = await api.getSpotifyAccessToken();
            const token = (tokenResponse as any).data?.access_token;
            if (token) callback(token);
          },
          volume: 0.5,
        });

        player.addListener('ready', ({ device_id }: { device_id: string }) => {
          spotifyDeviceIdRef.current = device_id;
          setSpotifyDeviceId(device_id);
          console.log('[Spotify SDK] Device ready:', device_id);
        });

        player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          if (spotifyDeviceIdRef.current === device_id) {
            spotifyDeviceIdRef.current = null;
            setSpotifyDeviceId(null);
          }
        });

        player.addListener('initialization_error', ({ message }: { message: string }) => {
          onError?.(message);
        });

        player.addListener('authentication_error', ({ message }: { message: string }) => {
          onError?.(message);
        });

        player.addListener('account_error', ({ message }: { message: string }) => {
          onError?.(message);
        });

        const connected = await player.connect();
        if (!connected) {
          throw new Error('Spotify SDK player could not connect. Keep this tab open and try again.');
        }

        spotifyPlayerRef.current = player;
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      };

      if (window.Spotify) {
        await createPlayer();
        return;
      }

      await new Promise<void>((resolve) => {
        window.onSpotifyWebPlaybackSDKReady = () => {
          void createPlayer().finally(() => resolve());
        };
      });
    };

    void initializeSpotifyWebPlayer();
  }, [onError]);

  const getTeamGuesses = (teamId: string): TeamGuessState | undefined => {
    return round?.team_guesses?.[teamId];
  };

  const ensureSpotifyBrowserDevice = async (forceRecreate = false): Promise<string | null> => {
    const initializeSpotifyWebPlayer = async (forceRecreateInner = false) => {
      if (forceRecreateInner && spotifyPlayerRef.current) {
        try {
          spotifyPlayerRef.current.disconnect();
        } catch {
        }
        spotifyPlayerRef.current = null;
        spotifyDeviceIdRef.current = null;
        setSpotifyDeviceId(null);
      }

      if (spotifyPlayerRef.current) {
        return;
      }

      const loadSdk = () =>
        new Promise<void>((resolve) => {
          const existing = document.querySelector('script[data-spotify-sdk="true"]');
          if (existing) {
            resolve();
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://sdk.scdn.co/spotify-player.js';
          script.async = true;
          script.setAttribute('data-spotify-sdk', 'true');
          script.onload = () => resolve();
          document.head.appendChild(script);
        });

      await loadSdk();

      const createPlayer = async () => {
        if (!window.Spotify) {
          return;
        }
        const player = new window.Spotify.Player({
          name: 'MusikCheck Host',
          getOAuthToken: async (callback: (token: string) => void) => {
            const tokenResponse = await api.getSpotifyAccessToken();
            const token = (tokenResponse as any).data?.access_token;
            if (token) callback(token);
          },
          volume: 0.5,
        });

        player.addListener('ready', ({ device_id }: { device_id: string }) => {
          spotifyDeviceIdRef.current = device_id;
          setSpotifyDeviceId(device_id);
        });

        player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          if (spotifyDeviceIdRef.current === device_id) {
            spotifyDeviceIdRef.current = null;
            setSpotifyDeviceId(null);
          }
        });

        const connected = await player.connect();
        if (!connected) {
          throw new Error('Spotify SDK player could not connect.');
        }

        spotifyPlayerRef.current = player;
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      };

      if (window.Spotify) {
        await createPlayer();
        return;
      }

      await new Promise<void>((resolve) => {
        window.onSpotifyWebPlaybackSDKReady = () => {
          void createPlayer().finally(() => resolve());
        };
      });
    };

    await initializeSpotifyWebPlayer(forceRecreate);

    const player = spotifyPlayerRef.current as
      | { activateElement?: () => Promise<void> | void; connect?: () => Promise<boolean> }
      | null;

    if (player?.connect && !spotifyDeviceIdRef.current) {
      console.log('[Spotify SDK] Connecting player...');
      await player.connect();
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }

    if (player?.activateElement) {
      console.log('[Spotify SDK] Activating element...');
      await player.activateElement();
    }

    if (spotifyDeviceIdRef.current) {
      return spotifyDeviceIdRef.current;
    }

    return null;
  };

  const playSnippet = async () => {
    if (!round?.snippet_url) return;

    try {
      setIsPlayingSnippet(true);

      if (isSpotifyTrack) {
        // Play Spotify track
        const trackId = round.snippet_url.replace('spotify:track:', '');
        const trackDurationSeconds = round.stage_duration_seconds || 180;
        const snippetDuration = round.stage_duration_seconds || 30;

        const targetDeviceId = await ensureSpotifyBrowserDevice();
        if (!targetDeviceId) {
          onError?.('Spotify browser device not detected. Close any other Spotify tabs/apps, keep this page open, and try again.');
          setIsPlayingSnippet(false);
          return;
        }

        console.log('[Spotify] Activating device:', targetDeviceId);
        await api.activateSpotifyDevice(targetDeviceId);

        console.log('[Spotify] Playing track with device:', targetDeviceId);
        await api.playSpotifyRandom(trackId, trackDurationSeconds, snippetDuration, targetDeviceId, 0);

        // Stop playback after snippet duration
        if (spotifyPlaybackTimerRef.current) {
          clearTimeout(spotifyPlaybackTimerRef.current);
        }
        spotifyPlaybackTimerRef.current = window.setTimeout(() => {
          spotifyPlayerRef.current?.pause?.();
          spotifyPlaybackTimerRef.current = null;
          setIsPlayingSnippet(false);
        }, snippetDuration * 1000);
      } else {
        // Play YouTube or local file using HtmlAudioSnippetPlayer (audio only)
        // Note: YouTube URLs already have start parameter embedded by backend
        await snippetPlayer.play({
          snippetUrl: round.snippet_url,
          durationSeconds: round.stage_duration_seconds || 10,
          startAtSeconds: undefined, // Backend includes start in URL for YouTube
        });
        setIsPlayingSnippet(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError?.(message);
      setIsPlayingSnippet(false);
    }
  };

  useEffect(() => {
    return () => {
      snippetPlayer.dispose();
      if (spotifyPlaybackTimerRef.current) {
        clearTimeout(spotifyPlaybackTimerRef.current);
      }
    };
  }, [snippetPlayer]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        {!round ? (
          <button onClick={onStart} style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer' }}>
            ▶ Start Round / Next Song
          </button>
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <p style={{ margin: '8px 0', fontSize: '18px', fontWeight: 'bold' }}>
                Stage {round.stage_index + 1} / 3 • {round.stage_duration_seconds}s • {round.points_available} points
              </p>
            </div>

            {/* Snippet controls */}
            <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => void playSnippet()}
                disabled={isPlayingSnippet}
                style={{
                  padding: '10px 16px',
                  fontSize: '14px',
                  cursor: isPlayingSnippet ? 'not-allowed' : 'pointer',
                  backgroundColor: isPlayingSnippet ? '#ccc' : '#1976D2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  opacity: isPlayingSnippet ? 0.6 : 1,
                }}
              >
                {isPlayingSnippet ? '▶ Playing...' : '▶ Play Snippet'}
              </button>
            </div>

            {/* Team guesses section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {teams.length === 0 ? (
                <p style={{ gridColumn: '1 / -1' }}>No teams yet</p>
              ) : (
                teams.map((team) => {
                  const guesses = getTeamGuesses(team.id);
                  return (
                    <div
                      key={team.id}
                      style={{
                        border: '2px solid #ddd',
                        padding: '12px',
                        borderRadius: '8px',
                        backgroundColor: '#fafafa',
                      }}
                    >
                      <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>{team.name}</p>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => onToggleFact(team.id, 'artist')}
                          style={{
                            flex: '1',
                            minWidth: '80px',
                            padding: '8px',
                            backgroundColor: guesses?.artist_guessed ? '#4CAF50' : '#e0e0e0',
                            color: guesses?.artist_guessed ? 'white' : '#333',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '14px',
                          }}
                        >
                          Artist {guesses?.artist_guessed ? `+${guesses.artist_points}` : ''}
                        </button>
                        <button
                          onClick={() => onToggleFact(team.id, 'title')}
                          style={{
                            flex: '1',
                            minWidth: '80px',
                            padding: '8px',
                            backgroundColor: guesses?.title_guessed ? '#4CAF50' : '#e0e0e0',
                            color: guesses?.title_guessed ? 'white' : '#333',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '14px',
                          }}
                        >
                          Title {guesses?.title_guessed ? `+${guesses.title_points}` : ''}
                        </button>
                      </div>
                      {guesses && (guesses.artist_guessed || guesses.title_guessed) ? (
                        <button
                          onClick={() => onApplyWrongGuess(team.id)}
                          style={{
                            width: '100%',
                            padding: '8px',
                            backgroundColor: '#FF6B6B',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          ✗ Wrong Guess (-1)
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {/* Next stage button */}
            <button
              onClick={onNextStage}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                cursor: 'pointer',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
              }}
            >
              → Next Stage / Reveal
            </button>
          </>
        )}
      </div>
    </section>
  );
}
