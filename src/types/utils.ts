// ==================== Utility Types ====================
// ユーティリティ型定義

/**
 * オプショナルプロパティをすべて必須にする
 */
export type Required<T> = {
  [P in keyof T]-?: T[P];
};

/**
 * すべてのプロパティをオプショナルにする
 */
export type Partial<T> = {
  [P in keyof T]?: T[P];
};

/**
 * 読み取り専用のプロパティにする
 */
export type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

/**
 * 特定のプロパティを除外する
 */
export type Omit<T, K extends keyof T> = {
  [P in Exclude<keyof T, K>]: T[P];
};

/**
 * 特定のプロパティのみを取得する
 */
export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

/**
 * 深い読み取り専用
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? DeepReadonlyArray<U>
    : T[P] extends Record<string, unknown>
    ? DeepReadonly<T[P]>
    : T[P];
};

/**
 * 深い読み取り専用配列
 */
export interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

/**
 * 非 null、非 undefined の型
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * 関数の引数の型
 */
export type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * 関数の戻り値の型
 */
export type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;

/**
 * Promiseの解決値の型
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * 条件付き型
 */
export type Conditional<T, U, Y, N> = T extends U ? Y : N;

/**
 * JSONシリアライゼーション可能な型
 */
export type JSONSerializable = 
  | string 
  | number 
  | boolean 
  | null 
  | JSONSerializableObject 
  | JSONSerializableArray;

/**
 * JSONシリアライゼーション可能なオブジェクト
 */
export interface JSONSerializableObject {
  [key: string]: JSONSerializable;
}

/**
 * JSONシリアライゼーション可能な配列
 */
export interface JSONSerializableArray extends Array<JSONSerializable> {}

/**
 * 列挙型の値の型
 */
export type EnumValues<T> = T[keyof T];

/**
 * 文字列リテラル型のUnion
 */
export type StringLiteral<T extends string> = T;

/**
 * 数値リテラル型のUnion
 */
export type NumberLiteral<T extends number> = T;

/**
 * タプル型からUnion型への変換
 */
export type TupleToUnion<T extends readonly unknown[]> = T[number];

/**
 * オブジェクトのキーのUnion型
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * 値の型からキーを取得
 */
export type KeysByValue<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * 関数のオーバーロード用
 */
export interface Overload {
  (...args: any[]): any;
}

/**
 * 関数のオーバーロードの最後の型を取得
 */
export type Last<T> = T extends readonly [...unknown[], infer R] ? R : never;

/**
 * 関数のオーバーロードをすべて取得
 */
export type OverloadedReturnType<T> = T extends {
  (...args: any[]): infer R1;
  (...args: any[]): infer R2;
  (...args: any[]): infer R3;
  (...args: any[]): infer R4;
} ? R1 | R2 | R3 | R4 : T extends {
  (...args: any[]): infer R1;
  (...args: any[]): infer R2;
  (...args: any[]): infer R3;
} ? R1 | R2 | R3 : T extends {
  (...args: any[]): infer R1;
  (...args: any[]): infer R2;
} ? R1 | R2 : T extends (...args: any[]) => infer R ? R : never;

/**
 * 型安全なキー生成
 */
export type SafeKey<T, K extends keyof T = keyof T> = K;

/**
 * 型ガード関数の型
 */
export type TypeGuard<T, U extends T> = (value: T) => value is U;

/**
 * アサーション関数の型
 */
export type AssertionFunction<T> = (value: unknown) => asserts value is T;

/**
 * 遅延評価の型
 */
export type Lazy<T> = () => T;

/**
 * キャッシュされた値の型
 */
export interface Cached<T> {
  readonly value: T;
  readonly timestamp: Date;
  readonly isExpired: boolean;
}