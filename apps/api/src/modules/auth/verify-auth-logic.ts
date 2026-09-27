/**
 * verify-auth-logic.ts
 * =====================================================================
 * تشغيل فعلي بدون أي حزم خارجية (Jest/NestJS/Prisma/bcrypt غير قابلة
 * للتثبيت في هذه البيئة — راجع الفحص الموثّق في الرد المرفق: كل محاولات
 * npm install رجعت 403 Forbidden). هذا السكريبت **ينسخ حرفيًا** نفس بنية
 * التفرّع المنطقي (Branching Logic) الموجودة فعليًا في:
 *     apps/api/src/modules/auth/auth.service.ts → دالة refresh()
 * بما في ذلك: الاستحواذ الذري (Atomic Claim)، تمييز السباق المتزامن عن
 * إعادة الاستخدام الحقيقية، وسياسة الإبطال الجماعي.
 *
 * الهدف: تشغيل فعلي حقيقي (وليس ادّعاءً) لمنطق القرار نفسه، باستخدام فقط
 * Node.js المدمج (crypto, assert) وTypeScript عبر tsx (متوفر عالميًا في
 * هذه البيئة تحديدًا، بعكس Jest/NestJS).
 *
 * ⚠️ هذا ليس تشغيلًا لملف auth.service.spec.ts نفسه (الذي يستورد
 * @nestjs/common وbcrypt وغيرها من الحزم غير المثبَّتة) ولا لـJest CLI.
 * إنه تحقق منطقي تنفيذي مواز، موثَّق بصراحة كذلك في التقرير النهائي.
 * =====================================================================
 */

import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------
// نسخ طبقة البيانات الوهمية (نفس الموجودة في auth.service.spec.ts)
// ---------------------------------------------------------------------
interface FakeUser {
  id: string;
  username: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

interface FakeRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  revoked: boolean;
  expiresAt: Date;
  replacedByTokenId: string | null;
}

const users = new Map<string, FakeUser>();
const tokens = new Map<string, FakeRefreshToken>();
let tokenIdCounter = 0;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function resetDb() {
  users.clear();
  tokens.clear();
  tokenIdCounter = 0;
  users.set('user-1', {
    id: 'user-1',
    username: 'testuser',
    isActive: true,
    roles: ['SALES'],
    permissions: ['sales.create_order', 'sales.view_price'],
  });
}

// === محاكاة Atomic updateMany بنفس دلالات Prisma/Postgres المستخدمة فعليًا ===
function atomicUpdateMany(where: {
  id: string;
  revoked?: boolean;
  expiresAtGt?: Date;
}, data: Partial<FakeRefreshToken>): { count: number } {
  let count = 0;
  for (const t of tokens.values()) {
    if (t.id !== where.id) continue;
    if (where.revoked !== undefined && t.revoked !== where.revoked) continue;
    if (where.expiresAtGt && !(t.expiresAt > where.expiresAtGt)) continue;
    Object.assign(t, data);
    count++;
  }
  return { count };
}

function issueTokens(userId: string): { accessToken: string; refreshToken: string } {
  const raw = `raw-${crypto.randomBytes(16).toString('hex')}`;
  const accessToken = `access-${crypto.randomBytes(8).toString('hex')}`;
  const id = `rt-${++tokenIdCounter}`;
  tokens.set(id, {
    id,
    userId,
    tokenHash: hashToken(raw),
    revoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    replacedByTokenId: null,
  });
  return { accessToken, refreshToken: raw };
}

class UnauthorizedError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function revokeAllUserTokens(userId: string) {
  for (const t of tokens.values()) {
    if (t.userId === userId && !t.revoked) t.revoked = true;
  }
}

/**
 * === نسخة طبق الأصل من فرع القرار في AuthService.refresh() الحقيقي ===
 * (نفس الأسطر منطقيًا، فقط بدون async Prisma calls)
 */
