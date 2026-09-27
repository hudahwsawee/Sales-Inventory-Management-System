import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';

const REFRESH_COOKIE_NAME = 'refresh_token';

@ApiTags('Auth — المصادقة')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'تسجيل الدخول — يُرجع Access Token ويضبط Refresh Token في Cookie' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto.username,
      dto.password,
    );

    this.setRefreshCookie(res, refreshToken);

    // Access Token يُرجَع في جسم الاستجابة فقط — الواجهة تحفظه في الذاكرة،
    // ليس LocalStorage (قرار معتمد صراحة)
    return { accessToken, user };
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @ApiOperation({
    summary:
      'تجديد Access Token وبيانات المستخدم باستخدام Refresh Token من الـCookie — يُستخدم أيضًا لاستعادة الجلسة بعد تحديث الصفحة (F5)',
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = (req.user as { userId: string }).userId;
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string;
    const { accessToken, refreshToken, user } = await this.authService.refresh(
      rawRefreshToken,
      userId,
    );

    this.setRefreshCookie(res, refreshToken);

    return { accessToken, user };
  }

  @Post('logout')
  @ApiOperation({ summary: 'تسجيل الخروج — إبطال Refresh Token في قاعدة البيانات وإزالة الـCookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await this.authService.logout(rawRefreshToken);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
    return { message_ar: 'تم تسجيل الخروج بنجاح' };
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProd, // HTTPS إلزامي في الإنتاج
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام — يطابق JWT_REFRESH_EXPIRES_IN
    });
  }
}
