import { api } from './api';
import { HtmlAudioSnippetPlayer } from './snippetPlayer';
import type { RoundState } from '../types';

type SpotifySdkPlayer = {
  addListener: (event: string, callback: (...args: any[]) => void) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause: () => Promise<void>;
  activateElement?: () => Promise<void> | void;
};

type SpotifySdkWindow = Window & {
  Spotify?: {
    Player: new (config: {
      name: string;
      getOAuthToken: (callback: (token: string) => void) => void;
      volume?: number;
    }) => SpotifySdkPlayer;
  };
  onSpotifyWebPlaybackSDKReady?: () => void;
};

export class RoundPlaybackDispatcher {
  private readonly snippetPlayer = new HtmlAudioSnippetPlayer();
  private spotifyPlayer: SpotifySdkPlayer | null = null;
  private spotifyDeviceId: string | null = null;
  private spotifyPlaybackTimer: number | null = null;

  constructor(private readonly onSpotifyDeviceIdChange?: (deviceId: string | null) => void) {}

  stop(): void {
    this.snippetPlayer.stop();

    if (this.spotifyPlaybackTimer !== null) {
      window.clearTimeout(this.spotifyPlaybackTimer);
      this.spotifyPlaybackTimer = null;
    }

    if (this.spotifyPlayer) {
      void this.spotifyPlayer.pause();
    }
  }

  dispose(): void {
    this.stop();
    this.snippetPlayer.dispose();
    if (this.spotifyPlayer) {
      this.spotifyPlayer.disconnect();
      this.spotifyPlayer = null;
    }
    this.setSpotifyDeviceId(null);
  }

  async playRound(round: RoundState): Promise<void> {
    this.stop();
    if (round.status !== 'playing') {
      return;
    }

    if (round.round_kind === 'video') {
      return;
    }

    if (round.playback_provider === 'spotify_playlist') {
      await this.playSpotifyRound(round);
      return;
    }

    await this.snippetPlayer.play({
      snippetUrl: round.snippet_url,
      durationSeconds: Math.max(1, round.stage_playback.duration_seconds),
      startAtSeconds: Math.max(0, round.stage_playback.start_at_seconds),
    });
  }

  private setSpotifyDeviceId(deviceId: string | null): void {
    this.spotifyDeviceId = deviceId;
    if (this.onSpotifyDeviceIdChange) {
      this.onSpotifyDeviceIdChange(deviceId);
    }
  }

  private async playSpotifyRound(round: RoundState): Promise<void> {
    const trackId = round.playback_ref;
    if (!trackId) {
      throw new Error('Could not determine Spotify track ID for current round.');
    }

    const status = await api.getSpotifyStatus();
    if (!status.data.connected) {
      throw new Error('Spotify is not connected. Connect Spotify in setup before starting Spotify rounds.');
    }

    const deviceId = await this.ensureSpotifyBrowserDevice();
    if (!deviceId) {
      throw new Error('Spotify browser device is not ready. Keep this tab open and try again.');
    }

    const fallbackTrackDurationSeconds = 240;
    await api.playSpotifyRandom(
      trackId,
      Math.max(1, round.track_duration_seconds || fallbackTrackDurationSeconds),
      Math.max(1, round.stage_playback.duration_seconds),
      deviceId,
      Math.max(0, round.stage_playback.start_at_seconds),
    );

    this.spotifyPlaybackTimer = window.setTimeout(() => {
      if (this.spotifyPlayer) {
        void this.spotifyPlayer.pause();
      }
    }, Math.max(1, round.stage_playback.duration_seconds) * 1000);
  }

  private async ensureSpotifyBrowserDevice(): Promise<string | null> {
    await this.initializeSpotifyWebPlayer();

    const player = this.spotifyPlayer;
    if (player?.connect && !this.spotifyDeviceId) {
      await player.connect();
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    if (player?.activateElement) {
      await player.activateElement();
    }

    if (this.spotifyDeviceId) {
      return this.spotifyDeviceId;
    }

    const timeoutMs = 8000;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      if (this.spotifyDeviceId) {
        return this.spotifyDeviceId;
      }
    }

    await this.initializeSpotifyWebPlayer(true);

    const recreatedPlayer = this.spotifyPlayer;
    if (recreatedPlayer?.activateElement) {
      await recreatedPlayer.activateElement();
    }

    const retryStartedAt = Date.now();
    while (Date.now() - retryStartedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      if (this.spotifyDeviceId) {
        return this.spotifyDeviceId;
      }
    }

    return null;
  }

  private async initializeSpotifyWebPlayer(forceRecreate = false): Promise<void> {
    if (forceRecreate && this.spotifyPlayer) {
      try {
        this.spotifyPlayer.disconnect();
      } catch {
      }
      this.spotifyPlayer = null;
      this.setSpotifyDeviceId(null);
    }

    if (this.spotifyPlayer) {
      return;
    }

    await this.loadSpotifySdk();

    const windowWithSpotify = window as SpotifySdkWindow;

    const createPlayer = async () => {
      if (!windowWithSpotify.Spotify) {
        return;
      }

      const player = new windowWithSpotify.Spotify.Player({
        name: 'MusikCheck2 Browser Player',
        getOAuthToken: async (callback: (token: string) => void) => {
          const token = await api.getSpotifyAccessToken();
          callback(token.data.access_token);
        },
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        this.setSpotifyDeviceId(device_id);
      });
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        if (this.spotifyDeviceId === device_id) {
          this.setSpotifyDeviceId(null);
        }
      });

      const connected = await player.connect();
      if (!connected) {
        throw new Error('Spotify SDK player could not connect. Keep this tab open and try again.');
      }

      this.spotifyPlayer = player;
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    };

    if (windowWithSpotify.Spotify) {
      await createPlayer();
      return;
    }

    await new Promise<void>((resolve) => {
      windowWithSpotify.onSpotifyWebPlaybackSDKReady = () => {
        void createPlayer().finally(() => resolve());
      };
    });
  }

  private async loadSpotifySdk(): Promise<void> {
    await new Promise<void>((resolve) => {
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
      document.body.appendChild(script);
    });
  }
}