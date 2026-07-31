# Hypertron Backend Migration

This directory contains the transferred backend source from the original `hypertron` repository.

## Purpose

- preserve all backend-related source during the repo split
- keep a stable reference while porting routes into NestJS modules
- separate "source transferred" from "feature fully ported and running in Nest"

## Structure

- `legacy-hypertron/backend`
  Original standalone backend folder from the old repo
- `legacy-hypertron/frontend/src/app/api`
  Next.js API routes that still need NestJS porting
- `legacy-hypertron/frontend/src/lib`
  Server-side support code used by those routes
- `legacy-hypertron/frontend/prisma`
  Original Prisma schema used by the old app

## Current Status

- Live NestJS modules now cover shared Prisma access, wallet and Privy authentication, business profiles and receive addresses, workspace creation, templates, database-backed payment links, and virtual balances.
- The remaining Next.js backend surface is preserved here as migration source. Settlement/relayer code, treasury and withdrawals, employees, compliance, RegIntel, analytics, events, and agentic features still need controller/service-level ports into `src/`.
