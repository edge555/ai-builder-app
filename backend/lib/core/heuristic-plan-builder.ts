/**
 * @module core/heuristic-plan-builder
 * @description Provides a fallback architecture plan when the AI planning stage fails.
 */

import { ArchitecturePlan } from './prompts/prompt-provider';
import { IntentOutput } from './schemas';
import type { GenerationRecipe } from './recipes/recipe-types';

/**
 * Builds a heuristic (safe minimal) architecture plan based on the intent.
 * Used as a fallback if the LLM planning stage fails or times out.
 */
export function buildHeuristicPlan(
    intent: IntentOutput | null,
    userPrompt: string,
    recipe?: GenerationRecipe
): ArchitecturePlan {
    void intent;
    const lowerPrompt = userPrompt.toLowerCase();

    const baseFiles: ArchitecturePlan['files'] = [
        {
            path: 'package.json',
            purpose: 'npm package manifest for a simple React app',
            layer: 'scaffold',
            exports: [],
            imports: [],
        },
        {
            path: 'src/main.tsx',
            purpose: 'React entry point that renders App and imports global CSS',
            layer: 'scaffold',
            exports: [],
            imports: ['react', 'react-dom/client', './App', './index.css'],
        },
        {
            path: 'src/index.css',
            purpose: 'Global styles and basic layout resets',
            layer: 'scaffold',
            exports: [],
            imports: [],
        },
    ];

    const basePlan = (): ArchitecturePlan => ({
        files: [
            ...baseFiles,
            {
                path: 'src/App.tsx',
                purpose: 'Main app component with local useState and at least 2 event handlers',
                layer: 'ui',
                exports: ['default App'],
                imports: ['react'],
            },
        ],
        components: ['App'],
        dependencies: ['react', 'react-dom'],
        routing: [],
        typeContracts: [],
        cssVariables: [],
        stateShape: {
            contexts: [],
            hooks: [],
        },
    });

    const nextjsPrismaPlan = (): ArchitecturePlan => ({
        files: [
            {
                path: 'package.json',
                purpose: 'Project dependencies for Next.js and Prisma stack',
                layer: 'scaffold',
                exports: [],
                imports: [],
            },
            {
                path: 'next.config.js',
                purpose: 'Next.js runtime configuration',
                layer: 'scaffold',
                exports: ['default nextConfig'],
                imports: [],
            },
            {
                path: 'prisma/schema.prisma',
                purpose: 'Prisma data model schema with one starter model',
                layer: 'scaffold',
                exports: [],
                imports: [],
            },
            {
                path: 'lib/prisma.ts',
                purpose: 'Singleton Prisma client for server usage',
                layer: 'logic',
                exports: ['prisma'],
                imports: ['@prisma/client'],
            },
            {
                path: 'app/layout.tsx',
                purpose: 'Root app layout for Next.js app router',
                layer: 'ui',
                exports: ['default RootLayout'],
                imports: ['react'],
            },
            {
                path: 'app/page.tsx',
                purpose: 'Home page rendering starter dashboard UI',
                layer: 'ui',
                exports: ['default HomePage'],
                imports: ['react'],
            },
            {
                path: 'app/api/items/route.ts',
                purpose: 'Example API route that returns hardcoded local JSON response',
                layer: 'integration',
                exports: ['GET'],
                imports: ['next/server'],
            },
            {
                path: 'types/index.ts',
                purpose: 'Shared type definitions for app data',
                layer: 'logic',
                exports: ['Item'],
                imports: [],
            },
        ],
        components: ['HomePage'],
        dependencies: recipe?.defaultDependencies ?? ['next', 'react', 'react-dom', 'prisma', '@prisma/client'],
        routing: ['/'],
        typeContracts: [],
        cssVariables: [],
        stateShape: {
            contexts: [],
            hooks: [],
        },
    });

    const nextjsSupabaseAuthPlan = (): ArchitecturePlan => ({
        files: [
            {
                path: 'package.json',
                purpose: 'Project dependencies for Next.js and Supabase auth stack',
                layer: 'scaffold',
                exports: [],
                imports: [],
            },
            {
                path: 'next.config.js',
                purpose: 'Next.js runtime configuration',
                layer: 'scaffold',
                exports: ['default nextConfig'],
                imports: [],
            },
            {
                path: '.env.example',
                purpose: 'Environment variable template for Supabase keys',
                layer: 'scaffold',
                exports: [],
                imports: [],
            },
            {
                path: 'lib/supabase/client.ts',
                purpose: 'Supabase browser client setup',
                layer: 'logic',
                exports: ['createSupabaseBrowserClient'],
                imports: ['@supabase/supabase-js'],
            },
            {
                path: 'app/layout.tsx',
                purpose: 'Root app layout for Next.js app router',
                layer: 'ui',
                exports: ['default RootLayout'],
                imports: ['react'],
            },
            {
                path: 'app/page.tsx',
                purpose: 'Public landing page with links to auth pages',
                layer: 'ui',
                exports: ['default HomePage'],
                imports: ['react'],
            },
            {
                path: 'app/(auth)/login/page.tsx',
                purpose: 'Login page with local form state and submit handler',
                layer: 'ui',
                exports: ['default LoginPage'],
                imports: ['react'],
            },
            {
                path: 'app/(protected)/dashboard/page.tsx',
                purpose: 'Protected dashboard page with placeholder member content',
                layer: 'integration',
                exports: ['default DashboardPage'],
                imports: ['react'],
            },
        ],
        components: ['HomePage', 'LoginPage', 'DashboardPage'],
        dependencies: recipe?.defaultDependencies ?? ['next', 'react', 'react-dom', '@supabase/supabase-js', '@supabase/ssr'],
        routing: ['/', '/(auth)/login', '/(protected)/dashboard'],
        typeContracts: [],
        cssVariables: [],
        stateShape: {
            contexts: [],
            hooks: [],
        },
    });

    const isBeginner = recipe?.id === 'react-spa-beginner';
    if (recipe?.id === 'nextjs-prisma') {
        return nextjsPrismaPlan();
    }
    if (recipe?.id === 'nextjs-supabase-auth') {
        return nextjsSupabaseAuthPlan();
    }
    if (!isBeginner) {
        return basePlan();
    }

    const withComponent = (
        filePath: string,
        componentName: string,
        purpose: string,
        appPurpose: string
    ): ArchitecturePlan => ({
        files: [
            ...baseFiles,
            {
                path: 'src/App.tsx',
                purpose: appPurpose,
                layer: 'ui',
                exports: ['default App'],
                imports: ['react', `./components/${componentName}`],
            },
            {
                path: filePath,
                purpose,
                layer: 'ui',
                exports: [componentName],
                imports: ['react'],
            },
        ],
        components: ['App', componentName],
        dependencies: ['react', 'react-dom'],
        routing: [],
        typeContracts: [],
        cssVariables: [],
        stateShape: {
            contexts: [],
            hooks: [],
        },
    });

    if (/(counter|increment|decrement)/i.test(lowerPrompt)) {
        return withComponent(
            'src/components/Counter.tsx',
            'Counter',
            'Counter component using useState(0) with increment and decrement click handlers',
            'App container that renders Counter and passes simple labels'
        );
    }

    if (/(todo|task|checklist)/i.test(lowerPrompt)) {
        return withComponent(
            'src/components/TodoList.tsx',
            'TodoList',
            'TodoList component using useState<string[]>([]) with add and remove handlers',
            'App container that renders TodoList and static heading'
        );
    }

    if (/(quiz|question|answer)/i.test(lowerPrompt)) {
        return withComponent(
            'src/components/Quiz.tsx',
            'Quiz',
            'Quiz component using useState(0) for currentQuestion, next/prev handlers, and inline QUESTIONS array',
            'App container that renders Quiz and summary text'
        );
    }

    if (/(form|tracker|log|habit)/i.test(lowerPrompt)) {
        return withComponent(
            'src/components/FormTracker.tsx',
            'FormTracker',
            'FormTracker component using useState for form fields with onChange and onSubmit handlers',
            'App container that renders FormTracker and descriptive copy'
        );
    }

    if (/(calculator|calc)/i.test(lowerPrompt)) {
        return withComponent(
            'src/components/Calculator.tsx',
            'Calculator',
            "Calculator component using useState('') for display with button onClick handler",
            'App container that renders Calculator and title'
        );
    }

    return basePlan();
}
