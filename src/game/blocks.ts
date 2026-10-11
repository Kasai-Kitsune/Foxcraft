/**
 * Block registry: ids, atlas tiles, hardness (seconds to mine by paw), sound type.
 */

import { T } from './textures';

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  PLANKS: 5,
  LOG: 6,
  LEAVES: 7,
  SAND: 8,
  GRAVEL: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  BRICK: 12,
  BEDROCK: 13,
  WATER: 14,
} as const;

export type SoundKind = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand';

export interface BlockDef {
  name: string;
  top: number;
  side: number;
  bottom: number;
  solid: boolean;   // collides with player
  opaque: boolean;  // hides neighbor faces + blocks skylight
  hardness: number; // seconds to break; Infinity = unbreakable
  sound: SoundKind;
}

const def = (name: string, tile: number, hardness: number, sound: SoundKind, opts: Partial<BlockDef> = {}): BlockDef => ({
  name,
  top: tile,
  side: tile,
  bottom: tile,
  solid: true,
  opaque: true,
  hardness,
  sound,
  ...opts,
});

export const BLOCKS: BlockDef[] = [];
BLOCKS[B.AIR] = { name: 'Air', top: 0, side: 0, bottom: 0, solid: false, opaque: false, hardness: 0, sound: 'grass' };
BLOCKS[B.GRASS] = def('Grass Block', T.grassSide, 0.5, 'grass', { top: T.grassTop, bottom: T.dirt });
BLOCKS[B.DIRT] = def('Dirt', T.dirt, 0.45, 'dirt');
BLOCKS[B.STONE] = def('Stone', T.stone, 1.5, 'stone');
BLOCKS[B.COBBLE] = def('Cobblestone', T.cobble, 1.7, 'stone');
BLOCKS[B.PLANKS] = def('Oak Planks', T.planks, 1.15, 'wood');
BLOCKS[B.LOG] = def('Oak Log', T.logSide, 1.35, 'wood', { top: T.logTop, bottom: T.logTop });
BLOCKS[B.LEAVES] = def('Oak Leaves', T.leaves, 0.22, 'grass');
BLOCKS[B.SAND] = def('Sand', T.sand, 0.4, 'sand');
BLOCKS[B.GRAVEL] = def('Gravel', T.gravel, 0.5, 'sand');
BLOCKS[B.COAL_ORE] = def('Coal Ore', T.coal, 1.9, 'stone');
BLOCKS[B.IRON_ORE] = def('Iron Ore', T.iron, 2.1, 'stone');
BLOCKS[B.BRICK] = def('Bricks', T.brick, 1.9, 'stone');
BLOCKS[B.BEDROCK] = def('Bedrock', T.bedrock, Infinity, 'stone');
BLOCKS[B.WATER] = { name: 'Water', top: 0, side: 0, bottom: 0, solid: false, opaque: false, hardness: Infinity, sound: 'grass' };

/** Hotbar contents (placeable blocks). */
export const HOTBAR: number[] = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.LEAVES, B.SAND, B.BRICK,
];
