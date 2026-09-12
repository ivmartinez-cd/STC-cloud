// Estado de pantalla en la URL — lógica pura, sin React, sin DOM, sin red.
// Ejecutar desde la raíz del repo:
//   npx tsx --test cloud/portal/tests/urlParams.test.ts
//
// Vive fuera de `portal/src` a propósito: ese árbol lo typechequea
// `tsconfig.app.json` con `types: ["vite/client"]` (sin @types/node), así que
// un `import 'node:test'` ahí adentro rompería `npm run check` del portal.
//
// Cada bloque de acá abajo es la regresión de un bug REAL de la auditoría de
// navegación del 12/09/2026 (commits 8460535, 60f1e82, 9375582).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  enumParam, stringParam, flagParam, pageParam, parseAll, applyChanges, type Codecs,
} from '../src/shared/lib/urlParams';
import { clampPage } from '../src/shared/lib/clampPage';

const SEGMENTS = ['todos', 'con_alertas', 'sin_contacto'] as const;
type Segment = (typeof SEGMENTS)[number];

/** Forma típica de un listado del portal. */
const CODECS = {
  q: stringParam(),
  segment: enumParam(SEGMENTS, 'todos'),
  baja: flagParam(),
  page: pageParam,
} satisfies Codecs<{ q: string; segment: Segment; baja: boolean; page: number }>;

type State = { q: string; segment: Segment; baja: boolean; page: number };

const sp = (s: string) => new URLSearchParams(s);

describe('pageParam: ?page= es 1-based y la basura cae a la primera página', () => {
  test('la página que se muestra es la del estado + 1', () => {
    assert.equal(pageParam.parse('3'), 2);
    assert.equal(pageParam.format(2), '3');
  });

  test('la primera página no se escribe en la URL', () => {
    assert.equal(pageParam.format(0), null);
    assert.equal(pageParam.parse('1'), 0);
  });

  // Antes de la auditoría, un `?page=` inválido podía dejar el listado en una
  // página que no existe (tabla vacía con el pie diciendo otra cosa).
  for (const raw of ['abc', '-1', '0', '1.5', '', 'null', ' ']) {
    test(`?page=${JSON.stringify(raw)} cae a la primera`, () => {
      assert.equal(pageParam.parse(raw), 0);
    });
  }

  test('param ausente cae a la primera', () => {
    assert.equal(pageParam.parse(null), 0);
  });
});

describe('enumParam: un valor desconocido cae al default, no rompe', () => {
  // El caso real: `/alerts?class=supplies` mandaba `supplies` al backend, que
  // responde 400 y dejaba la tabla en error (encontrado en prod el 12/09/2026).
  const classParam = enumParam(['jam', 'availability', 'other'] as const, 'other');

  test('valor válido pasa', () => {
    assert.equal(classParam.parse('jam'), 'jam');
  });

  test('valor desconocido cae al default', () => {
    assert.equal(classParam.parse('supplies'), 'other');
    assert.equal(classParam.parse('<script>'), 'other');
  });

  test('el default no se escribe en la URL', () => {
    assert.equal(classParam.format('other'), null);
    assert.equal(classParam.format('jam'), 'jam');
  });

  test('param ausente cae al default', () => {
    assert.equal(classParam.parse(null), 'other');
  });
});

describe('flagParam y stringParam', () => {
  test('el flag sólo prende con 1', () => {
    assert.equal(flagParam().parse('1'), true);
    assert.equal(flagParam().parse('true'), false);
    assert.equal(flagParam().parse(null), false);
    assert.equal(flagParam().format(true), '1');
    assert.equal(flagParam().format(false), null);
  });

  test('el string vacío no se escribe', () => {
    assert.equal(stringParam().parse(null), '');
    assert.equal(stringParam().parse('hola'), 'hola');
    assert.equal(stringParam().format(''), null);
    assert.equal(stringParam().format('hola'), 'hola');
  });
});

