import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RbacService } from '../rbac/rbac.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthUserResponse {
  id: string;
  fullName: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUserResponse;
}

/**
 * AuthService — دورة حياة المصادقة كاملة: تسجيل دخول → إصدار Access+Refresh
 * → تجديد (مع Rotation) → تسجيل خروج (Revocation).
 *
 * Refresh Token Security (إصلاح مطلوب #4):
 * - لا يُخزَّن أي Refresh Token كنص خام في قاعدة البيانات — فقط SHA-256 Hash.
 * - Rotation: كل استخدام ناجح لـRefresh Token يُبطِله فورًا (revoked=true)
 *   ويُصدر واحدًا جديدًا بدلًا منه. لا يمكن استخدام نفس التوكن مرتين.
 * - Reuse Detection: إذا وصل توكن مُبطَل مسبقًا (يعني تسريبًا محتملًا)،
 *   تُبطَل كل جلسات هذا المستخدم فورًا كإجراء احترازي، ويُرفض الطلب.
 * - Concurrent Refresh Protection: "المطالبة" بالتوكن قبل إصدار جلسة جديدة
 *   هي عملية UPDATE ذرّية واحدة بشرط `revoked=false` — لا قراءة-ثم-كتابة
 *   منفصلتين. لو استُخدم نفس التوكن من طلبين متزامنين، واحد فقط ينجح
 *   (count=1) والآخر يُرفض فورًا (count=0) بضمان من محرك PostgreSQL نفسه.
 * - عند Logout: يُبطَل توكن الجلسة الحالية تحديدًا (وليس كل الأجهزة).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private rbacService: RbacService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async validateCredentials(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message_ar: 'اسم المستخدم أو كلمة المرور غير صحيحة',
      });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message_ar: 'اسم المستخدم أو كلمة المرور غير صحيحة',
      });
    }

    return user;
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const user = await this.validateCredentials(username, password);
    return this.buildAuthResult(user.id);
  }

  /**
   * refresh — يُستدعى بعد أن يتحقق JwtRefreshStrategy من صحة توقيع/انتهاء
   * التوكن. هنا التحقق الإضافي الحاسم: هل التوكن (بصيغة Hash) لا يزال
   * موجودًا وغير مُبطَل في قاعدة البيانات؟ ثم Rotation فوري وذرّي.
   *
   * === إصلاح Race Condition (مطلوب صراحة) ===
   * التسلسل السابق كان: قراءة الحالة → تحقق في الكود → كتابة الإبطال —
   * ثلاث خطوات منفصلة تفتح نافذة زمنية حقيقية يمكن لطلبين متزامنين
   * استغلالها معًا بنفس التوكن قبل أن يُسجَّل أيهما كإبطال.
   *
   * الإصلاح: عملية "المطالبة" بالتوكن (Claim) أصبحت جملة UPDATE ذرّية
   * واحدة (`updateMany` بشرط `revoked: false` ضمن نفس الاستعلام)، بنفس
   * النمط المعتمد أصلًا في تصميم قاعدة البيانات لحجز المخزون
   * (Atomic Compare-and-Swap عبر `UPDATE ... WHERE`). محرك PostgreSQL
   * يُنفّذ أي تحديثين متزامنين لنفس الصف بالتتابع (قفل على مستوى الصف)،
   * فينجح أحدهما فقط (count=1) ويفشل الآخر فورًا (count=0) لأن شرط
   * `revoked: false` لم يعد متحققًا له — بلا أي فحص توقيت في JavaScript.
   */
  async refresh(rawRefreshToken: string, userId: string): Promise<AuthResult> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRecord || tokenRecord.userId !== userId) {
      // توكن غير معروف لهذا المستخدم — لا يوجد ما نُبطله، رفض فقط
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_UNKNOWN',
        message_ar: 'انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجددًا',
      });
    }

    // === المطالبة الذرية (Atomic Claim) — نقطة الحماية من Race Condition ===
    // جملة SQL واحدة: UPDATE refresh_tokens SET revoked=true
    //                  WHERE id=$1 AND revoked=false AND expires_at > now()
    // لو وصل طلبان بنفس التوكن في نفس اللحظة تمامًا، Postgres يُنفّذهما
    // بالتتابع داخليًا؛ الأول يُحدِّث الصف وينجح (count=1)، والثاني يُعيد
    // تقييم شرط WHERE بعد أن أصبح revoked=true فعلًا فلا يتطابق أي صف
    // (count=0) — نتيجة حتمية على مستوى قاعدة البيانات، وليست افتراضًا
    // زمنيًا من الكود.
    const claim = await this.prisma.refreshToken.updateMany({
      where: { id: tokenRecord.id, revoked: false, expiresAt: { gt: new Date() } },
      data: { revoked: true },
    });

    if (claim.count === 0) {
      // الاستحواذ الذري فشل — لكن السبب يحتاج تشخيصًا دقيقًا قبل أي رد فعل،
      // لتفادي إبطال جلسة فائز شرعي في سباق متزامن حميد (المشكلة المُبلَّغ
      // عنها). نُفرِّق بين حالتين بفحص حالة السجل الفعلية الآن:
     

let currentRecord = await this.prisma.refreshToken.findUnique({
  where: { id: tokenRecord.id },
});

if (currentRecord?.revoked && !currentRecord.replacedByTokenId) {
  await new Promise((resolve) => setTimeout(resolve, 10));

  currentRecord = await this.prisma.refreshToken.findUnique({
    where: { id: tokenRecord.id },
  });
}

      if (currentRecord?.revoked && currentRecord.replacedByTokenId) {
        const descendant = await this.prisma.refreshToken.findUnique({
          where: { id: currentRecord.replacedByTokenId },
        });

        if (descendant && !descendant.revoked && descendant.expiresAt > new Date()) {
          // === سباق متزامن حميد (Benign Concurrent Race) ===
          // هذا التوكن أُبطِل للتو ضمن عملية Rotation واحدة، وخليفته
          // المباشر لا يزال نشطًا وصالحًا — توقيع دقيق لـ"خسارة سباق"
          // وليس إعادة استخدام. لا نُبطل أي جلسة أخرى إطلاقًا (جلسة
          // الفائز — بما فيها الخليفة أعلاه — تبقى سليمة تمامًا)؛ فقط
          // نرفض هذا الطلب الخاسر تحديدًا.
          this.logger.debug(
            `سباق Refresh متزامن للمستخدم ${userId} — رفض الطلب الخاسر دون المساس بجلسة الفائز`,
          );
          throw new UnauthorizedException({
            code: 'REFRESH_TOKEN_CONCURRENT_RACE_LOST',
            message_ar: 'تم استخدام هذا الرمز بالفعل في طلب متزامن آخر',
          });
        }

        // الخليفة نفسه مُبطَل أيضًا (أو منتهٍ) — أي أن السلسلة تجاوزت هذا
        // التوكن بأكثر من جيل واحد. هذا لا يمكن تفسيره بسباق بسيط، بل
        // Reuse حقيقي لتوكن قديم بعد أن تحرك المستخدم الشرعي عدة خطوات
        // للأمام — مؤشر سرقة معقول. تُطبَّق سياسة الأمان المعتمدة: إبطال
        // كل الجلسات النشطة (بما فيها الجلسة "الحالية" الشرعية، لأن عدم
        // اليقين الأمني هنا يبرر فرض تسجيل دخول جديد).
        await this.revokeAllUserTokens(userId);
        this.logger.warn(
          `تم اكتشاف إعادة استخدام حقيقي (Reuse) لتوكن قديم للمستخدم ${userId} — تم إبطال كل جلساته`,
        );
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_REUSE_DETECTED',
          message_ar: 'تم اكتشاف نشاط مشبوه، الرجاء تسجيل الدخول مجددًا لأسباب أمنية',
        });
      }

      // حالات متبقية بلا خليفة مسجَّل (مثال: توكن أُبطِل يدويًا عبر Logout،
      // أو انتهت صلاحيته فعليًا، أو تم إبطاله ضمن Reuse سابق بالفعل) —
      // رفض عادي دون أي إبطال جماعي إضافي (لا فائدة أو غير ضروري أصلًا).
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message_ar: 'انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجددًا',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      // المستخدم أصبح موقوفًا — التوكن مُبطَل فعلًا أعلاه (Claim تم بنجاح)،
      // فقط نرفض إصدار جلسة جديدة له
      throw new UnauthorizedException({
        code: 'USER_INACTIVE_OR_NOT_FOUND',
        message_ar: 'انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجددًا',
      });
    }

    // بعد نجاح المطالبة الذرية بحصرية هذا التوكن، إصدار الجلسة الجديدة
    // وربط سلسلة الاستبدال (Rotation Chain) — لا حاجة لأي شرط إضافي هنا
    // لأننا نملك حصريًا حق التصرف في هذا التوكن الآن.
    const result = await this.buildAuthResult(userId);

    const newTokenHash = this.hashToken(result.refreshToken);
    const newTokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: newTokenHash },
    });

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { replacedByTokenId: newTokenRecord?.id },
    });

    return result;
  }

  /** logout — يُبطل توكن الجلسة الحالية فقط (وليس كل أجهزة المستخدم) */
  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  private async buildAuthResult(userId: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    const permissions = await this.rbacService.getUserPermissionCodes(userId);
    const tokens = await this.issueTokens(userId, user.username, permissions);

    return {
      ...tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        roles: user.userRoles.map((ur) => ur.role.code),
        permissions,
      },
    };
  }

  private async issueTokens(
    userId: string,
    username: string,
    permissions: string[],
  ): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, username, permissions },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );

    // === jti فريد (Step 6.2 — إصلاح ثغرة كامنة حقيقية، ليست تراجعًا) ===
    // بدون jti، توكنان يُصدَران لنفس المستخدم ضمن نفس الثانية (نفس sub،
    // نفس iat بدقة الثانية، نفس exp) يُنتجان نفس الـJWT حرفيًا (التوقيع
    // حتمي)، فيتطابق tokenHash فيهما ويصطدمان بقيد unique على token_hash.
    // crypto.randomUUID() يضمن اختلاف الـpayload دائمًا، بصرف النظر عن التوقيت.
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti: crypto.randomUUID() },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    );

    // استخراج exp من التوكن نفسه بدل إعادة تفسير "7d" يدويًا — دقة مضمونة
    const decoded = this.jwtService.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
