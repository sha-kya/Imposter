export enum GameMode {
  AI_RANDOM = 'AI_RANDOM',
  AI_UNDERCOVER = 'AI_UNDERCOVER',
  CUSTOM = 'CUSTOM',
  PRESET = 'PRESET',
  PRESET_UNDERCOVER = 'PRESET_UNDERCOVER',
}

export enum GamePhase {
  MODE_SELECTION = 'MODE_SELECTION',
  SETUP = 'SETUP',
  CUSTOM_INPUT = 'CUSTOM_INPUT',
  LOADING = 'LOADING',
  PASS_DEVICE = 'PASS_DEVICE',
  REVEAL_ROLE = 'REVEAL_ROLE',
  GAME_ACTIVE = 'GAME_ACTIVE',
  GAME_OVER = 'GAME_OVER',
}

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'INSANE';

export interface Player {
  id: number;
  isImposter: boolean;
}

export interface CustomWordInput {
  playerId: number;
  category: string;
  word: string;
}

export interface GameState {
  phase: GamePhase;
  mode: GameMode;
  playerCount: number;
  category: string;
  secretWord: string;
  players: Player[];
  currentPlayerIndex: number;
  imposterIndex: number | null;
  startingPlayerId: number; // New field for random starter
  difficulty: Difficulty;
  // Timer fields
  timerDuration: number; // in seconds
  timeLeft: number;
  // Hint fields
  hints: string[];
  imposterHintEnabled: boolean;
  imposterHint: string | null;
  // Custom Mode fields
  customWords: CustomWordInput[];
  customInputIndex: number;
  // Undercover Mode fields
  imposterWord: string | null;
}