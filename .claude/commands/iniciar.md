---
description: Inicio de sesión — sincroniza Git (git pull) y Apps Script (clasp pull)
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git pull:*), Bash(git fetch:*), Bash(git log:*), Bash(git diff:*), Bash(git stash:*), Bash(clasp pull:*), Bash(clasp status:*)
---

Rutina de INICIO de trabajo. Ejecuta los pasos en orden, desde la raíz del repo (donde está `.clasp.json`), y detente a preguntar si algo no cuadra. Responde en español.

1. **Estado local**: `git status --short`.
   - Si hay cambios sin commitear, NO sigas: muéstralos y pregunta si hacer `git stash`, commitearlos o abortar.

2. **Git primero** (el repo es la fuente de verdad): `git pull --rebase origin main`.
   - Si hay conflicto, para y explica qué archivos chocan; no lo resuelvas sin preguntar.
   - Resume en 1–3 líneas qué trajo (`git log --oneline ORIG_HEAD..HEAD`), indicando quién hizo cada commit.

3. **Apps Script después**: `clasp pull`.
   - Si falla por autenticación, dile al usuario que ejecute `clasp login` con la cuenta que tiene acceso al proyecto y para ahí.

4. **Comprobar desfase**: `git status --short` y `git diff --stat`.
   - Sin cambios → todo sincronizado.
   - Con cambios → alguien editó en el editor web de Apps Script (o hizo `clasp push` sin `git push`). Muestra el diff resumido y pregunta:
     a) conservarlos → commit `chore(apps-script): traer cambios hechos en el editor web`, o
     b) descartarlos → `git checkout -- "Apps Script/"` (el siguiente `/finalizar` volverá a dejar el Apps Script igual que Git).
     No decidas tú.

5. Cierra con un resumen corto: commits nuevos traídos, si hubo desfase con Apps Script y que todo está listo para trabajar.
