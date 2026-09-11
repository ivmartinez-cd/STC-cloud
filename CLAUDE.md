# stc-cloud

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
Al pushear un cambio, usar ambos comandos salvo indicación contraria de Iván.
