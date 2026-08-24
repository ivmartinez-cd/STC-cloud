import type { Feedback, FeedbackWithAuthor } from "../domain/entities/feedback";

// Contrato de wire snake_case preservado tal cual lo consumía ya el portal
// (`pages/Settings.tsx`: fb.created_at, fb.image_url) — el dominio interno usa
// camelCase, esta es la traducción explícita en el borde del sistema.

export function toSubmitView(feedback: Feedback) {
  return { id: feedback.id, type: feedback.type, title: feedback.title, status: feedback.status, created_at: feedback.createdAt };
}

export function toListView(items: FeedbackWithAuthor[]) {
  return items.map((f) => ({
    id: f.id,
    type: f.type,
    title: f.title,
    description: f.description,
    image_url: f.imageUrl,
    status: f.status,
    created_at: f.createdAt,
    username: f.username,
  }));
}

export function toUpdateStatusView(feedback: Feedback) {
  return { id: feedback.id, title: feedback.title, status: feedback.status };
}
