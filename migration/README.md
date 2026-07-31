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

- The old standalone Express payment-link backend has been ported into live NestJS code.
- The remaining Next.js backend surface has been transferred here as migration source and still needs controller/service-level porting into `src/`.
