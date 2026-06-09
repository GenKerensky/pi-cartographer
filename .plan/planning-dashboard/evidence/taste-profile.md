## Default taste profile

The default taste profile should be written in design terminology so designer and critic agents can reason about it consistently.

### Preferred visual language

Prefer:

- **dark UI / dark mode as the default visual foundation**
- **modern skeuomorphism** and **tactile UI** over flat design
- selective **neumorphic / soft-UI depth** where it improves affordance and does not reduce contrast
- strong **materiality**: surfaces should feel layered, touchable, and semi-physical
- visible **depth cues**: elevation, drop shadows, highlights, bevels, inner shadows, ambient occlusion, edge lighting
- clear **perceived affordances**: controls should look like they can be pressed, dragged, toggled, opened, or manipulated
- strong **signifiers**: shape, lighting, labels, icons, color, texture, and motion should communicate what can be done
- immediate **feedback**: every meaningful user action should visibly respond

The UI should feel like a semi-3D control surface. Buttons should depress. Cards should lift. Menus, sidebars, drawers, and modals should move in and out with polished easing. Hover states should glow, brighten, reveal, or light up. Active/pressed states should darken, compress, inset, or otherwise feel physically pressed.

### Interaction philosophy: the interface should not ignore the user

The core interaction principle comes from Gabe Newell’s explanation of Valve’s “theory of fun” while making _Half-Life_. He described fun as the degree to which the game recognizes and responds to the player’s choices/actions. Discussing bullet holes on walls, he said that without them, **“it feels like the wall is ignoring me. I'm getting a narcissistic injury when the world is ignoring me.”** Source: PC Gamer summary of Valve’s _Half-Life_ 25th anniversary documentary.

For this skill, apply that principle to UI design:

- if a user hovers something interactive, it should acknowledge the hover
- if a user clicks/taps a control, it should visibly press, toggle, ripple, glow, move, or change state
- if a user opens a menu/modal/sidebar, the motion should make spatial sense
- if a user submits, loads, filters, expands, drags, or changes a value, the system should show cause and effect
- if an element looks interactive but does nothing, that is a broken promise

The critic should penalize “dead” UI: controls that look interactive but do not respond, state changes with no feedback, hidden affordances without signifiers, or decorative motion that masks a lack of real interactivity.

### Motion design preferences

Use **purposeful motion**, **microinteractions**, and **interaction feedback**. Motion should communicate state, causality, hierarchy, or spatial continuity.

Preferred motion qualities:

- smooth **ease-out/deceleration** for entrances
- quick but natural **ease-in/acceleration** for exits
- **ease-in-out / standard curves** for moving elements already on screen
- spring-like motion for small tactile controls where appropriate
- modal/sidebar/drawer transitions that preserve spatial relationships
- hover/press/focus animations in the 100-250ms range when possible
- larger layout transitions in the 200-500ms range when useful
- respect reduced-motion patterns where practical

Avoid:

- random background animation
- objects flying around for no reason
- motion that competes with the content
- loops that distract from reading or decision-making
- gratuitous parallax/particles/noise that does not clarify anything

Animation should answer: **what changed, why did it change, and what can I do next?**

### Color system preferences

Use color as a **functional categorization and wayfinding system**, not just decoration.

Prefer:

- dark neutral surfaces as the base
- color accents for categories, tabs, outlines, badges, highlights, and related controls
- repeated category colors so users can quickly find related information or inputs
- semantic color roles for state: success, warning, danger, info
- enough contrast that colored categories remain legible in dark mode
- color paired with labels/icons/shapes so meaning does not rely on color alone

The critic should reward designs where color creates clear information architecture and visual grouping. A good page should let the user find “the blue analytics stuff,” “the amber warning controls,” or “the purple automation section” quickly because category color is applied consistently.

### Disliked aesthetics

Strongly avoid:

- flat design when it removes affordance, feedback, or materiality
- Corporate Memphis / Alegria-style generic vector people and bland startup illustration language
- generic SaaS sameness
- sterile white-background dashboards unless explicitly requested
- gratuitous glassmorphism/gradients/noise that do not serve the concept
- low-contrast neumorphism that looks pretty but fails usability
- unneeded animation that does not communicate state, focus, causality, loading, or transition
- decorative chaos behind the main content
