// Health data responses exclude authentication material and legacy bearer URLs.
const secretField = /^(password|passwordHash|initialPassword|credentials|accessToken|refreshToken|token|tokenHash|authorization|sessionVersion|jti|objectKey|bucket|privateKey|apiKey|secret)$/i;
export function businessProjection<T>(value: T): T {
  const visit = (item: any): any => {
    if (item === null || item === undefined) return item;
    if (item instanceof Date) return item;
    if (typeof item === 'string') return /^(https?:|data:|\/api\/v1\/media\/)/i.test(item) ? '[旧附件待受控关联]' : item;
    if (typeof item !== 'object') return item;
    if (typeof item.toJSON === 'function') return visit(item.toJSON());
    if (Array.isArray(item)) return item.map(visit);
    return Object.fromEntries(Object.entries(item).filter(([key]) => !secretField.test(key)).map(([key,child]) => [key,visit(child)]));
  };
  return visit(value);
}
