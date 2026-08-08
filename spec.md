# Slash

## 3D Story Authoring Tool

> **Current scope (2026-08).** This document describes the full vision. The
> current build is a deliberately narrowed **runtime** focused on scroll
> behavior and scroll↔world synchronization, playing **one continuous vertical
> world** (see _Connected Stages_ below). It takes **two inputs**: vertical
> scroll to descend, and horizontal swipe to **turn the view** around the
> content (see _Horizontal Rotation_ below). The world is otherwise
> **passive** — no taps, events, or state. Deferred for now (preserved in git
> history): the authoring **Editor**, horizontal **viewpoint** switching (swipe
> to switch characters — allowed by the vision, superseded on the swipe axis by
> rotation, not built), story **branching**, the **State** and **Event**
> systems, **Audio**, automatic **Playback Mode**, **AI** generation, and the
> **export/optimization** pipeline. Sections below that describe those systems
> are vision, not the current build.

## Overview

Slash is a web-based authoring tool for creating scroll-driven 3D story experiences.

The purpose of Slash is not 3D modeling.
The purpose is to create immersive story experiences by combining:

- 3D environments
- Characters
- Props
- Animations
- Camera direction
- Lighting
- Effects

Implementation:

- Vanilla JavaScript

---

# Platform Support

## Runtime

The created content runs on:

- Desktop browsers
- Mobile browsers
- Tablet browsers

Runtime prioritizes:

- Fast loading
- Smooth interaction
- Stable performance

---

## Editor

Slash Editor is a developer-oriented authoring environment.

Supported:

- Desktop browsers
- Tablet browsers

Not required:

- Smartphone support

Editor prioritizes:

- Efficient content creation
- Asset management
- Scene editing
- Preview workflow

---

# Core Philosophy

## Story First

The highest priority is storytelling.

Slash focuses on:

- Character expression
- Scene composition
- Atmosphere
- Emotional direction
- Story progression

Avoid unnecessary complexity that does not improve the story experience.

---

## AI Native

Slash is designed for AI-assisted creation.

AI should be able to generate and modify:

- Stories
- Scenes
- Characters
- 3D assets
- Animations
- Configurations

All data should be structured and machine-readable.

---

## Data Separation

The following must be completely separated.

## Editor

Responsible for:

- Content creation
- Asset setup
- Scene editing
- Animation setup
- Preview

## Content Data

Responsible for:

- Story data
- Scene data
- Asset references
- Animation data

## Runtime

Responsible for:

- Loading content
- Rendering
- Playback
- Interaction

Runtime must not depend on Editor.

---

# Story System

## Story Progress

Story progression is managed independently from input methods.

Story Progress controls:

- Scene progression
- Camera movement
- Character movement
- Stage movement
- Animation changes
- Effects

Input methods:

## Interactive Input

User controls progression through:

- Vertical scroll
- Horizontal swipe

Vertical scroll uses the browser's native scrolling.
It is the primary navigation axis: scrolling down advances the story.
Horizontal swipe **turns the view around the content** — see _Horizontal
Rotation_ under the Stage System.

The two axes are independent but not exclusive. Swiping never moves the story
forward or back, and scrolling never turns the view — but both can happen at
once: a diagonal gesture advances the story by its vertical component and turns
the view by its horizontal one, simultaneously.

---

# Interactive Mode

Interactive Mode provides a user-controlled story experience.

Supported:

- Scroll to advance story
- Swipe to turn the view around the content

---

# Stage System

3D content is organized as continuous stages.

Examples:

- Game-like stages
- Attractions
- Dioramas

Physical consistency is not required.

Priority:

- Story clarity
- Visual composition
- Emotional impact

Stages can be edited and animated.

Supported:

- Placement
- Transform changes
- Model changes
- Material changes
- Animation setup
- Lighting setup
- Effects setup

Examples:

- Moving objects
- Opening doors
- Changing environments
- Animated background elements
- Interactive objects

## Connected Stages

