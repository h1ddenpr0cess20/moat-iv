import { paintAsphalt, paintConcrete } from 'madness-engine/textures/road';
import { paintGravel, paintPavers, paintTurf } from 'madness-engine/textures/ground';
import { paintMembrane, paintShingles } from 'madness-engine/textures/roofing';
import { paintFacade } from 'madness-engine/textures/facades';
import { paintCityFacade } from './facades.js';

/** Every painter the city's surfaces use, by the name `SURFACES` gives it. */
export const PAINTERS = { asphalt: paintAsphalt, concrete: paintConcrete, turf: paintTurf, gravel: paintGravel, pavers: paintPavers, shingles: paintShingles, membrane: paintMembrane, facade: paintFacade, city: paintCityFacade };

/** Paints one surface on this thread. */
export const paintHere = (painter, options) => PAINTERS[painter](options);
