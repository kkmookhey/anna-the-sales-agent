/** Shrink-to-fit ratio for a slide's content block.
 *
 *  Returns 1 when the content already fits the available band (no scaling), otherwise the
 *  ratio needed to fit — clamped to `minScale` so text never shrinks below a readable floor.
 *  Non-positive inputs (a slide we couldn't measure) return 1 — never scale on bad data. */
export function fitScale(naturalHeight: number, availableHeight: number, minScale = 0.62): number {
  if (!(naturalHeight > 0) || !(availableHeight > 0)) return 1;
  if (naturalHeight <= availableHeight) return 1;
  return Math.max(minScale, availableHeight / naturalHeight);
}
