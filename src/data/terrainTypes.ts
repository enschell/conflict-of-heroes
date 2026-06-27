/**
 * The Foot Movement & Terrain Table as data (rulebook §4.0 / §5.0).
 * Walls and hills are handled separately (edge feature / later module).
 */
import type { TerrainDef, TerrainId } from '../engine/types';

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  open: { id: 'open', name: 'Open', apCost: 0, dm: 0, blocksLOS: false, isCover: false },
  road: { id: 'road', name: 'Road', apCost: 0, dm: 0, blocksLOS: false, isCover: false },
  buildingStone: {
    id: 'buildingStone',
    name: 'Building (Stone)',
    apCost: 1,
    dm: 2,
    blocksLOS: true,
    isCover: true,
  },
  buildingWood: {
    id: 'buildingWood',
    name: 'Building (Wood)',
    apCost: 1,
    dm: 1,
    blocksLOS: true,
    isCover: true,
  },
  plowed: { id: 'plowed', name: 'Plowed Field', apCost: 0, dm: 0, blocksLOS: false, isCover: false },
  water: {
    id: 'water',
    name: 'Water',
    apCost: 4,
    dm: -1,
    blocksLOS: false,
    isCover: false,
    footOnly: true,
  },
  woodsLight: {
    id: 'woodsLight',
    name: 'Woods (Light)',
    apCost: 0,
    dm: 1,
    blocksLOS: true,
    isCover: true,
  },
  woodsHeavy: {
    id: 'woodsHeavy',
    name: 'Woods (Heavy)',
    apCost: 1,
    dm: 2,
    blocksLOS: true,
    isCover: true,
  },
};
