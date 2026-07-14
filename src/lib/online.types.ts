/* Доменные типы онлайн-сущностей (для Фазы 6). Соответствуют схеме БД
 * (migrations 0003). Полную генерацию типов можно получить из Supabase
 * (supabase gen types / MCP generate_typescript_types). */
import type { GameState } from '../engine/types';

export type Variant = 'short' | 'long';
export type Visibility = 'public' | 'private';
export type TableStatus = 'waiting' | 'playing' | 'finished';

export interface GameTable {
  id: string;
  owner_id: string;
  name: string;
  variant: Variant;
  visibility: Visibility;
  settings: Record<string, unknown>;
  status: TableStatus;
  quick: boolean;
  created_at: string;
}

export interface TableSeat {
  id: string;
  table_id: string;
  user_id: string | null;
  seat: 0 | 1;
  color: 'w' | 'b';
  is_ready: boolean;
  is_bot: boolean;
  joined_at: string;
}

export interface GameRow {
  id: string;
  table_id: string;
  variant: Variant;
  state: GameState;
  turn: 'w' | 'b';
  dice: number[];
  rolled: number[] | null;
  match_score: Record<string, unknown>;
  status: 'playing' | 'finished';
  winner: 'w' | 'b' | null;
  ply: number;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
}

export interface MoveRow {
  id: string;
  game_id: string;
  player_id: string | null;
  ply: number;
  roll: number[] | null;
  moves: { from: number | 'bar'; to: number | 'off'; die: number }[];
  created_at: string;
}

export interface Invite {
  id: string;
  table_id: string;
  from_id: string;
  to_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}
