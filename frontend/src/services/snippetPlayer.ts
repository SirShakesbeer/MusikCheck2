export type SnippetPlayRequest = {
  snippetUrl: string;
  durationSeconds: number;
};

export interface SnippetPlayer {
  play(request: SnippetPlayRequest): Promise<void>;
  stop(): void;
  dispose(): void;
}

export class HtmlAudioSnippetPlayer implements SnippetPlayer {
  private readonly audio: HTMLAudioElement;
  private stopTimer: number | null = null;

  constructor() {
    this.audio = new Audio();
  }

  async play(request: SnippetPlayRequest): Promise<void> {
    this.stop();
    this.audio.src = request.snippetUrl;
    this.audio.currentTime = 0;
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
  }

  dispose(): void {
    this.stop();
    this.audio.src = '';
  }
}
