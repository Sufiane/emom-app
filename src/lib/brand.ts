declare const __brand: unique symbol;

export type Brand<T, K extends string> = T & { readonly [__brand]: K };
