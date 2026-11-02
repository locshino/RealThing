---
title: RealThing Spec-Driven Development
slug: realthing-sdd
date: 2026-09-15
author: maciej-gorywoda
excerpt: Specifications maintained alongside the code serve as a living architectural map for your project.
tags:
  - realthing
  - spec-driven development
---

## A lesson in history

Writing clear, structured documentation alongside code saves time and preserves architectural intent. Spec-Driven Development (SDD) is the practice of writing an explicit, structured specification first and treating it as the source of truth against which the implementation is validated.

## Spec-Driven Development in RealThing

In RealThing, `goal-and-requirements.md`, `architecture.md`, and per-module `SPEC.md` files sit beside the code they describe:

```yaml
---
id:   # a unique id, this is how other specs reference this one
type: # goal-and-requirements | architecture-design | module-design | submodule-design | task-spec
title: # full title
status: # draft | active | stale | done | deprecated
parent: # the id of the spec directly above it in scope
depends-on: # the ids of other SPEC.md files important to this one
tags: # tags describing the contents
---
```

Together, these documents form a navigable spec graph that keeps module responsibilities, public surfaces, and architectural decisions explicit and verifiable.

Happy developing!
