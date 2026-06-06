/**
 * Format a passenger name as first initial + last name for compact display.
 *
 * Examples:
 *   "Dr J Tewson"       → "J. Tewson"
 *   "Miss S Mascarenhas" → "S. Mascarenhas"
 *   "Mr D Poncet"       → "D. Poncet"
 *   "Mr T Clifton"      → "T. Clifton"
 *   "Ms A Johnson"      → "A. Johnson"
 *   "John Smith"        → "J. Smith"        (no title)
 *   "Dr J Tewson & Mr D Poncet" → "J. Tewson & D. Poncet"  (& separator)
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
