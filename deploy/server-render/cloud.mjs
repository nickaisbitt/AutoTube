/**
 * Cloud Rendering Module
 *
 * Provides cloud-based rendering via AWS Lambda or GCP Cloud Run.
 * Packages the render pipeline as a Docker image and triggers via API.
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCKER_BUILD_CONTEXT = join(__dirname, '..');

const CLOUD_PROVIDERS = {
  lambda: {
    name: 'AWS Lambda',
    buildImage: buildLambdaImage,
    deploy: deployLambda,
    invoke: invokeLambda,
    cleanup: cleanupLambda,
  },
  cloudrun: {
    name: 'GCP Cloud Run',
    buildImage: buildCloudRunImage,
    deploy: deployCloudRun,
    invoke: invokeCloudRun,
    cleanup: cleanupCloudRun,
  },
};

// ── Docker Image Building ─────────────────────────────────────────────────

function buildDockerImage(tag, envVars = {}) {
  const dockerArgs = [
    'build',
    '-t', tag,
    '-f', join(DOCKER_BUILD_CONTEXT, 'Dockerfile'),
  ];

  for (const [key, value] of Object.entries(envVars)) {
    dockerArgs.push('--build-arg', `${key}=${value}`);
  }

  dockerArgs.push(DOCKER_BUILD_CONTEXT);

  console.log(`  Building Docker image: ${tag}`);
  const result = spawnSync('docker', dockerArgs, {
    encoding: 'utf8',
    timeout: 300_000,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Docker build failed with exit code ${result.status}`);
  }
  return true;
}

// ── AWS Lambda ─────────────────────────────────────────────────────────────

function buildLambdaImage(tag) {
  // Lambda requires a specific base image for container image support
  const lambdaDockerfile = join(DOCKER_BUILD_CONTEXT, 'Dockerfile.lambda');
  if (!existsSync(lambdaDockerfile)) {
    // Create a Lambda-compatible Dockerfile
    writeFileSync(lambdaDockerfile, `FROM public.ecr.aws/lambda/nodejs:22

RUN yum install -y ffmpeg && yum clean all

WORKDIR /var/task

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .
RUN npm run build

CMD ["node", "server-render.mjs"]
`);
  }
  return buildDockerImage(tag, { TARGET: 'lambda' });
}

async function deployLambda(project, options = {}) {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const functionName = options.functionName || 'autotube-renderer';
  const memory = options.memory || 10240; // 10GB for render workloads
  const timeout = options.timeout || 900; // 15 min max for Lambda

  console.log(`  Deploying to AWS Lambda (${region}, ${memory}MB, ${timeout}s timeout)...`);

  const ecrUri = options.ecrUri || `${process.env.AWS_ACCOUNT_ID}.dkr.ecr.${region}.amazonaws.com/${functionName}`;

  // Push image to ECR
  const ecrLogin = spawnSync('aws', [
    'ecr', 'get-login-password', '--region', region,
  ], { encoding: 'utf8', timeout: 30000 });

  if (ecrLogin.status === 0) {
    spawnSync('docker', ['login', '--username', 'AWS', '--password-stdin', `${process.env.AWS_ACCOUNT_ID}.dkr.ecr.${region}.amazonaws.com`], {
      input: ecrLogin.stdout.trim(),
      encoding: 'utf8',
      timeout: 30000,
    });
  }

  spawnSync('docker', ['tag', `autotube-renderer:latest`, ecrUri], { encoding: 'utf8', timeout: 30000 });
  spawnSync('docker', ['push', ecrUri], { encoding: 'utf8', timeout: 120000, stdio: 'inherit' });

  // Update Lambda function
  spawnSync('aws', [
    'lambda', 'update-function-code',
    '--function-name', functionName,
    '--image-uri', ecrUri,
    '--region', region,
  ], { encoding: 'utf8', timeout: 60000 });

  // Update Lambda configuration
  spawnSync('aws', [
    'lambda', 'update-function-configuration',
    '--function-name', functionName,
    '--memory-size', String(memory),
    '--timeout', String(timeout),
    '--region', region,
    '--environment', `Variables={NODE_ENV=production}`,
  ], { encoding: 'utf8', timeout: 30000 });

  return { functionName, region, ecrUri };
}

async function invokeLambda(options = {}) {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const functionName = options.functionName || 'autotube-renderer';
  const payload = options.payload || {};

  const result = spawnSync('aws', [
    'lambda', 'invoke',
    '--function-name', functionName,
    '--payload', JSON.stringify(payload),
    '--region', region,
    join(DOCKER_BUILD_CONTEXT, 'lambda-output.json'),
  ], { encoding: 'utf8', timeout: 960000 }); // 16 min

  if (result.status === 0 && existsSync(join(DOCKER_BUILD_CONTEXT, 'lambda-output.json'))) {
    return JSON.parse(readFileSync(join(DOCKER_BUILD_CONTEXT, 'lambda-output.json'), 'utf8'));
  }

  throw new Error(`Lambda invocation failed: ${result.stderr || result.stdout}`);
}

function cleanupLambda() {
  try {
    const outputPath = join(DOCKER_BUILD_CONTEXT, 'lambda-output.json');
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  } catch {}
}

// ── GCP Cloud Run ──────────────────────────────────────────────────────────

function buildCloudRunImage(tag) {
  return buildDockerImage(tag);
}

async function deployCloudRun(project, options = {}) {
  const region = options.region || process.env.GCP_REGION || 'us-central1';
  const serviceName = options.serviceName || 'autotube-renderer';
  const projectId = options.projectId || process.env.GCP_PROJECT_ID;
  const imageUri = options.imageUri || `gcr.io/${projectId}/${serviceName}`;

  console.log(`  Deploying to GCP Cloud Run (${region}, ${serviceName})...`);

  // Build and push to GCR
  spawnSync('docker', ['build', '-t', imageUri, '-f', join(DOCKER_BUILD_CONTEXT, 'Dockerfile'), DOCKER_BUILD_CONTEXT], {
    encoding: 'utf8',
    timeout: 300_000,
    stdio: 'inherit',
  });

  spawnSync('docker', ['push', imageUri], { encoding: 'utf8', timeout: 120000, stdio: 'inherit' });

  // Deploy to Cloud Run
  spawnSync('gcloud', [
    'run', 'deploy', serviceName,
    '--image', imageUri,
    '--region', region,
    '--platform', 'managed',
    '--memory', '4Gi',
    '--cpu', '4',
    '--max-instances', '2',
    '--min-instances', '0',
    '--timeout', '900',
    '--allow-unauthenticated',
    '--set-env-vars', 'NODE_ENV=production',
  ], { encoding: 'utf8', timeout: 120000, stdio: 'inherit' });

  return { serviceName, region, imageUri };
}

async function invokeCloudRun(options = {}) {
  const url = options.url || process.env.CLOUD_RUN_URL;
  if (!url) throw new Error('CLOUD_RUN_URL environment variable not set');

  const response = await fetch(`${url}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options.payload || {}),
    signal: AbortSignal.timeout(900_000),
  });

  if (!response.ok) {
    throw new Error(`Cloud Run render failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function cleanupCloudRun() {
  // Cloud Run cleans up automatically
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getCloudProviders() {
  return Object.keys(CLOUD_PROVIDERS);
}

export async function renderOnCloud(project, options = {}) {
  const provider = options.provider || 'cloudrun';
  const config = CLOUD_PROVIDERS[provider];

  if (!config) {
    throw new Error(`Unknown cloud provider: ${provider}. Supported: ${Object.keys(CLOUD_PROVIDERS).join(', ')}`);
  }

  console.log(`\n☁️  Cloud Rendering via ${config.name}`);

  // Build Docker image
  const tag = `autotube-renderer:${Date.now()}`;
  config.buildImage(tag);

  // Deploy
  const deployResult = await config.deploy(project, options);
  console.log(`  ✅ Deployed: ${JSON.stringify(deployResult)}`);

  // Invoke render
  console.log(`  🚀 Invoking cloud render...`);
  const renderResult = await config.invoke({
    ...options,
    payload: {
      project,
      outputResolution: options.resolution || '1080p',
      renderQuality: options.quality || 'high',
    },
  });

  console.log(`  ✅ Cloud render complete`);
  return renderResult;
}

export async function cleanupCloudResources(options = {}) {
  const provider = options.provider || 'cloudrun';
  const config = CLOUD_PROVIDERS[provider];
  if (config) {
    config.cleanup();
  }
}
