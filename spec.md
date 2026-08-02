# Slash
## 3D Story Authoring Tool

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
- Events
- Interactive choices

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
- Events
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
- Event data
- State data

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
- Events
- Effects
- Audio

Input methods:

## Interactive Input

User controls progression through:

- Vertical scroll
- Horizontal swipe
- Tap
- Selection

Vertical scroll uses the browser's native scrolling.
It is the primary navigation axis: scrolling down advances the story.
Horizontal swipe is reserved for viewpoint switching.

## Playback Input

Automatic progression through:

- Auto scroll
- Timeline playback

Both Interactive Mode and Playback Mode use the same Story Progress system.

---

# Interactive Mode

Interactive Mode provides a user-controlled story experience.

Supported:

- Scroll to advance story
- Swipe to change viewpoint
- Select characters
- Trigger interactions

---

# Playback Mode

Playback Mode provides an automatic story experience.

Supported:

- Auto scrolling
- Camera direction
- Character animation
- Stage animation
- Event execution
- BGM
- Sound effects
- Environment sounds

Provides a cinematic viewing experience.

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

Stages form a vertically connected sequence.
Scrolling down moves through the sequence.

Some boundaries are independent.
Others are seamless: objects or characters continue from one stage into the next.

Each boundary's transition is author-selected, per boundary:

- Cut — instant change
- Cross-fade — the two stages dissolve across the boundary
- Camera move — the camera glides from one stage's viewpoint to the next
- Continuity — the stages coexist at an authored offset while carried characters cross the seam

## Camera Viewpoints

Each stage is framed from a single intended viewpoint.
The viewpoint is a fixed shot — like a comic panel — of a fully realized 3D stage.
A stage only needs to look correct from its own viewpoint.

Optional restrained drift adds subtle in-stage camera motion.

Characters move *through* the connected environments with restrained, idle-led motion.

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
- Events
- User interaction
- Playback timeline

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

# Story Branching

Slash supports branching stories.

## Vertical Progression

Represents:

- Time
- Main story flow

## Horizontal Switching

Represents:

- Character viewpoint
- Alternative perspectives

Supported:

- Multiple character viewpoints
- Swipe-based switching
- Different story outcomes

Example:

Multiple characters exist on the same stage.
Selecting a character changes the following story path.

---

# Game-like Story System

Game mechanics can enhance storytelling.

Supported:

- Story loops
- Revisiting scenes
- State-dependent changes
- Hidden elements
- Choices
- Simple interactions

The goal is not to build a full game engine.

The goal is richer storytelling.

---

# State System

The story maintains state.

Examples:

- Progress
- Flags
- Visited scenes
- Items
- Character states
- Unlocked events

---

# Event System

Events are data-driven.

## Trigger

Examples:

- Scroll position
- Tap
- Swipe
- Location
- Condition
- State change

## Action

Examples:

- Play animation
- Move camera
- Show effect
- Change scene
- Update state
- Play sound

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
- Events
- Branching

---

## Preview

Preview:

- Interactive scroll experience
- Playback experience
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

# Audio System

Supported:

- BGM
- Sound effects
- Environment sounds

Audio enhances:

- Storytelling
- Atmosphere
- Immersion

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
- Event generation

All data should be easy for AI systems to understand and modify.