The world is **one continuous vertical space**, not a sequence of framed panels.
Scrolling down descends a single axis; environments stream past continuously,
with **parallax depth**, and there are no boundaries or cuts. Atmosphere,
framing and parallax are all continuous over global progress.

The camera **descends through a world that is fixed in space**. Content is
placed at an absolute vertical position (`worldY`) inside a **parallax layer**;
the descent reveals it. This reads like scrolling a web page — the world moves
up past the viewer — while feeling like an **attraction**: the stage streams by
and the characters travel through it.

### Move the camera vs. move the world

Two ways to make the world stream past. For a single rigid world they are
equivalent (relative translation); they diverge once you add **parallax** and
**persistent characters** — the two things this runtime is built around.

- **Move the camera down (world fixed)** — the chosen approach.
  - **Real perspective parallax for free**: near objects stream past faster than
    far ones automatically; per-layer factors add deliberate depth on top.
  - Objects keep **true, stable world coordinates** → WYSIWYG authoring and the
    cleanest AI-generation surface; matches the diorama/attraction mental model.
  - Only the camera transform changes per frame; persistent characters ride a
    rig that descends with it.
  - Cost: camera coordinates grow far from the origin on very long worlds
    (mitigated by origin rebasing — deferred; irrelevant at sample scale).
- **Move the world up (camera fixed)** — rejected.
  - A uniform world translation gives **no parallax**; every layer's depth must
    be faked by hand.
  - Persistent characters must be pulled out of / counter-translated against the
    moving world.
  - Its one edge (a perfectly static camera for post/shadows) does not outweigh
    losing free parallax and stable authoring coordinates.

### Parallax layers

Content lives in ordered layers, each with a `parallax` factor: `1` = true
world space (full parallax); `→ 0` = rides the camera and barely moves (distant
sky and ridges). Layers give art-directed depth on top of natural perspective.

## Camera and characters

The camera is a **dolly rig** that descends with scroll: an authored offset and
look-at relative to the descending point, plus optional restrained `drift`.

Characters **persist through the whole descent**. A character set to follow the
camera rides down with it, staying framed while the world streams past — a
protagonist travelling _through_ the connected environments with restrained,
idle-led motion (sway, bob, drift). Characters anchored in the world instead
are passed and left behind. A stage only needs to look correct across the band
of the descent where it is on screen.

## Horizontal Rotation

The second input axis. A horizontal swipe **turns the view around the content**:
the camera orbits a **circular path** centred on what it is looking at, at its
**current vertical height**. The world reads as a turntable the viewer can spin
to look at the scene from another side.

- **The camera orbits; the world does not move.** Consistent with _Move the
  camera vs. move the world_ above — objects keep true, stable world
  coordinates, and parallax layers need no special handling.
- **Height is untouched.** Rotation is about a vertical axis, so it cannot
  change a vertical position. Vertical movement stays exclusively the scroll
  axis's job; per-layer parallax offsets and every progress-keyed track are
  driven by scroll alone.
- **Both axes may move at once.** A gesture is not classified as either a scroll
  or a turn: it is decomposed. Its vertical component scrolls natively while its
  horizontal component turns the view, in the same gesture and the same frame.
  Independence is about what each component controls, not about taking turns.
- **Free and persistent.** Any angle, both directions, no limit and no snapping.
  The angle stays where the viewer left it while they keep scrolling, until they
  swipe again.
- **Direct manipulation.** The drag tracks the finger and a flick coasts to a
  stop. Rotation per screen-width of drag is an authored knob, as descent per
  scroll unit is for the vertical axis.
- **Characters do not spin with the view.** Camera-following actors keep their
  world orientation, so turning walks the viewer around them and shows a
  different side, rather than pinning them to the screen.

Because the axes are independent, a stage authored to be framed from the front
still needs to hold up when turned — see _Horizontal Switching_ for the
authoring implication.

---

# Character System

Characters are core storytelling elements.

Priority:

- Character design
- Expression
- Pose
- Costume
- Equipment
- Personality

Characters should remain visually attractive and expressive.

---

