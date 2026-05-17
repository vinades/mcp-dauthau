/**
 * Ambient type declaration cho optional dependency `bcrypt`.
 * Chi tiết type đủ để sign.ts lazy-import mà không cần @types/bcrypt.
 * bcrypt là optionalDependency — lazy load chỉ khi DAUTHAU_HASH_ALGO=bcrypt.
 */
declare module "bcrypt" {
  export function hash(data: string, saltOrRounds: number | string): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;
}
