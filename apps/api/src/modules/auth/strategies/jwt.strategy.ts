import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

export interface JwtAccessPayload {
  sub: string; // userId
  username: string;
  permissions: string[];
}

/**
 * JwtStrategy — يتحقق من Access Token المُرسَل في Authorization Header.
 * لا يُخزَّن الـAccess Token في أي مكان على الخادم (Stateless) —
 * التحقق يعتمد فقط على التوقيع (Signature) وتاريخ الانتهاء.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtAccessPayload): Promise<CurrentUserPayload> {
    // ما يُرجَع هنا يُحقَن تلقائيًا في request.user (يُستخدم في @CurrentUser() وPermissionsGuard)
    return {
      userId: payload.sub,
      username: payload.username,
      permissions: payload.permissions,
    };
  }
}
