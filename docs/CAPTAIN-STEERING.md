# Captain steering

The decorative Captain uses the existing resolved Ship View lifecycle and the
original five appearance variants from `captains-caribbean.png`. Flag changes
select matching artwork in both lookout and helm poses. The Captain's SVG title
uses the current Supervisor name as text; no Supervisor settings, persistence,
execution logic, provider calls, or Soundtrack behavior are changed. The current
Supervisor settings provide a name, not an arbitrary custom portrait field.

| Resolved lifecycle | Captain |
| --- | --- |
| Idle / neutral | Telescope lookout |
| Preparing | Static ready position at the helm |
| Running / visual resuming | Hands and wheel turn together with body counterlean |
| Pausing / checkpoint | Static resting hold on the wheel |
| Completed | Returns to lookout |
| Failed / blocked checkpoint | Restrained lowered, leaning helm pose |

Running always uses the helm in every weather condition. Weather adjusts only
decorative intensity: calm steering is ±5 degrees over seven seconds; storms are
±20 degrees over four seconds, with stronger counterlean and vessel roll sharing
the same cadence. The actual wheel hub and hands are isolated from the original
artwork using complementary circular masks, so the scene contains one wheel,
with both gripping hands moving around its hub. The body moves independently.

A blocked checkpoint is distinguished from an ordinary pause using its precise
`blocked worker` reason and BLOCKED slices belonging to the selected current
MegaTask. A technical BLOCKED result from user Stop and waiting dependencies
alone retain the resting pose. Historical results and
foreign slices cannot select that reaction, and resumed RUNNING work always
steers regardless of a previous blocker. The existing lifecycle resolver remains
unchanged.

Reduced/Off and the OS reduced-motion preference disable all these animations
through the existing Harbor motion gates. Static lifecycle poses remain visible.
Hidden pages use the existing suspension rule.

## Verification

- `node engine/captain.test.cjs`: passes selected-project state and Supervisor
  identity propagation, decorative weather independence, and Off state retention
  through the public Harbor UI boundary with a small DOM fixture.
- `node verify-harbor.cjs` and `node engine/ship.test.cjs`: existing checks pass.
- `node scripts/engineering/captain.test.cjs` runs those three focused checks
  together and is automatically discovered by the existing engineering CI.
- `verify-ship-browser.cjs` now checks rendered helm/lookout lifecycle poses,
  wheel and body animation names, changing wheel transforms between frames,
  calm/storm intensity and coordinated duration, static Reduced/Off poses,
  text-only configured Supervisor identity, and the distinct failure pose. It
  records calm/storm frame pairs using actual Chromium and an isolated backend
  with fixture worker liveness. No provider is called.

The direct Chrome run in this environment failed at the blank-page renderer
smoke check (`CDP timeout Runtime.evaluate`), before application navigation.
It does not establish a passing browser regression run. The full browser suite
remains runnable in a functioning Chrome/Edge environment with
`PLANWHARF_TEST_BROWSER` and `PLANWHARF_VALIDATION_DIR` set.

Separate observation in the application's browser used an isolated real HTTP
backend and a fixture RUNNING worker. Calm and storm screenshots were observed,
including two frames per condition. The wheel visibly changed angle; computed
cadence was seven seconds in calm and four seconds in storms. Reduced and Off
retained the helm while wheel/body animation was `none`. These observations and
screenshots are separate evidence from the automated assertions, and do not
claim a paid provider run or cross-browser certification.
