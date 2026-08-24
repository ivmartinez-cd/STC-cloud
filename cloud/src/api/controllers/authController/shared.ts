/** Cuerpo de login del portal. */
export interface LoginBody { username: string; password: string; }

/** Cuerpo de creación de usuario. */
export interface CreateUserBody { username: string; password: string; role?: string; client_id?: string; }

/** Cuerpo de actualización de usuario. */
export interface UpdateUserBody { password?: string; role?: string; active?: boolean; client_id?: string; }

/** Cuerpo de activación de agente. */
export interface ActivateBody { key: string; hardwareId?: string; }

/** Cuerpo de refresh de agente. */
export interface RefreshBody { agentId: string; refresh_token: string; }

/** Cuerpo de actualización de versión de agente. */
export interface VersionUpdateBody { version: string; url: string; hash: string; }

/** Parámetros de ruta con id. */
export interface IdParams { id: string; }

export const JWT_AGENT_TTL = "30d";
export const JWT_PORTAL_TTL = "8h";
