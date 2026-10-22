// Features that are built, tested and deliberately switched off.
//
// A flag here is not a half-finished feature: the code behind it is complete
// and its tests still run (they mock this module to turn it on), so flipping
// the constant is the whole of re-enabling it. Anything that is genuinely
// unbuilt belongs in ROADMAP.md instead.
//
// Annotated `: boolean` on purpose. Without it the constant has the literal
// type `false`, TypeScript narrows every branch behind it to unreachable, and
// the comparisons inside the dormant code start erroring as "unintentional" --
// which would make the switched-off path stop compiling and quietly rot.

/**
 * The Time / Pace / GAP segmented control on the dashboard's goal field.
 *
 * Off since 2026-09-17. Three toggles were never the problem; two of them
 * crowded together on one line in a narrow sidebar was, and between the goal
 * mode and the distance unit the goal mode is the one a runner can do without:
 * every mode collapses to the same `goalTimeSeconds` before it reaches the
 * engine or the URL, so nothing downstream, and no shared link, can tell the
 * difference. With this off the dashboard asks for a finish time exactly as
 * the homepage hero does.
 *
 * Turning it back on restores the control, the stored mode preference, and the
 * pace/GAP fields with it. `InputForm.goalMode.test.tsx` covers that path.
 */
export const GOAL_INPUT_MODES_ENABLED: boolean = false;
