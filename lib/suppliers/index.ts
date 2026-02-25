/**
 * Supplier plugin registry.
 * Imports and registers all supplier plugins.
 */

import { registerSupplier, getSupplier, getAllSuppliers, getSupplierIds, createParseContext } from './registry';

import ao76 from './ao76';
import lenewblack from './lenewblack';
import playup from './playup';
import floss from './floss';
import petitblush from './petitblush';
import tinycottons from './tinycottons';
import indee from './indee';
import sundaycollective from './sundaycollective';
import goldieandace from './goldieandace';
import jenest from './jenest';
import wyncken from './wyncken';
import onemore from './onemore';
import weekendhousekids from './weekendhousekids';
import thenewsociety from './thenewsociety';
import emileetida from './emileetida';
import bobochoses from './bobochoses';
import minirodini from './minirodini';
import favoritepeople from './favoritepeople';
import mipounet from './mipounet';
import armedangels from './armedangels';
import thinkingmu from './thinkingmu';

const brunobruno = { ...floss, id: 'brunobruno', displayName: 'Brunobruno', brandName: 'Brunobruno' };

const allPlugins = [
  onemore,          // 1+ in the family
  ao76,             // Ao76
  armedangels,      // Armed Angels
  bobochoses,       // Bobo Choses
  brunobruno,       // Brunobruno (shared parser with Flöss)
  emileetida,       // Emile et Ida
  favoritepeople,   // Favorite People
  floss,            // Flöss
  goldieandace,     // Goldie + Ace
  indee,            // Indee
  jenest,           // Jenest
  lenewblack,       // Le New Black
  minirodini,       // Mini Rodini
  mipounet,         // Mipounet
  petitblush,       // Petit Blush
  playup,           // Play UP
  sundaycollective, // The Sunday Collective
  thenewsociety,    // The New Society
  thinkingmu,       // Thinking Mu
  tinycottons,      // Tiny Big sister
  weekendhousekids, // Weekend House Kids
  wyncken,          // Wyncken
];

for (const plugin of allPlugins) {
  registerSupplier(plugin);
}

export { getSupplier, getAllSuppliers, getSupplierIds, createParseContext };
export type { SupplierPlugin, ParsedProduct, ProductVariant, Brand, ParseContext, SupplierFiles } from './types';
