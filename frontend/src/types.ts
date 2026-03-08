export type TeamState = {
  id: string;
  name: string;
  score: number;
};

export type PlayerState = {
  id: string;
  name: string;
  team_id: string | null;
};

export type RoundState = {
  stage_index: number;
  stage_duration_seconds: number;
  points_available: number;
  snippet_url: string;
  can_guess: boolean;
  status: string;
};

export type GameState = {
  lobby_code: string;
  mode_key: string;
  teams: TeamState[];
  players: PlayerState[];
  current_round: RoundState | null;
  message?: string | null;
};

export type ApiEnvelope = {
  ok: boolean;
  data: GameState;
};
