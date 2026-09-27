import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RbacService } from '../rbac/rbac.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AuthService — اختبارات Jest شاملة.
 *
 * منهجية الاختبار: PrismaService يُستبدَل بـFake In-Memory Store يُحاكي
 * سلوك جدولي `users` و`refresh_tokens` فعليًا، بما في ذلك **دلالات
 * Atomic `updateMany`** (شرط WHERE يُقيَّم عند التنفيذ الفعلي، وليس عند
 * القراءة المسبقة) — هذا ضروري تحديدًا لاختبار Concurrent Refresh
 * بمصداقية دون الحاجة لقاعدة بيانات PostgreSQL حقيقية.
 *
 * ⚠️ هذا اختبار Unit للمنطق داخل AuthService نفسه. الضمان الفعلي لذرّية
 * `UPDATE ... WHERE` على مستوى محرك قاعدة البيانات (قفل الصفوف الحقيقي)
 * يبقى مسؤولية PostgreSQL نفسه ولا يمكن إثباته بدون قاعدة بيانات حقيقية —
 * هذا الاختبار يتحقق من أن **كود AuthService يتصرف بشكل صحيح** بناءً على
 * النتيجة (`count`) التي يُعيدها الاستعلام الذري، وهو بالضبط ما يضمنه العقد
 * بين الكود وPrisma/Postgres.
 */

interface FakeUser {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  passwordHash: string;
  isActive: boolean;
  userRoles: { role: { code: string } }[];
}

interface FakeRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  revoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  replacedByTokenId: string | null;
}

function buildFakePrisma() {
  const users = new Map<string, FakeUser>();
  const tokens = new Map<string, FakeRefreshToken>();
  let tokenIdCounter = 0;

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        return users.get(id) ?? null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const u = users.get(id);
        if (!u) throw new Error('NotFound');
        return u;
      }),
    },
    refreshToken: {
      findUnique: jest.fn(
        async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
          if (where.id) return tokens.get(where.id) ?? null;
          if (where.tokenHash) {
            return Array.from(tokens.values()).find((t) => t.tokenHash === where.tokenHash) ?? null;
          }
          return null;
        },
      ),
      // === محاكاة Atomic updateMany — نقطة الاختبار الحرجة للـConcurrency ===
      // لا await داخلي بين قراءة الشرط وتنفيذ الكتابة، تمامًا كما تضمن
      // PostgreSQL ذرّية UPDATE ... WHERE على مستوى الصف الواحد.
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; revoked?: boolean; expiresAt?: { gt: Date }; userId?: string };
          data: Partial<FakeRefreshToken>;
        }) => {
          let count = 0;
          for (const t of tokens.values()) {
            if (where.id && t.id !== where.id) continue;
            if (where.userId && t.userId !== where.userId) continue;
            if (where.revoked !== undefined && t.revoked !== where.revoked) continue;
            if (where.expiresAt?.gt && !(t.expiresAt > where.expiresAt.gt)) continue;
            Object.assign(t, data);
            count++;
          }
          return { count };
        },
      ),
      update: jest.fn(async ({ where: { id }, data }: { where: { id: string }; data: Partial<FakeRefreshToken> }) => {
        const t = tokens.get(id);
        if (!t) throw new Error('NotFound');
        Object.assign(t, data);
        return t;
      }),
      create: jest.fn(async ({ data }: { data: Omit<FakeRefreshToken, 'id' | 'revoked' | 'createdAt' | 'replacedByTokenId'> }) => {
        const t: FakeRefreshToken = {
          id: `rt-${++tokenIdCounter}`,
          revoked: false,
          createdAt: new Date(),
          replacedByTokenId: null,
          ...data,
        };
        tokens.set(t.id, t);
        return t;
      }),
    },
  };

  return { prisma: prisma as unknown as PrismaService, users, tokens };
}

