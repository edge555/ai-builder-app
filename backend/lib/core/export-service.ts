import JSZip from 'jszip';
import { ProjectState } from '@ai-app-builder/shared';

/**
 * Export Service
 *
 * Handles exporting ProjectState to downloadable ZIP files.
 * Preserves folder structure and includes all project files.
 * Generates setup documentation appropriate for the project type.
 */

export interface ExportService {
  exportAsZip(projectState: ProjectState): Promise<Blob>;
}

// ─── Project type detection ─────────────────────────────────────────────────

interface ProjectInfo {
  isFullstack: boolean;
  hasPrisma: boolean;
  hasSupabase: boolean;
  hasNextjs: boolean;
  hasTypeScript: boolean;
  hasTailwind: boolean;
  techStack: string[];
}

function analyzeProject(files: Record<string, string>): ProjectInfo {
  const paths = Object.keys(files);
  const allContent = Object.values(files).join('\n');

  const hasPrisma = paths.some(p => p.includes('schema.prisma') || p.includes('prisma.ts'));
  const hasSupabase = allContent.includes('@supabase/supabase-js') || paths.some(p => p.includes('supabase'));
  const hasNextjs = allContent.includes('"next"') || paths.some(p => p.includes('next.config'));
  const hasTypeScript = paths.some(p => p.endsWith('.ts') || p.endsWith('.tsx'));
  const hasTailwind = allContent.includes('tailwind') || paths.some(p => p.includes('tailwind'));
  const isFullstack = hasPrisma || hasSupabase || hasNextjs;

  const techStack = ['React'];
  if (hasNextjs) techStack.splice(0, 1, 'Next.js');
  if (hasTypeScript) techStack.push('TypeScript');
  if (hasTailwind) techStack.push('Tailwind CSS');
  if (hasPrisma) techStack.push('Prisma');
  if (hasSupabase) techStack.push('Supabase');

  return { isFullstack, hasPrisma, hasSupabase, hasNextjs, hasTypeScript, hasTailwind, techStack };
}

// ─── Generated files ────────────────────────────────────────────────────────

function generateReadme(projectState: ProjectState, info: ProjectInfo): string {
  const { name, description, files } = projectState;

  const fileTree = Object.keys(files)
    .sort()
    .map(f => `  ${f}`)
    .join('\n');

  const setupSteps = info.isFullstack
    ? `\`\`\`bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values
${info.hasPrisma ? '\n# Set up database\nnpx prisma generate\nnpx prisma db push\n' : ''}
# Start development server
npm run dev
\`\`\``
    : `\`\`\`bash
npm install
npm run dev
\`\`\``;

  return `# ${name}

${description || 'A web application generated with AI App Builder.'}

## Tech Stack

${info.techStack.map(t => `- ${t}`).join('\n')}

## Getting Started

${setupSteps}

## File Structure

\`\`\`
${fileTree}
\`\`\`
${info.hasPrisma ? `
## Database

This project uses Prisma ORM. To manage the database:

\`\`\`bash
npx prisma studio    # Open visual editor
npx prisma migrate dev  # Create migration
npx prisma db push   # Push schema changes
\`\`\`
` : ''}${info.hasSupabase ? `
## Authentication

This project uses Supabase Auth. Set up your Supabase project at https://supabase.com and add your credentials to \`.env\`.
` : ''}
---

Generated with [AI App Builder](https://github.com)
`;
}

function generateEnvExample(info: ProjectInfo): string {
  const lines = ['# Environment Variables', '# Copy this file to .env and fill in the values', ''];

  if (info.hasNextjs) {
    lines.push('# App');
    lines.push('NEXT_PUBLIC_APP_URL=http://localhost:3000');
    lines.push('');
  }

  if (info.hasPrisma) {
    lines.push('# Database');
    lines.push('DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"');
    lines.push('');
  }

  if (info.hasSupabase) {
    lines.push('# Supabase');
    lines.push('NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
    lines.push('NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key');
    lines.push('');
  }

  if (!info.isFullstack) {
    lines.push('# VITE_API_BASE_URL=http://localhost:4000');
    lines.push('');
  }

  return lines.join('\n');
}

function generateDockerCompose(info: ProjectInfo): string | null {
  if (!info.hasPrisma) return null;

  return `version: '3.8'

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: mydb
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
`;
}

function generateGitignore(info: ProjectInfo): string {
  const lines = [
    'node_modules/',
    '.next/',
    'dist/',
    '.env',
    '.env.local',
    '*.log',
    '.DS_Store',
  ];

  if (info.hasPrisma) {
    lines.push('prisma/*.db');
    lines.push('prisma/migrations/');
  }

  return lines.join('\n') + '\n';
}

// ─── ZIP builders ───────────────────────────────────────────────────────────

function addMetaFiles(zip: JSZip, projectState: ProjectState, info: ProjectInfo): void {
  if (!projectState.files['README.md']) {
    zip.file('README.md', generateReadme(projectState, info));
  }
  if (!projectState.files['.env.example']) {
    zip.file('.env.example', generateEnvExample(info));
  }
  if (!projectState.files['.gitignore']) {
    zip.file('.gitignore', generateGitignore(info));
  }

  const dockerCompose = generateDockerCompose(info);
  if (dockerCompose && !projectState.files['docker-compose.yml']) {
    zip.file('docker-compose.yml', dockerCompose);
  }
}

/**
 * Creates a ZIP file containing all files from the ProjectState.
 */
export async function exportAsZip(projectState: ProjectState): Promise<Blob> {
  const zip = new JSZip();
  const info = analyzeProject(projectState.files);

  for (const [filePath, content] of Object.entries(projectState.files)) {
    zip.file(filePath, content);
  }

  addMetaFiles(zip, projectState, info);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return blob;
}

/**
 * Creates a ZIP file and returns it as a Buffer (for Node.js environments).
 */
export async function exportAsZipBuffer(projectState: ProjectState): Promise<Buffer> {
  const zip = new JSZip();
  const info = analyzeProject(projectState.files);

  for (const [filePath, content] of Object.entries(projectState.files)) {
    zip.file(filePath, content);
  }

  addMetaFiles(zip, projectState, info);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return buffer;
}

/**
 * Creates a default ExportService implementation.
 */
export function createExportService(): ExportService {
  return {
    exportAsZip,
  };
}
