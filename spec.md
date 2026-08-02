# Slash

## 3D Story Authoring Tool

> **Current scope (2026-08).** This document describes the full vision. The
> current build is a deliberately narrowed **runtime** focused on scroll
> behavior and scroll↔content synchronization, playing a **single linear story
> path**. Scenes are **passive**: vertical scroll is the only input. Deferred
> for now (preserved in git history): the authoring **Editor**, seamless
> boundary transitions (crossfade / camera move / continuity), horizontal
> **viewpoint** switching (swipe to switch characters — allowed by the vision,
> not yet built), story **branching**, the **State** and **Event** systems,
> **Audio**, automatic **Playback Mode**, **AI** generation, and the
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
Horizontal swipe is reserved for viewpoint switching (swipe to switch
characters).

---

# Interactive Mode

Interactive Mode provides a user-controlled story experience.

Supported:

- Scroll to advance story
- Swipe to change viewpoint

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

Characters move _through_ the connected environments with restrained, idle-led motion.

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

- Character viewpoint
- Alternative perspectives

Supported:

- Multiple character viewpoints
- Swipe-based switching (swipe to switch characters)

Horizontal switching changes the viewpoint on the same story, not the story
path — there are no branches or alternative outcomes.

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
