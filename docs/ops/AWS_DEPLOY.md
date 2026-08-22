# AWS deploy — hypertron-core-backend

This is a **second, independent** deployment of the same NestJS app that already runs on Render.

## Will this change Render?

**No application code, Dockerfile, or `render.yaml` change is required for AWS.** Render keeps using:

- the same GitHub repo / branch it already watches
- the same Dockerfile `CMD ["node", "dist/main.js"]`
- the same `/health` check
- the same env vars you already set in the Render dashboard

AWS is added as new files under `deploy/aws/` and `docs/ops/`. Those files are not part of the runtime image.

What *can* still happen:

| Action | Effect on live Render |
|---|---|
| Running `./deploy/aws/deploy.sh` | None. It only talks to AWS. |
| GitHub Action **Deploy AWS App Runner** (manual) | None. It only pushes an image to ECR. |
| Merging these files to the branch Render auto-deploys | Render will **rebuild and restart** the current image. Behavior stays the same because `src/`, `Dockerfile`, and `render.yaml` are unchanged. Expect a short restart, not a config change. |
| Copying AWS env vars into the Render dashboard | **Do not do this.** That would be a live config change. |

If you want zero Render restart, keep this work on `chore/aws-apprunner` (or any branch Render does not auto-deploy). Do not merge to `main` until you accept a short Render rebuild, or pause auto-deploy in Render while you merge.

Do **not** point AWS at the live Render `DATABASE_URL`. Two instances sharing that database will both run the Collect reconciler against the same payment links. `deploy/aws/deploy.sh` refuses database names `hypertron` and `hypertron_api` unless `ALLOW_SHARED_RENDER_DB=true`.

## Git branch (keep Render from auto-deploying this)

Put these files on `chore/aws-apprunner` and push **that** branch only. Do not push or merge to `main` (or whichever branch Render auto-deploys) until you accept a short Render restart.

```bash
git checkout -b chore/aws-apprunner
git push -u origin chore/aws-apprunner
```

---

## What gets created on AWS

Closest equivalent to a Render Web Service:

1. **Amazon ECR** — container registry (`hypertron-core-backend`)
2. **AWS Secrets Manager** — `hypertron-core-backend/env` (secrets only)
3. **AWS App Runner** — HTTPS URL, health check `/health`, port `4000`

MongoDB stays on Atlas (same as Render). AWS does not replace Atlas.

Default size is **0.5 vCPU / 1 GB**, close to a Render Starter box. Override with `CPU` and `MEMORY` when you run the script.

---

## Prerequisites

- AWS account and an IAM user/role that can create the stack. A starter policy is in `deploy/aws/iam-deploy-policy.json`.
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (`aws configure` or `AWS_PROFILE`)
- Docker Desktop running (Apple Silicon must still build `linux/amd64`)
- Node.js (used only to parse `.env.aws`)
- A **new** Atlas database name, for example `hypertron_aws` on the same cluster, **or** a separate cluster
- Atlas Network Access allowing App Runner egress. App Runner public egress IPs are not stable, so the first deploy typically uses `0.0.0.0/0` (same pattern many Render setups already use)

Suggested region: `us-east-1` (override with `AWS_REGION`).

---

## First deploy

From `hypertron-core-backend`:

```bash
cp docs/ops/AWS_ENV.example .env.aws
```

Edit `.env.aws`:

1. Set `DATABASE_URL` to a **different** database than live Render (`.../hypertron_aws?...`).
2. Generate a **new** `AUTH_SECRET` and `SERVICE_ACCOUNT_API_KEY`. Do not copy live Render secrets unless you deliberately want shared sessions.
3. Leave `PAYMENTS_API_URL` empty unless this AWS instance should call hypertron-api.
4. Apply the Prisma schema once against that AWS database:

```bash
export DATABASE_URL='mongodb+srv://...'   # the AWS database, not Render
pnpm db:deploy
```

