<plan_state>status=done</plan_state>

## Overview
This source app is a small frontend-only React application. It renders a single full-screen `StarterCanvas` experience from `App.tsx` and does not depend on any external data services or backend code.

## Services to resolve

| service | role | source signals | candidate resource type(s) | resolved |
| --- | --- | --- | --- | --- |

## Routes & pages

| route | page file | purpose | auth required |
| --- | --- | --- | --- |
| / | /imported-source/frontend/App.tsx | Render the full-screen starter canvas experience. | no |

## Component tree

- `App`
  - `StarterCanvas` (stateful)

## Source → target mapping

| source path | target path | class | transform notes |
| --- | --- | --- | --- |
| /imported-source/frontend/components/StarterCanvas.tsx | /frontend/components/StarterCanvas.tsx | A | byte-identical copy |
| /imported-source/frontend/App.tsx | /frontend/App.tsx | A | byte-identical copy |

## Styling & theming adapters
The source app uses plain React with inline styles and a WebGL canvas shader implementation. A source `orgTheme.css` file exists, but the app does not import it; the runtime visuals are driven directly by the canvas shader colors and the inline full-screen shell styles in `App.tsx`.

## Dependency delta

None.

## Cut list

- `/imported-source/package.json` — source root manifest only; not runtime code.
- `/imported-source/frontend/package.json` — source manifest only; the sandbox already provides the needed dependencies.
- `/imported-source/frontend/orgTheme.css` — not imported because `/frontend/orgTheme.css` is a read-only system file and the source app does not reference this file.

## Open questions

None.

## Phased build order

1. Port `/imported-source/frontend/components/StarterCanvas.tsx` to `/frontend/components/StarterCanvas.tsx`.
2. Port `/imported-source/frontend/App.tsx` to `/frontend/App.tsx`.
