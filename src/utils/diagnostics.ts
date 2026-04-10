/**
 * Diagnostic knowledge base for compile and linker errors.
 * Portions adapted from @toponextech/smartembed-mcp-server under MIT attribution.
 *
 * Copyright (c) ToponexTech. Licensed under the MIT License.
 *
 * Provides:
 * - DiagnosticSummary: Interface representing a structured error payload
 * - diagnoseError: Analyzes stderr to produce a structured DiagnosticSummary
 * - errorPatterns: Constant array of standard compilation error matchers
 */

/**
 * Represents a structured response for a captured compilation error
 */
export interface DiagnosticSummary {
  errorType:
    | "MissingHeader"
    | "MemoryOverflow"
    | "PortBusy"
    | "SyntaxError"
    | "LinkingError"
    | "Unknown";
  summary: string;
  truncatedStderr: string;
}

/**
 * Array of regex matchers and solutions for common PlatformIO/C++ compile errors
 */
const errorPatterns = [
  {
    pattern: /Missing header file:.*|No such file or directory.*\.h/i,
    type: "MissingHeader" as const,
    summary: "A required library or header file is missing.",
  },
  {
    pattern:
      /'Serial' was not declared|'WiFi' was not declared|does not name a type/i,
    type: "MissingHeader" as const,
    summary:
      "A core object (e.g. Serial or WiFi) was not declared. Missing include or incorrect board framework.",
  },
  {
    pattern:
      /region.*RAM.*overflowed|region.*Flash.*overflowed|Sketch too big/i,
    type: "MemoryOverflow" as const,
    summary:
      "The program uses too much RAM or Flash memory for the target board.",
  },
  {
    pattern:
      /Error opening.*Permission denied|Access is denied|Permission denied.*ttyUSB/i,
    type: "PortBusy" as const,
    summary:
      "Cannot access the serial port due to missing permissions or the port is already busy.",
  },
  {
    pattern: /expected.*before.*token/i,
    type: "SyntaxError" as const,
    summary:
      "Syntax error detected (likely missing a semicolon, bracket, or parenthesis).",
  },
  {
    pattern:
      /undefined reference to.*setup|undefined reference to.*loop|multiple definition of/i,
    type: "LinkingError" as const,
    summary:
      "Linking failed. Expected setup/loop functions are missing, or duplicate definitions exist.",
  },
];

/**
 * Analyzes a raw stderr string from PlatformIO compilation and categorizes the failure
 * @param stderr The raw standard error string
 * @returns A structured DiagnosticSummary object avoiding context ballooning
 */
export function diagnoseError(stderr: string): DiagnosticSummary {
  if (!stderr || stderr.trim() === "") {
    return {
      errorType: "Unknown",
      summary: "An unknown error occurred with no stderr output.",
      truncatedStderr: "",
    };
  }

  for (const entry of errorPatterns) {
    if (entry.pattern.test(stderr)) {
      // Find the first line that matches the pattern for a concise truncated log
      const lines = stderr.split("\n");
      const matchLine =
        lines.find((line) => entry.pattern.test(line)) ||
        stderr.substring(0, 300);

      return {
        errorType: entry.type,
        summary: entry.summary,
        truncatedStderr: matchLine.trim(),
      };
    }
  }

  return {
    errorType: "Unknown",
    summary: "An unclassified compilation or CLI error occurred.",
    truncatedStderr:
      stderr.length > 300 ? stderr.substring(0, 300) + "..." : stderr.trim(),
  };
}