Then deploy (this does not call Render):

```bash
chmod +x deploy/aws/deploy.sh
./deploy/aws/deploy.sh --check
./deploy/aws/deploy.sh
```

`--check` confirms `DATABASE_URL` is not the live Render database (`hypertron` / `hypertron_api`). The deploy script refuses those names unless `ALLOW_SHARED_RENDER_DB=true`.

The script:

1. Creates the ECR repo (CloudFormation, `DeployService=false`)
2. Builds the **existing** Dockerfile for `linux/amd64` and pushes `:latest`
3. Writes secrets to Secrets Manager
4. Creates App Runner (CloudFormation, `DeployService=true`)

It prints an `https://xxxxx.awsapprunner.com` URL. Wait until the service is **RUNNING**, then:

```bash
curl -sS "https://YOUR-ID.awsapprunner.com/health"
```

Expected:

```json
{"service":"hypertron-core-backend","status":"ok","database":"ok"}
```

If health is `503` / `database: unavailable`, Atlas cannot be reached from App Runner (network access or wrong `DATABASE_URL`).

---

## Later deploys

App Runner is set to auto-deploy when ECR `:latest` changes.

```bash
./deploy/aws/deploy.sh --image-only
```

Or run the GitHub Action **Deploy AWS App Runner** (Actions → Run workflow). That workflow is `workflow_dispatch` only — it does **not** run on push, so it cannot race Render.

GitHub repo secrets (AWS only):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

---

## Env vars

Same names as Render. AWS reads non-secrets from `.env.aws` into App Runner, and secrets from Secrets Manager.

| Name | Where on AWS | Notes |
|---|---|---|
| `NODE_ENV` | App Runner (fixed `production`) | |
| `PORT` | App Runner (fixed `4000`) | Render still injects its own `PORT`. Do not change Render. |
| `CORS_ORIGIN` | App Runner env | |
| `FRONTEND_URL` | App Runner env | |
| `COOKIE_SAMESITE` | App Runner env | `none` for Vercel + this API |
| `PAYMENTS_API_URL` | App Runner env | Optional |
| `DATABASE_URL` | Secrets Manager | Separate Atlas DB from Render |
| `AUTH_SECRET` | Secrets Manager | New value for AWS |
| `SERVICE_ACCOUNT_API_KEY` | Secrets Manager | |
| `SERVICE_ACCOUNT_WALLET` | Secrets Manager | |
| `INTERNAL_SERVICE_TOKEN` | Secrets Manager | Optional |
| `PAYMENT_POOL_ADDRESS` | Secrets Manager | |
| `MERCHANT_RECIPIENT` | Secrets Manager | |

Updating secrets: edit `.env.aws` and re-run `./deploy/aws/deploy.sh` (not `--image-only`). Then start a new App Runner deployment so instances reload secrets.

---

## What this does **not** do

- Does not modify the Render dashboard, `render.yaml`, or Render env vars
- Does not change DNS for `hypertron-core-backend.onrender.com`
- Does not point the frontend at AWS (the site keeps calling Render until you change frontend env yourself)
- Does not create DocumentDB, RDS, or a VPC

When you want traffic on AWS, change the frontend/`hypertron-api` base URL in **that** environment only — leave Render’s URL in production until you cut over.

---

## Smoke tests

```bash
BASE=https://YOUR-ID.awsapprunner.com

curl -sS "$BASE/"
curl -sS "$BASE/health"
```

Do not run destructive payment-link tests against the live Render database.

---

## Tear down (AWS only)

This deletes the App Runner service and IAM roles. The ECR repo is retained (images stay). Secrets Manager is **not** in the stack; delete it manually if you want it gone.

```bash
aws cloudformation delete-stack --stack-name hypertron-core-backend --region us-east-1
aws secretsmanager delete-secret --secret-id hypertron-core-backend/env --region us-east-1
```

Render is unaffected.
