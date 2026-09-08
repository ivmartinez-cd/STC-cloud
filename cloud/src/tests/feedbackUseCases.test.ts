// Unitario puro sobre modules/feedback/application (sin API ni base): los casos
// de uso se ejercitan con fakes en memoria de sus puertos — Fase 5 del plan de
// migración (cobertura de application ≥ 85% módulo por módulo). El 403/404 por
// HTTP lo cubre el controller; acá se cubre la regla en sí.
// Ejecutar: npx tsx --test src/tests/feedbackUseCases.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ListFeedbackUseCase } from '../modules/feedback/application/use-cases/list-feedback';
import { UpdateFeedbackStatusUseCase } from '../modules/feedback/application/use-cases/update-feedback-status';
import { SubmitFeedbackUseCase } from '../modules/feedback/application/use-cases/submit-feedback';
import { NotFoundError, UnauthorizedError } from '../shared/domain/errors';
import type { Feedback, FeedbackStatus, FeedbackWithAuthor } from '../modules/feedback/domain/entities/feedback';
import type { CreateFeedbackInput, FeedbackRepository } from '../modules/feedback/domain/repositories/feedback-repository';
import type { AuditLogEntry, AuditLogWriter } from '../modules/feedback/application/ports/audit-log-writer';
import type { IdentityResolver } from '../modules/feedback/application/ports/identity-resolver';

const ADMIN = { userId: 'u-admin', username: 'admin', role: 'admin' };
const OPERATOR = { userId: 'u-op', username: 'op', role: 'operator' };

function memoryRepo(rows: Feedback[]): FeedbackRepository {
  return {
    async create(input: CreateFeedbackInput) {
      const row: Feedback = { id: `f${rows.length + 1}`, status: 'open', createdAt: new Date(), ...input };
      rows.push(row);
      return row;
    },
    async listWithAuthor() {
      return rows.map((r): FeedbackWithAuthor => ({ ...r, username: r.userId }));
    },
    async updateStatus(id: string, status: FeedbackStatus) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      row.status = status;
      return row;
    },
  };
}

function fakes() {
  const rows: Feedback[] = [];
  const audit: AuditLogEntry[] = [];
  const identity: IdentityResolver = {
    async resolveEffectiveIdentity(user) { return { id: user.userId, username: user.username ?? user.userId, clientId: null }; },
  };
  const writer: AuditLogWriter = { async write(entry) { audit.push(entry); } };
  return { rows, audit, repo: memoryRepo(rows), identity, writer };
}

describe('feedback — ListFeedbackUseCase', () => {
  test('sólo admin: operator → UnauthorizedError', async () => {
    const f = fakes();
    await assert.rejects(new ListFeedbackUseCase(f.repo).execute(OPERATOR), UnauthorizedError);
  });

  test('admin ve todos los reportes con autor', async () => {
    const f = fakes();
    await f.repo.create({ userId: 'u1', type: 'bug', title: 't', description: 'd', imageUrl: null });
    const list = await new ListFeedbackUseCase(f.repo).execute(ADMIN);
    assert.equal(list.length, 1);
    assert.equal(list[0].username, 'u1');
  });
});

describe('feedback — UpdateFeedbackStatusUseCase', () => {
  const input = (feedbackId: string, requestingUser = ADMIN) =>
    ({ requestingUser, feedbackId, status: 'closed' as const, ipAddress: '127.0.0.1' });

  test('sólo admin: operator → UnauthorizedError y no toca nada', async () => {
    const f = fakes();
    await assert.rejects(
      new UpdateFeedbackStatusUseCase(f.repo, f.identity, f.writer).execute(input('f1', OPERATOR)),
      UnauthorizedError
    );
    assert.equal(f.audit.length, 0);
  });

  test('id inexistente → NotFoundError, sin auditoría', async () => {
    const f = fakes();
    await assert.rejects(
      new UpdateFeedbackStatusUseCase(f.repo, f.identity, f.writer).execute(input('nope')),
      NotFoundError
    );
    assert.equal(f.audit.length, 0);
  });

  test('camino feliz: actualiza el estado y audita con la identidad efectiva', async () => {
    const f = fakes();
    const created = await f.repo.create({ userId: 'u1', type: 'enhancement', title: 'Título', description: 'd', imageUrl: null });
    const updated = await new UpdateFeedbackStatusUseCase(f.repo, f.identity, f.writer).execute(input(created.id));
    assert.equal(updated.status, 'closed');
    assert.equal(f.audit.length, 1);
    assert.equal(f.audit[0].action, 'UPDATE_FEEDBACK_STATUS');
    assert.equal(f.audit[0].targetId, created.id);
    assert.deepEqual(f.audit[0].metadata, { status: 'closed', title: 'Título', updated_by: 'admin' });
    assert.equal(f.audit[0].ipAddress, '127.0.0.1');
  });
});

describe('feedback — SubmitFeedbackUseCase', () => {
  test('cualquier rol autenticado puede reportar; imageUrl opcional cae a null', async () => {
    const f = fakes();
    const created = await new SubmitFeedbackUseCase(f.repo, f.identity, f.writer).execute({
      requestingUser: OPERATOR, type: 'bug', title: 'Se rompe', description: 'al guardar', ipAddress: null,
    });
    assert.equal(created.userId, OPERATOR.userId);
    assert.equal(created.imageUrl, null);
    assert.equal(created.status, 'open');
    assert.equal(f.audit.length, 1);
  });
});
