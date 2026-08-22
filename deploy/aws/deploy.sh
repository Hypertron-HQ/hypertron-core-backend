#!/usr/bin/env bash
# Deploy hypertron-core-backend to AWS App Runner.
# Does not contact Render and does not change Render env/config.
#
# Usage:
#   ./deploy/aws/deploy.sh              # first-time or full update
#   ./deploy/aws/deploy.sh --image-only # build+push; App Runner auto-deploys :latest
#   ./deploy/aws/deploy.sh --check      # validate .env.aws; does not call AWS or Render
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATE="$ROOT/deploy/aws/cloudformation.yaml"
ENV_HELPER="$ROOT/deploy/aws/env-file.cjs"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
STACK_NAME="${STACK_NAME:-hypertron-core-backend}"
SECRET_NAME="${SECRET_NAME:-hypertron-core-backend/env}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.aws}"
CPU="${CPU:-0.5 vCPU}"
MEMORY="${MEMORY:-1 GB}"
IMAGE_ONLY=0
CHECK_ONLY=0

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --image-only) IMAGE_ONLY=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) die "unknown argument: $arg" ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing '$1'. Install it and retry."
}

need node

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  [[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy docs/ops/AWS_ENV.example to .env.aws and fill it in."
  node "$ENV_HELPER" validate "$ENV_FILE"
  log "OK: .env.aws is valid and does not use the live Render database names."
  log "Render was not contacted. AWS was not contacted."
  exit 0
fi

need aws
need docker

aws sts get-caller-identity --region "$REGION" >/dev/null \
  || die "AWS CLI is not authenticated. Run 'aws configure' or set AWS_PROFILE."

docker info >/dev/null 2>&1 || die "Docker daemon is not running."

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/hypertron-core-backend"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo latest)}"

ensure_ecr() {
  if aws ecr describe-repositories \
      --region "$REGION" \
      --repository-names hypertron-core-backend >/dev/null 2>&1; then
    return
  fi
  [[ -f "$TEMPLATE" ]] || die "missing $TEMPLATE"
  log "==> Creating ECR repository via CloudFormation (DeployService=false)"
  aws cloudformation deploy \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --template-file "$TEMPLATE" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides DeployService=false \
    --no-fail-on-empty-changeset
}

push_image() {
  log "==> Logging in to ECR"
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

  log "==> Building linux/amd64 image from the existing Dockerfile"
  docker build \
    --platform linux/amd64 \
    -t "${ECR_URI}:${IMAGE_TAG}" \
    -t "${ECR_URI}:latest" \
    "$ROOT"

  log "==> Pushing ${ECR_URI}:${IMAGE_TAG} and :latest"
  docker push "${ECR_URI}:${IMAGE_TAG}"
  docker push "${ECR_URI}:latest"
}

log "==> Region       $REGION"
log "==> Stack        $STACK_NAME"
log "==> Image tag    $IMAGE_TAG"
log "==> This does not update Render."

ensure_ecr
push_image

if [[ "$IMAGE_ONLY" -eq 1 ]]; then
  log ""
  log "Image pushed. App Runner auto-deploys when it is already watching :latest."
  log "Render was not changed."
  exit 0
fi

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy docs/ops/AWS_ENV.example to .env.aws and fill it in."

log "==> Validating .env.aws is not the live Render database"
node "$ENV_HELPER" validate "$ENV_FILE"

CORS_ORIGIN="$(node "$ENV_HELPER" get "$ENV_FILE" CORS_ORIGIN)"
FRONTEND_URL="$(node "$ENV_HELPER" get "$ENV_FILE" FRONTEND_URL)"
PAYMENTS_API_URL="$(node "$ENV_HELPER" get "$ENV_FILE" PAYMENTS_API_URL)"
COOKIE_SAMESITE="$(node "$ENV_HELPER" get "$ENV_FILE" COOKIE_SAMESITE)"
CORS_ORIGIN="${CORS_ORIGIN:-https://www.hypertron.space}"
FRONTEND_URL="${FRONTEND_URL:-https://www.hypertron.space}"
COOKIE_SAMESITE="${COOKIE_SAMESITE:-none}"

log "==> Creating / updating Secrets Manager secret $SECRET_NAME"
SECRET_JSON="$(node "$ENV_HELPER" secret-json "$ENV_FILE")"
if aws secretsmanager describe-secret --region "$REGION" --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value \
    --region "$REGION" \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" >/dev/null
else
  aws secretsmanager create-secret \
    --region "$REGION" \
    --name "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" >/dev/null
fi

SECRET_ARN="$(
  aws secretsmanager describe-secret \
    --region "$REGION" \
    --secret-id "$SECRET_NAME" \
    --query ARN \
    --output text
)"

log "==> Creating / updating App Runner (DeployService=true)"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    DeployService=true \
    ImageTag=latest \
    SecretArn="$SECRET_ARN" \
    Cpu="$CPU" \
    Memory="$MEMORY" \
    CorsOrigin="$CORS_ORIGIN" \
    FrontendUrl="$FRONTEND_URL" \
    PaymentsApiUrl="$PAYMENTS_API_URL" \
    CookieSameSite="$COOKIE_SAMESITE" \
  --no-fail-on-empty-changeset

SERVICE_URL="$(
  aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" \
    --output text
)"

log ""
log "AWS deploy submitted."
log "  Image:  ${ECR_URI}:latest"
log "  URL:    ${SERVICE_URL}"
log ""
log "Wait until App Runner status is RUNNING, then:"
log "  curl -sS \"${SERVICE_URL}/health\""
log ""
log "Render was not changed. Live Render remains https://hypertron-core-backend.onrender.com"