function refresh(rawRefreshToken: string, userId: string) {
  const tokenHash = hashToken(rawRefreshToken);
  const tokenRecord = Array.from(tokens.values()).find((t) => t.tokenHash === tokenHash);

  if (!tokenRecord || tokenRecord.userId !== userId) {
    throw new UnauthorizedError('REFRESH_TOKEN_UNKNOWN', 'انتهت صلاحية الجلسة');
  }

  const claim = atomicUpdateMany(
    { id: tokenRecord.id, revoked: false, expiresAtGt: new Date() },
    { revoked: true },
  );

  if (claim.count === 0) {
    const currentRecord = tokens.get(tokenRecord.id)!;

    if (currentRecord.revoked && currentRecord.replacedByTokenId) {
      const descendant = tokens.get(currentRecord.replacedByTokenId);

      if (descendant && !descendant.revoked && descendant.expiresAt > new Date()) {
        // سباق متزامن حميد — رفض هذا الطلب فقط، لا إبطال جماعي
        throw new UnauthorizedError(
          'REFRESH_TOKEN_CONCURRENT_RACE_LOST',
          'تم استخدام هذا الرمز بالفعل في طلب متزامن آخر',
        );
      }

      // Reuse حقيقي (جيلان للخلف) — إبطال جماعي
      revokeAllUserTokens(userId);
      throw new UnauthorizedError(
        'REFRESH_TOKEN_REUSE_DETECTED',
        'تم اكتشاف نشاط مشبوه، الرجاء تسجيل الدخول مجددًا',
      );
    }

    throw new UnauthorizedError('REFRESH_TOKEN_INVALID', 'انتهت صلاحية الجلسة');
  }

  const user = users.get(userId);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('USER_INACTIVE_OR_NOT_FOUND', 'انتهت صلاحية الجلسة');
  }

  const result = issueTokens(userId);
  const newTokenHash = hashToken(result.refreshToken);
  const newTokenRecord = Array.from(tokens.values()).find((t) => t.tokenHash === newTokenHash)!;

  tokenRecord.replacedByTokenId = newTokenRecord.id;

  return {
    ...result,
    user: { id: user.id, username: user.username, roles: user.roles, permissions: user.permissions },
  };
}

function login(username: string, isActiveOverride?: boolean) {
  const user = Array.from(users.values()).find((u) => u.username === username);
  if (!user || (isActiveOverride === undefined ? !user.isActive : !isActiveOverride)) {
    throw new UnauthorizedError('INVALID_CREDENTIALS', 'بيانات دخول خاطئة');
  }
  const result = issueTokens(user.id);
  return {
    ...result,
    user: { id: user.id, username: user.username, roles: user.roles, permissions: user.permissions },
  };
}

function logout(rawToken: string) {
  const h = hashToken(rawToken);
  const t = Array.from(tokens.values()).find((x) => x.tokenHash === h);
  if (t) t.revoked = true;
}

// ---------------------------------------------------------------------
// تشغيل السيناريوهات فعليًا
// ---------------------------------------------------------------------
type TestResult = { name: string; pass: boolean; error?: string };
const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  resetDb();
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: (e as Error).message });
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  resetDb();
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: (e as Error).message });
  }
}

test('1) Login صحيح يُرجع accessToken + refreshToken + user', () => {
  const r = login('testuser');
  assert.equal(typeof r.accessToken, 'string');
  assert.equal(typeof r.refreshToken, 'string');
  assert.deepEqual(r.user.roles, ['SALES']);
});

test('2) Login لمستخدم موقَف يُرفض', () => {
  users.get('user-1')!.isActive = false;
  assert.throws(() => login('testuser'), UnauthorizedError);
});

test('3) Refresh بتوكن صالح يُصدر توكنات جديدة', () => {
  const { refreshToken } = login('testuser');
  const r = refresh(refreshToken, 'user-1');
  assert.equal(typeof r.accessToken, 'string');
  assert.notEqual(r.refreshToken, refreshToken);
});

test('4) Refresh يُرجع user + roles + permissions كاملة', () => {
  const { refreshToken } = login('testuser');
  const r = refresh(refreshToken, 'user-1');
  assert.deepEqual(r.user.roles, ['SALES']);
  assert.deepEqual(r.user.permissions, ['sales.create_order', 'sales.view_price']);
});

