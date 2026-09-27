import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

export interface JwtRefreshPayload {
  sub: string; // userId
}

/**
 * JwtRefreshStrategy — يستخرج Refresh Token من httpOnly Cookie تحديدًا
 * (وليس من Header) — تطبيقًا حرفيًا للقرار المعتمد:
 * "Refresh Token في httpOnly Secure Cookie".
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: (req: Request) => req?.cookies?.refresh_token ?? null,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtRefreshPayload) {
    return { userId: payload.sub };
  }
}
