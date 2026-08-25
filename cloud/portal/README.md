# STC Cloud Portal - Frontend Architecture & Onboarding Guide

Este directorio alberga el portal web de administración y monitoreo de **STC-Cloud**. Ha sido diseñado bajo estrictos patrones de arquitectura limpia, modularidad y separación de responsabilidades para garantizar la escalabilidad, la robustez ante fallos y una óptima mantenibilidad técnica.

---

## 🛠️ Stack Tecnológico
*   **Core**: React 19.0.0 (Con APIs modernas y optimizadas)
*   **Construcción & Bundling**: Vite (Carga ultra-rápida en desarrollo mediante HMR nativo)
*   **Enrutamiento**: React Router v7.1.0 (Con carga perezosa de vistas principales)
*   **Sistema de Diseño**: Tailwind CSS v4.0.0 (Temas centralizados y variables nativas HSL)
*   **Iconografía**: Lucide React 0.474.0
*   **Visualización**: Recharts 2.15.0 (Envueltos en límites de error asíncronos)

---

## 📁 Arquitectura del Directorio (`src/`)

El código sigue la estructura de *feature slices* de `docs/dev/ARCHITECTURE_GUIDE.md`
(§2, "Frontend"), adoptada en la Fase 4 de `docs/dev/ARCHITECTURE_MIGRATION_PLAN.md`:

```
src/
├── App.tsx / main.tsx   # Raíz: rutas (lazy por página) y proveedores
├── app/layout/          # App shell: Layout, SidebarNav, navTree (árbol de navegación por rol)
├── store/               # Estado global: AuthContext, ToastContext
├── shared/              # Transversal a todos los features
│   ├── components/      #   BulkActionBar, ConfirmModal, FeedbackModal, ErrorBoundary, BrandModal,
│   │                    #   CreateIncidentModal, DeviceLifecycleModals/ (usados por ≥2 features)
│   ├── hooks/           #   useNow, useTime, useRowSelection
│   ├── lib/             #   Cliente API unificado, constantes, formateadores, imágenes de equipos, supplies
│   └── types/           #   Contratos consumidos por ≥2 features (monitor, agents, alerts, incidents, inventory, audit, supplies)
├── features/            # Un directorio por dominio de negocio
│   └── <feature>/       #   auth · dashboard · clients · pending-devices · monitors · devices ·
│       ├── pages/       #   alerts · incidents · supplies · reports · activity · email-log · settings
│       ├── components/  #   Orquestadores de ruta (livianos) / UI del feature /
│       ├── hooks/       #   fetching, polling y mutaciones / contratos propios /
│       ├── types/       #   utilidades propias
│       └── lib/
└── assets/              # Recursos estáticos (logos, imágenes corporativas)
```

Regla de dependencias: un feature puede importar de `shared/`, `store/` y `app/`, y
(excepcionalmente, documentado) componentes de otro feature; nunca al revés —
`shared/` no conoce a ningún feature.

---

## ⚡ Patrones de Diseño Clave (Auditoría Enterprise)

Cualquier desarrollador que trabaje en esta base de código debe preservar los siguientes pilares arquitectónicos:

### 1. Separación estricta de Vista y Datos (SoC)
Ningún componente en `features/<feature>/pages/` realiza peticiones directas de red ni gestiona timers locales. Toda la orquestación asíncrona de datos, la gestión de estados de carga (`loading`), errores (`error`) y mutaciones se delega a **Custom Hooks** en `features/<feature>/hooks/` (o `shared/hooks/` si son transversales).
*   *Ventaja*: Facilita las pruebas de caja blanca y unitarias de la UI sin mockear interfaces de red complejas.

### 2. Polling Seguro y Adaptativo (Smart Polling)
Para evitar la saturación de los endpoints de la API, el polling de sincronización de datos implementa:
*   **Timeout Recursivo** (`setTimeout`) en lugar de `setInterval` rígidos, evitando race conditions en conexiones móviles o de alta latencia.
*   **Visibility State Control**: Escucha el estado del navegador a través de `document.visibilityState === 'visible'`. Si el usuario cambia de pestaña, el polling se suspende en segundo plano y se reanuda de inmediato al volver a enfocar el portal.

### 3. Límites de Error Robustos (`ErrorBoundary`)
Los gráficos y visualizaciones interactivas de terceros (como Recharts) están envueltos en un componente de [ErrorBoundary](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/cloud/portal/src/components/ErrorBoundary.tsx). Si un error de renderizado ocurre en una métrica externa, el resto de la interfaz de la aplicación permanece 100% funcional y presentable.

---

## 🚀 Guía de Desarrollo Local

### 1. Instalación de dependencias
```bash
npm install
```

### 2. Levantar servidor de desarrollo
```bash
npm run dev
```

### 3. Compilación para producción (Build)
```bash
npm run build
```

### 4. Verificación de Tipos Estricta
El proyecto debe pasar la validación estática de tipos de TypeScript sin errores:
```bash
npx tsc --noEmit
```