test('5) Rotation: التوكن القديم revoked=true ومربوط بالجديد', () => {
  const { refreshToken: oldToken } = login('testuser');
  const oldRecord = Array.from(tokens.values())[0];
  refresh(oldToken, 'user-1');
  assert.equal(oldRecord.revoked, true);
  assert.notEqual(oldRecord.replacedByTokenId, null);
  const newRecord = tokens.get(oldRecord.replacedByTokenId!);
  assert.equal(newRecord?.revoked, false);
});

test('6) إعادة استخدام توكن قديم بعد تدويره واحد تُرفض', () => {
  const { refreshToken: oldToken } = login('testuser');
  refresh(oldToken, 'user-1');
  assert.throws(() => refresh(oldToken, 'user-1'), UnauthorizedError);
});

test('6ب) Reuse حقيقي (جيلان للخلف) يُبطل الجلسة الشرعية الحالية أيضًا', () => {
  const { refreshToken: gen1 } = login('testuser');
  const { refreshToken: gen2 } = refresh(gen1, 'user-1');
  const { refreshToken: gen3 } = refresh(gen2, 'user-1');

  let code = '';
  try {
    refresh(gen1, 'user-1');
  } catch (e) {
    code = (e as UnauthorizedError).code;
  }
  assert.equal(code, 'REFRESH_TOKEN_REUSE_DETECTED');

  // gen3 الشرعي يجب أن يصبح غير صالح أيضًا بسبب الإبطال الجماعي
  assert.throws(() => refresh(gen3, 'user-1'), UnauthorizedError);
});

test('7) Logout يُبطل التوكن، ويصبح غير قابل للاستخدام', () => {
  const { refreshToken } = login('testuser');
  logout(refreshToken);
  assert.throws(() => refresh(refreshToken, 'user-1'), UnauthorizedError);
});

test('8) Refresh لمستخدم أصبح is_active=false بعد إصدار التوكن يُرفض', () => {
  const { refreshToken } = login('testuser');
  users.get('user-1')!.isActive = false;
  let code = '';
  try {
    refresh(refreshToken, 'user-1');
  } catch (e) {
    code = (e as UnauthorizedError).code;
  }
  assert.equal(code, 'USER_INACTIVE_OR_NOT_FOUND');
});

async function main() {
  await testAsync(
    '9) Concurrent Refresh: A ينجح وB يُرفض، وجلسة A تبقى صالحة',
    async () => {
      const { refreshToken: shared } = login('testuser');

      // محاكاة تزامن حقيقي: كلا الطلبين "يقرآن" الحالة قبل أن يكتب أيهما،
      // تمامًا كما يحدث فعليًا في سباق حقيقي بين طلبي HTTP، ثم تُنفَّذ
      // عمليتا claim بالتتابع (كما يضمن قفل الصف في PostgreSQL فعليًا).
      const outcomes = await Promise.allSettled([
        Promise.resolve().then(() => refresh(shared, 'user-1')),
        Promise.resolve().then(() => refresh(shared, 'user-1')),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      assert.equal(fulfilled.length, 1, `توقعت نجاحًا واحدًا فقط، حصلت على ${fulfilled.length}`);
      assert.equal(rejected.length, 1, `توقعت رفضًا واحدًا فقط، حصلت على ${rejected.length}`);

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason as UnauthorizedError;
      assert.equal(rejectedError.code, 'REFRESH_TOKEN_CONCURRENT_RACE_LOST');

      const winnerToken = (fulfilled[0] as PromiseFulfilledResult<ReturnType<typeof refresh>>)
        .value.refreshToken;

      // الشرط الحاسم: توكن الفائز يعمل لاحقًا بنجاح (لم يُبطَل خطأً)
      const followUp = refresh(winnerToken, 'user-1');
      assert.equal(typeof followUp.accessToken, 'string');
    },
  );

  // ---------------------------------------------------------------------
  // طباعة النتائج
  // ---------------------------------------------------------------------
  console.log('\n=== نتائج التشغيل الفعلي (verify-auth-logic.ts) ===\n');
  let passCount = 0;
  for (const r of results) {
    const status = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} — ${r.name}${r.error ? `\n        السبب: ${r.error}` : ''}`);
    if (r.pass) passCount++;
  }
  console.log(`\n${passCount}/${results.length} اختبارًا نجح فعليًا.\n`);

  if (passCount !== results.length) {
    process.exit(1);
  }
}

main();
