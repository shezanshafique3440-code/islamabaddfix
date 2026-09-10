/**
 * Structured-data helpers.
 */

/**
 * Serialize a JSON-LD object for embedding in a `<script>` tag.
 *
 * `JSON.stringify` on its own is not safe here. These documents carry
 * provider-supplied text — business name, headline, description — and a value
 * containing `</script>` closes the tag early, turning everything after it into
 * markup the page author never wrote. That is stored XSS reachable by anyone who
 * can complete provider onboarding.
 *
 * Escaping the characters that can open a tag or an entity removes the escape
 * hatch without changing the data: `<` parses back to `<`, so consumers see
 * exactly the string that was stored. U+2028/U+2029 are escaped too, for
 * consumers that evaluate the block as JavaScript rather than parsing it as JSON.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
