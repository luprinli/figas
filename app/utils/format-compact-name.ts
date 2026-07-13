/**
 * Format a passenger name as first initial + last name for compact display.
 *
 * Examples:
 *   "Dr J Tewson"       \u2192 "J. Tewson"
 *   "Miss S Mascarenhas" \u2192 "S. Mascarenhas"
 *   "Mr D Poncet"       \u2192 "D. Poncet"
 *   "Mr T Clifton"      \u2192 "T. Clifton"
 *   "Ms A Johnson"      \u2192 "A. Johnson"
 *   "John Smith"        \u2192 "J. Smith"        (no title)
 *   "Dr J Tewson & Mr D Poncet" \u2192 "J. Tewson & D. Poncet"  (& separator)
 */
export function formatCompactName(name: string): string {
    // Handle "&" separated names
    if (name.includes("&")) {
        return name.split("&").map((n) => formatCompactName(n.trim())).join(" & ");
    }

    // Strip title (Dr, Mr, Mrs, Miss, Ms)
    const titleMatch = name.match(/^(Dr|Mr|Mrs|Miss|Ms)\.?\s+(.+)/);
    if (titleMatch) {
        const rest = titleMatch[2].trim();
        const parts = rest.split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ");
        return `${firstName.charAt(0)}. ${lastName}`;
    }

    // No title — just first initial + last name
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0].charAt(0)}. ${parts.slice(1).join(" ")}`;
}