# 3D Asset System

Slash manages all 3D assets.

Asset types:

- Characters
- Stages
- Props
- Environment objects

Supported creation methods:

- Image to 3D generation
- AI-generated 3D models
- External model import

Assets support:

- Editing
- Animation
- Reuse
- Runtime optimization

---

# Asset Structure

Not all parts need to be separated.

Assets should be modular only where flexibility is required.

## Character

Base Character:

- Body
- Head
- Face

Optional Modular Parts:

- Clothes
- Hair
- Weapons
- Hats
- Accessories
- Special equipment

## Stage

Base Stage:

- Environment model
- Main structures

Optional Modular Parts:

- Props
- Interactive objects
- Replaceable elements

Goal:

Efficient story production, not complete customization.

---

# Animation System

Characters and stages can have animations.

Supported:

- Position animation
- Rotation animation
- Scale animation
- Pose animation
- Object state changes
- Idle loops
- Action animations
- Transition animations

Animation is controlled by:

- Story Progress

Animation prioritizes storytelling impact.

---

# VAT and Runtime Animation

Runtime animation data is separated from authoring data.

Characters and stage assets can be optimized using:

- VAT
- GPU animation
- Other runtime formats

Authoring data supports editing.

Runtime optimization targets:

- Memory usage
- Loading time
- GPU performance

Mesh constraints:

Editable:

- Pose
- Bone
- Morph
- Vertex deformation
- Animation

Not editable:

- Vertex count changes
- Topology changes

---

# Asset Reuse

Assets should be reused whenever possible to reduce data size.

Reusable resources:

- Character models
- Stage models
- Props
- Materials
- Animations

Multiple scenes can reference the same asset.

Build optimization:

- Duplicate removal
- Asset sharing
- Compression
- Streaming

---

# Story Structure

The story is a single linear sequence.

## Vertical Progression

Represents:

- Time
- Main story flow

Scrolling down moves through the sequence.

## Horizontal Switching

Represents:

- Point of view on the current moment
- Alternative perspectives

Supported:

- Swipe to rotate the view around the content (see _Horizontal Rotation_)

The horizontal axis changes only how the current moment is seen, never the
story path — there are no branches or alternative outcomes, and swiping does
not advance or rewind the story.

Authoring implication: a moment can be turned to, so stages should read from
more than the one front-on framing. Compose for the intended viewpoint first,
but keep the sides and back of anything near the camera presentable — or place
it far enough out that turning never brings it close.

Swipe-based switching between _character_ viewpoints (a different protagonist's
perspective on the same span) remains part of the vision but is not built; the
swipe axis currently drives rotation.

---

# Editor System

Slash is a story authoring tool, not a 3D modeling tool.

---

## Asset Management

Supported:

- Image to 3D model generation
- AI-generated 3D models
- External model import

Not required:

- Full modeling
- UV editing
- Rigging
- Skinning

---

## Scene Authoring

Editable:

- Scenes
- Stages
- Characters
- Props
- Camera
- Lighting
- Effects
- Animations

---

## Preview

Preview:

- Interactive scroll experience
- Swipe interaction
- Animation
- Lighting
- Effects
- Mobile operation

---

## Export

Export optimized runtime data.

---

# Rendering System

Default style:

- Realistic toon rendering

Supported:

- Toon
- Realistic
- Illustration
- Low poly
- Custom styles

Priority:

- Lighting
- Shader
- Atmosphere
- Post processing
- Effects

The goal is an atmospheric world, not only detailed models.

---

# Effects System

Supported:

- Particles
- Fog
- Rain
- Snow
- Light effects
- Environment effects

---

# Performance

Runtime optimization:

- Fast loading
- Mobile performance
- Stable frame rate

Techniques:

- Compression
- Lazy loading
- Preloading
- GPU optimization
- Memory optimization

Maintain quality through efficient implementation.

---

# AI Support

AI-assisted generation:

- Story generation
- Scene generation
- Character setup
- Asset generation

All data should be easy for AI systems to understand and modify.
