export interface TwoFactorGateway {
  consumeRecoveryCode(userId: string, code: string): Promise<boolean>;
}
