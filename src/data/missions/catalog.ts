/**
 * Mission catalog: id -> MissionDef, for anything that needs to look up a
 * Mission by its string id rather than importing the constant directly.
 * `SetupScreen.tsx`'s hotseat buttons still import each MissionDef directly
 * (unchanged) — this catalog exists for the online-play server (M13), which
 * only ever receives a `missionId` string over the wire (never a client-
 * supplied MissionDef object) and needs its own trusted lookup.
 */
import type { MissionDef } from '../../engine/types';
import { MISSION_1 } from './mission1';
import { ARMOR_SANDBOX } from './sandbox';
import { FIRE_SUPPORT_SANDBOX } from './fireSupportSandbox';
import { HILLS_SANDBOX } from './hillsSandbox';
import { OBSTACLES_SANDBOX } from './obstaclesSandbox';
import { FORTIFICATIONS_SANDBOX } from './fortificationsSandbox';
import { HEX_BOARD_DEMO } from './hexBoardDemo';

export const MISSION_CATALOG: Record<string, MissionDef> = {
  [MISSION_1.id]: MISSION_1,
  [ARMOR_SANDBOX.id]: ARMOR_SANDBOX,
  [FIRE_SUPPORT_SANDBOX.id]: FIRE_SUPPORT_SANDBOX,
  [HILLS_SANDBOX.id]: HILLS_SANDBOX,
  [OBSTACLES_SANDBOX.id]: OBSTACLES_SANDBOX,
  [FORTIFICATIONS_SANDBOX.id]: FORTIFICATIONS_SANDBOX,
  [HEX_BOARD_DEMO.id]: HEX_BOARD_DEMO,
};

export function missionById(id: string): MissionDef | undefined {
  return MISSION_CATALOG[id];
}