describe('AuthService', () => {
  const ACCESS_SECRET = 'test-access-secret';
  const REFRESH_SECRET = 'test-refresh-secret';

  let authService: AuthService;
  let fakeUsersService: jest.Mocked<Pick<UsersService, 'findByUsername'>>;
  let fakeRbacService: jest.Mocked<Pick<RbacService, 'getUserPermissionCodes'>>;
  let jwtService: JwtService;
  let configService: ConfigService;
  let fake: ReturnType<typeof buildFakePrisma>;

  const PLAIN_PASSWORD = 'ChangeMe123!';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PLAIN_PASSWORD, 4); // cost منخفض لتسريع الاختبارات فقط
  });

  beforeEach(() => {
    fake = buildFakePrisma();

    fake.users.set('user-1', {
      id: 'user-1',
      fullName: 'مستخدم تجريبي',
      username: 'testuser',
      email: 'test@example.com',
      passwordHash,
      isActive: true,
      userRoles: [{ role: { code: 'SALES' } }],
    });

    fakeUsersService = {
      findByUsername: jest.fn(async (username: string) => {
        const u = Array.from(fake.users.values()).find((x) => x.username === username);
        return (u ?? null) as any;
      }),
    };

    fakeRbacService = {
      getUserPermissionCodes: jest.fn(async (_userId: string) => [
        'sales.create_order',
        'sales.view_price',
      ]),
    };

    configService = new ConfigService({
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      JWT_REFRESH_EXPIRES_IN: '7d',
    });

    jwtService = new JwtService({});

    authService = new AuthService(
      fakeUsersService as unknown as UsersService,
      fakeRbacService as unknown as RbacService,
      jwtService,
      configService,
      fake.prisma,
    );
  });

  // -------------------------------------------------------------------
  // 1) Login صحيح
  // -------------------------------------------------------------------
  it('1) Login بمعلومات صحيحة يُرجع accessToken وrefreshToken وuser كاملًا', async () => {
    const result = await authService.login('testuser', PLAIN_PASSWORD);

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user).toMatchObject({
      id: 'user-1',
      fullName: 'مستخدم تجريبي',
      username: 'testuser',
      roles: ['SALES'],
      permissions: ['sales.create_order', 'sales.view_price'],
    });
    expect(fake.tokens.size).toBe(1); // صف Refresh Token واحد أُنشئ فعليًا
  });

  // -------------------------------------------------------------------
  // 2) Login بكلمة مرور خاطئة
  // -------------------------------------------------------------------
  it('2) Login بكلمة مرور خاطئة يرفض بـUnauthorizedException', async () => {
    await expect(authService.login('testuser', 'WrongPassword!')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(fake.tokens.size).toBe(0); // لا توكن يُصدَر عند فشل تسجيل الدخول
  });

  // -------------------------------------------------------------------
  // 3) Refresh صحيح
  // -------------------------------------------------------------------
  it('3) Refresh بتوكن صالح يُصدر accessToken وrefreshToken جديدين', async () => {
    const { refreshToken } = await authService.login('testuser', PLAIN_PASSWORD);

    const result = await authService.refresh(refreshToken, 'user-1');

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe(refreshToken); // توكن جديد فعليًا
  });

  // -------------------------------------------------------------------
  // 4) Refresh يعيد user + roles + permissions
  // -------------------------------------------------------------------
  it('4) Refresh يُرجع بيانات المستخدم كاملة (roles + permissions) مثل Login تمامًا', async () => {
    const { refreshToken } = await authService.login('testuser', PLAIN_PASSWORD);

    const result = await authService.refresh(refreshToken, 'user-1');

    expect(result.user).toMatchObject({
      id: 'user-1',
      username: 'testuser',
      roles: ['SALES'],
      permissions: ['sales.create_order', 'sales.view_price'],
    });
  });

  // -------------------------------------------------------------------
  // 5) Refresh Token Rotation
  // -------------------------------------------------------------------
  it('5) بعد Refresh ناجح، التوكن القديم يصبح revoked=true ومربوطًا بالجديد عبر replacedByTokenId', async () => {
    const { refreshToken: oldToken } = await authService.login('testuser', PLAIN_PASSWORD);
    const oldTokenRecord = Array.from(fake.tokens.values())[0];

    await authService.refresh(oldToken, 'user-1');

    expect(oldTokenRecord.revoked).toBe(true);
    expect(oldTokenRecord.replacedByTokenId).not.toBeNull();

    const newTokenRecord = fake.tokens.get(oldTokenRecord.replacedByTokenId!);
    expect(newTokenRecord).toBeDefined();
    expect(newTokenRecord!.revoked).toBe(false);
  });

  // -------------------------------------------------------------------
  // 6) استخدام Refresh Token قديم (بعد أن رُوتِن مرة واحدة)
  // -------------------------------------------------------------------
  it('6) إعادة استخدام توكن قديم بعد تدويره تُرفض (Unauthorized)', async () => {
    const { refreshToken: oldToken } = await authService.login('testuser', PLAIN_PASSWORD);
    await authService.refresh(oldToken, 'user-1'); // تدوير أول ناجح

    await expect(authService.refresh(oldToken, 'user-1')).rejects.toThrow(UnauthorizedException);
  });

  it('6ب) Reuse حقيقي (جيلان للخلف) يُبطل كل الجلسات بما فيها الجلسة الحالية الشرعية', async () => {
    const { refreshToken: gen1 } = await authService.login('testuser', PLAIN_PASSWORD);
    const { refreshToken: gen2 } = await authService.refresh(gen1, 'user-1'); // gen1 -> gen2
    const { refreshToken: gen3 } = await authService.refresh(gen2, 'user-1'); // gen2 -> gen3 (الشرعي الحالي)

    // محاولة استخدام gen1 الآن (جيلان للخلف عن gen3) — Reuse حقيقي
    await expect(authService.refresh(gen1, 'user-1')).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REUSE_DETECTED' },
    });

    // التأكيد الحاسم: gen3 (الجلسة الشرعية الحالية) أصبحت مُبطَلة أيضًا بسبب
    // سياسة الأمان (إبطال جماعي عند اكتشاف Reuse حقيقي) — وهذا متعمَّد وليس
    // خطأ (بعكس سيناريو السباق المتزامن في الاختبار رقم 9 أدناه).
    await expect(authService.refresh(gen3, 'user-1')).rejects.toThrow(UnauthorizedException);
  });

  // -------------------------------------------------------------------
  // 7) Logout
  // -------------------------------------------------------------------
  it('7) Logout يُبطل توكن الجلسة الحالية، ويصبح غير قابل للاستخدام بعدها', async () => {
    const { refreshToken } = await authService.login('testuser', PLAIN_PASSWORD);

    await authService.logout(refreshToken);

    await expect(authService.refresh(refreshToken, 'user-1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // -------------------------------------------------------------------
  // 8) User inactive
  // -------------------------------------------------------------------
  it('8) Refresh لمستخدم أصبح is_active=false يُرفض حتى لو كان التوكن صالحًا شكليًا', async () => {
    const { refreshToken } = await authService.login('testuser', PLAIN_PASSWORD);

    fake.users.get('user-1')!.isActive = false; // إيقاف المستخدم بعد إصدار التوكن

    await expect(authService.refresh(refreshToken, 'user-1')).rejects.toMatchObject({
      response: { code: 'USER_INACTIVE_OR_NOT_FOUND' },
    });
  });

  it('8ب) Login لمستخدم موقَف من الأساس يُرفض مباشرة', async () => {
    fake.users.get('user-1')!.isActive = false;

    await expect(authService.login('testuser', PLAIN_PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // -------------------------------------------------------------------
  // 9) Concurrent Refresh لنفس التوكن — جوهر الإصلاح المطلوب
  // -------------------------------------------------------------------
  it('9) طلبان متزامنان بنفس Refresh Token: واحد ينجح والآخر يُرفض، وجلسة الفائز تبقى صالحة', async () => {
    const { refreshToken: sharedToken } = await authService.login('testuser', PLAIN_PASSWORD);

    const [resultA, resultB] = await Promise.allSettled([
      authService.refresh(sharedToken, 'user-1'),
      authService.refresh(sharedToken, 'user-1'),
    ]);

    const outcomes = [resultA, resultB];
    const fulfilled = outcomes.filter((r) => r.status === 'fulfilled');
    const rejected = outcomes.filter((r) => r.status === 'rejected');

    // === النتيجة المطلوبة صراحة: واحد فقط ينجح، والآخر يُرفض ===
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(UnauthorizedException);
    // يجب أن يُصنَّف كـ"سباق متزامن" تحديدًا، وليس "Reuse" — تمييز مطلوب صراحة
    expect(rejectedReason.response.code).toBe('REFRESH_TOKEN_CONCURRENT_RACE_LOST');

    // === الشرط الحاسم المُصلَح في هذه الجولة: جلسة الفائز تبقى سليمة ===
    const winnerNewRefreshToken = (fulfilled[0] as PromiseFulfilledResult<any>).value
      .refreshToken as string;

    // التوكن الجديد للفائز يجب أن يعمل بنجاح في طلب Refresh لاحق —
    // إثبات عملي أنه لم يُبطَل بالخطأ بسبب فشل الطلب B
    await expect(
      authService.refresh(winnerNewRefreshToken, 'user-1'),
    ).resolves.toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });
});
