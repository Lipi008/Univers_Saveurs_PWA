/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#2B1813',
    tint: '#8C2F24',

    // Core surfaces
    background: '#FFF9F0',
    foreground: '#2B1813',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#2B1813',

    // Primary action color (buttons, links, active states)
    primary: '#8C2F24',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#F7EAD2',
    secondaryForeground: '#5B281E',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#F4EBDD',
    mutedForeground: '#8C756C',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#D6A73A',
    accentForeground: '#3C251A',

    // Destructive actions (delete, error states)
    destructive: '#B83A2F',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#EBDDC9',
    input: '#E2CFB4',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
