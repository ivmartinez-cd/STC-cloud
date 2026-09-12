# stc-cloud

## Dónde se deja el trabajo: `develop` de gitea

**Todo lo que se termina se deja en `develop` de gitea** (Iván, 12/09/2026). Ese es el
destino por defecto de cualquier trabajo cerrado; no hace falta preguntar cada vez:

```
git push origin main:develop
```

`main` de GitHub sólo se actualiza si Iván lo pide explícitamente (es donde corre el CI,
ver abajo). El detalle de los remotes queda documentado acá:

## Push a los remotes: main → GitHub, develop → gitea

El repo tiene dos remotes:

- `origin` → gitea (`https://gitea.canaldirecto.com.ar/SoporteApps/stc-cloud.git`), con
  `pushurl` doble (gitea + GitHub).
- `github` → sólo GitHub (`https://github.com/ivmartinez-cd/STC-cloud.git`).

En la práctica, el flujo activo es:

- `git push github main` → actualiza `main` en GitHub. Ahí vive el CI (GitHub Actions;
  Gitea Actions está apagado en este repo, ver memoria `gitea-migration-ci-split`).
- `git push origin main:develop` → actualiza `develop` en gitea (y de paso, por el
  pushurl doble, también `develop` en GitHub — efecto colateral, no el objetivo).

`main` en gitea queda desactualizado a propósito (no forma parte del flujo activo).

Desde el 12/09/2026 el comando por defecto es sólo el segundo (`origin main:develop`);
el push a `main` de GitHub pasó a ser a pedido.