describe('parseAll: la URL es la fuente de verdad de toda la pantalla', () => {
  test('lee todos los params de una', () => {
    const state = parseAll<State>(CODECS, sp('q=epson&segment=con_alertas&baja=1&page=3'));
    assert.deepEqual(state, { q: 'epson', segment: 'con_alertas', baja: true, page: 2 });
  });

  test('una URL vacía da el estado por defecto', () => {
    const state = parseAll<State>(CODECS, sp(''));
    assert.deepEqual(state, { q: '', segment: 'todos', baja: false, page: 0 });
  });

  test('params basura no contaminan el estado', () => {
    const state = parseAll<State>(CODECS, sp('segment=zzz&page=-4&baja=si'));
    assert.deepEqual(state, { q: '', segment: 'todos', baja: false, page: 0 });
  });
});

describe('applyChanges: escribir es MERGE, nunca reemplazo', () => {
  // EL bug que disparó todo: `setSearchParams({ tab })` pisaba la query entera,
  // así que cambiar de pestaña borraba el filtro y la página de la otra.
  test('cambiar una clave no borra las demás', () => {
    const next = applyChanges<State>(CODECS, sp('q=epson&segment=con_alertas&page=3'), { page: 0 });
    assert.equal(next.get('q'), 'epson');
    assert.equal(next.get('segment'), 'con_alertas');
    assert.equal(next.get('page'), null, 'la primera página se borra de la URL');
  });

  test('los params que el codec no conoce sobreviven', () => {
    // `from` lo pone quien linkea a la ficha; si una escritura lo borra, el
    // breadcrumb pierde a dónde volver.
    const next = applyChanges<State>(CODECS, sp('from=%2Fclients%3Fsegment%3Dcon_alertas&tab=general'), { segment: 'con_alertas' });
    assert.equal(next.get('from'), '/clients?segment=con_alertas');
    assert.equal(next.get('tab'), 'general');
    assert.equal(next.get('segment'), 'con_alertas');
  });

  test('volver al default borra el param en vez de escribirlo', () => {
    const next = applyChanges<State>(CODECS, sp('segment=con_alertas&baja=1'), { segment: 'todos', baja: false });
    assert.equal(next.get('segment'), null);
    assert.equal(next.get('baja'), null);
    assert.equal(next.toString(), '');
  });

  test('cambiar el filtro y resetear la página es UNA sola escritura', () => {
    // Si fueran dos, saldrían dos fetches y el primero (página vieja + filtro
    // nuevo) podía llegar último y dejar la tabla vacía.
    const next = applyChanges<State>(CODECS, sp('segment=todos&page=5'), { segment: 'con_alertas', page: 0 });
    assert.equal(next.get('segment'), 'con_alertas');
    assert.equal(next.get('page'), null);
  });

  test('no muta los params de entrada', () => {
    const prev = sp('segment=con_alertas');
    applyChanges<State>(CODECS, prev, { segment: 'todos' });
    assert.equal(prev.get('segment'), 'con_alertas');
  });
});

describe('ida y vuelta: lo que se escribe es lo que se vuelve a leer', () => {
  test('un estado completo sobrevive al round-trip', () => {
    const original: State = { q: 'lexmark', segment: 'sin_contacto', baja: true, page: 7 };
    const written = applyChanges<State>(CODECS, sp(''), original);
    assert.deepEqual(parseAll<State>(CODECS, written), original);
  });

  test('el estado por defecto deja la URL limpia', () => {
    const written = applyChanges<State>(CODECS, sp(''), { q: '', segment: 'todos', baja: false, page: 0 });
    assert.equal(written.toString(), '');
  });
});

describe('clampPage: acotar lo que se muestra sin pisar el ?page= de la URL', () => {
  test('acota a la última página que existe', () => {
    assert.equal(clampPage(9, 10, 25), 2);
  });

  test('deja pasar una página válida', () => {
    assert.equal(clampPage(1, 10, 25), 1);
  });

  test('con total desconocido devuelve la elegida', () => {
    // `useFitRows` converge en varios pasos al montar: persistir un clamp
    // calculado con un tamaño transitorio pisaba un `?page=` válido.
    assert.equal(clampPage(4, 10, 0), 4);
    assert.equal(clampPage(4, 0, 100), 4);
  });
});
