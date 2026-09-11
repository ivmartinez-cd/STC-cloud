/**
 * Catálogo de perfiles de modelo. Un archivo por modelo en `models/<marca>/<modelo>.ts`.
 * El ORDEN importa: los más específicos primero (se toma el primer perfil cuyo `match` acierte).
 * Para agregar un modelo: crear el archivo con `defineModel({...})` y sumarlo aquí.
 */
import type { ModelProfile } from '../types';

import samsungSlM4072fd from './samsung/sl-m4072fd';
import samsungSlM4020nd from './samsung/sl-m4020nd';
import samsungScx483x   from './samsung/scx-483x';
import samsungClx6260   from './samsung/clx-6260';
import samsungClp680    from './samsung/clp-680';
import samsungX4300lx   from './samsung/x4300lx';
import samsungM5370lx   from './samsung/m5370lx';

import hpM479fdw from './hp/m479fdw';
import hpM428fdw from './hp/m428fdw';
import hpM432    from './hp/m432';
import hpE47528  from './hp/e47528';
import hpE78625  from './hp/e78625';
import hpE40040  from './hp/e40040';
import hpE50145  from './hp/e50145';
import hpE52645  from './hp/e52645';
import hpLaserJetJetdirect from './hp/laserjet-jetdirect';

import lexmarkT652   from './lexmark/t652';
import lexmarkT654   from './lexmark/t654';
import lexmarkX656de from './lexmark/x656de';

export const MODEL_PROFILES: readonly ModelProfile[] = [
  // Samsung
  samsungSlM4072fd, samsungSlM4020nd, samsungScx483x, samsungClx6260, samsungClp680, samsungX4300lx, samsungM5370lx,
  // HP
  hpM479fdw, hpM428fdw, hpM432, hpE47528, hpE78625, hpE40040, hpE50145, hpE52645, hpLaserJetJetdirect,
  // Lexmark
  lexmarkT652, lexmarkT654, lexmarkX656de,
];
