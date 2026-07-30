/**
 * Plate node keys for the snippet types.
 *
 * Kept apart from the plugin modules so the serialization rules can import a
 * key without pulling in the React components those modules also export.
 */
export const KEY_SHORTCODE = "shortcode";
export const KEY_SHORTCODE_INLINE = "shortcode_inline";

export const KEY_JSX_BLOCK = "jsx_block";
export const KEY_JSX_INLINE = "jsx_inline";

export const KEY_HTML_BLOCK = "html_block";
export const KEY_HTML_INLINE = "html_inline";
