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

El código sigue una distribución orientada a dominios y separación de concernimientos (SoC). A continuación, se detalla el mapa mental de la aplicación:

```
src/
├── assets/         # Recursos estáticos (Logos, imágenes corporativas)
├── components/     # Componentes de presentación (UI pura sin lógica de red)
│   ├── agents/     # Modales, tablas y gráficos de la gestión de clientes
│   └── monitors/   # Componentes para monitores (Specs, consola, comandos)
├── context/        # Proveedores de estado global (Auth, Toast, etc.)
├── hooks/          # Capa lógica: Custom hooks de fetching, polling y mutaciones
├── lib/            # Utilidades centrales (Cliente API unificado, formateadores)
├── pages/          # Orquestadores de rutas (Vistas extremadamente livianas)
└── types/          # Modelos y contratos de TypeScript rígidos (Cero 'any')
```

---

## ⚡ Patrones de Diseño Clave (Auditoría Enterprise)

Cualquier desarrollador que trabaje en esta base de código debe preservar los siguientes pilares arquitectónicos:

### 1. Separación estricta de Vista y Datos (SoC)
Ningún componente en `src/pages/` realiza peticiones directas de red ni gestiona timers locales. Toda la orquestación asíncrona de datos, la gestión de estados de carga (`loading`), errores (`error`) y mutaciones se delega a **Custom Hooks** en `src/hooks/`.
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
