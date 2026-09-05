/**
 * Translittère les accents, passe en minuscule, remplace tout ce qui n'est
 * pas [a-z0-9] par `-`, réduit les tirets consécutifs, trim les tirets.
 * Si le résultat est vide, retourne `"histoire"`.
 */
export function slugify(input: string): string {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.length > 0 ? normalized : "histoire";
}
