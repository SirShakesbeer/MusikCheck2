export type SnippetPlayRequest = {
  snippetUrl: string;
  durationSeconds: number;
  startAtSeconds?: number;
};

export interface SnippetPlayer {
  play(request: SnippetPlayRequest): Promise<void>;
  stop(): void;
  dispose(): void;
}

export class HtmlAudioSnippetPlayer implements SnippetPlayer {
  private readonly audio: HTMLAudioElement;
  private youtubeFrame: HTMLIFrameElement | null = null;
  private stopTimer: number | null = null;

  constructor() {
    this.audio = new Audio();
  }

  async play(request: SnippetPlayRequest): Promise<void> {
    this.stop();

    if (request.snippetUrl.includes('youtube.com/embed/')) {
      let url = request.snippetUrl;
      
      // Extract existing start parameter from URL if present (set by backend)
      let startAt = 0;
      const startMatch = url.match(/[&?]start=(\d+)/);
      if (startMatch) {
        startAt = parseInt(startMatch[1], 10);
        // Remove the existing start parameter from URL
        url = url.replace(/[&?]start=\d+/, '');
      } else if (request.startAtSeconds !== undefined) {
        // Use provided startAtSeconds if URL doesn't have one
        startAt = Math.max(0, Math.floor(request.startAtSeconds));
      }
      
      const separator = url.includes('?') ? '&' : '?';
      const frame = document.createElement('iframe');
      frame.width = '1';
      frame.height = '1';
      frame.style.position = 'fixed';
      frame.style.left = '-10000px';
      frame.style.top = '-10000px';
      frame.allow = 'autoplay; encrypted-media';
      frame.src = `${url}${separator}start=${startAt}&autoplay=1`;
      document.body.appendChild(frame);
      this.youtubeFrame = frame;

      this.stopTimer = window.setTimeout(() => {
        this.stop();
      }, request.durationSeconds * 1000);
      return;
    }

    this.audio.src = request.snippetUrl;
    this.audio.currentTime = Math.max(0, request.startAtSeconds ?? 0);
    await this.audio.play();

    this.stopTimer = window.setTimeout(() => {
      this.stop();
    }, request.durationSeconds * 1000);
  }

  stop(): void {
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.youtubeFrame) {
      this.youtubeFrame.remove();
      this.youtubeFrame = null;
    }
  }

  dispose(): void {
    this.stop();
    this.audio.src = '';
  }
}
