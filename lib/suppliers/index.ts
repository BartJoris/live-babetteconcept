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
import americanvintage from './americanvintage';
import bayiri from './bayiri';
import claudeandco from './claudeandco';
import cozmo from './cozmo';
import fub from './fub';
import sistersdepartment from './sistersdepartment';
import tangerine from './tangerine';
import babeandtess from './babeandtess';

const brunobruno = { ...floss, id: 'brunobruno', displayName: 'Brunobruno', brandName: 'Brunobruno' };

const allPlugins = [
  onemore,          // 1+ in the family
  americanvintage,  // American Vintage
  ao76,             // Ao76
  armedangels,      // Armed Angels
  bayiri,           // Bayiri
  bobochoses,       // Bobo Choses
  brunobruno,       // Brunobruno (shared parser with Flöss)
  claudeandco,      // Claude & Co
  cozmo,            // Cozmo
  emileetida,       // Emile et Ida
  favoritepeople,   // Favorite People
  floss,            // Flöss
  fub,              // FUB
  goldieandace,     // Goldie + Ace
  indee,            // Indee
  jenest,           // Jenest
  lenewblack,       // Le New Black
  minirodini,       // Mini Rodini
  mipounet,         // Mipounet
  petitblush,       // Petit Blush
  playup,           // Play UP
  babeandtess,      // Babe & Tess
  sistersdepartment,// Sisters Department
  sundaycollective, // The Sunday Collective
  tangerine,        // Tangerine
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
