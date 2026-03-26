/**
 * @module core/prompts/css-library
 * @description Embedded production-quality CSS library injected into generation prompts.
 *
 * Instead of instructing the AI how to write CSS, we embed the finished CSS and
 * tell the AI to copy it verbatim. LLMs copy embedded code faithfully, making
 * output deterministic and consistently professional.
 *
 * Two tiers, gated by complexity:
 *   CSS_LIBRARY_BASE  — always included (all apps): buttons, inputs, cards, badges,
 *                       empty states, typography, dark mode, reduced motion (~400 tokens)
 *   CSS_LIBRARY_FULL  — medium/complex apps only: toast, skeleton, modal, table,
 *                       nav header (~300 tokens)
 *
 * Usage: getCSSLibrary(complexity) → BASE | BASE + FULL
 *
 * Dark mode: uses [data-theme="dark"] selector (matches builder's manual toggle).
 * Motion tokens: --dur-fast / --dur-normal / --dur-slow (short form, matches class refs).
 */

import type { ComplexityLevel } from './generation-prompt-utils';

// ─── Base Tier (always-on, all apps) ─────────────────────────────────────────

export const CSS_LIBRARY_BASE = `
/* ============================================================
   CSS LIBRARY BASE — COPY THIS EXACTLY into src/index.css
   Use these classes in components instead of writing new CSS.
   ============================================================ */

/* BUTTON — use .btn + .btn-primary / .btn-secondary / .btn-danger / .btn-ghost */
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;
  border-radius:var(--radius-md);font-size:var(--text-sm);font-weight:500;
  cursor:pointer;border:none;transition:all var(--dur-fast) var(--ease-out);
  text-decoration:none;white-space:nowrap;}
.btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px;}
.btn:disabled{opacity:.5;cursor:not-allowed;pointer-events:none;}
.btn-primary{background:var(--color-primary);color:#fff;}
.btn-primary:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px);box-shadow:var(--shadow-md);}
.btn-primary:active:not(:disabled){transform:translateY(0);filter:brightness(.95);}
.btn-secondary{background:transparent;border:1px solid var(--color-border);color:var(--color-text);}
.btn-secondary:hover:not(:disabled){background:var(--color-surface);border-color:var(--color-border-strong);}
.btn-danger{background:var(--color-error);color:#fff;}
.btn-danger:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px);}
.btn-ghost{background:transparent;color:var(--color-text-secondary);border:none;}
.btn-ghost:hover:not(:disabled){background:var(--color-surface);color:var(--color-text);}
.btn-sm{padding:6px 14px;font-size:var(--text-xs);}
.btn-lg{padding:14px 28px;font-size:var(--text-base);}

/* INPUT — wrap in .input-group for label+hint layout */
.input-group{display:flex;flex-direction:column;gap:6px;}
.input-label{font-size:var(--text-sm);font-weight:500;color:var(--color-text);}
.input{padding:10px 14px;border:1px solid var(--color-border);border-radius:var(--radius-md);
  font-size:var(--text-base);background:var(--color-bg);color:var(--color-text);
  transition:border-color var(--dur-fast),box-shadow var(--dur-fast);outline:none;width:100%;
  font-family:inherit;}
.input:focus{border-color:var(--color-primary);box-shadow:0 0 0 3px var(--color-primary-light);}
.input:disabled{opacity:.5;cursor:not-allowed;background:var(--color-surface);}
.input-error .input{border-color:var(--color-error);box-shadow:0 0 0 3px var(--color-error-light);}
.input-hint{font-size:var(--text-xs);color:var(--color-text-tertiary);}
.input-error-msg{font-size:var(--text-xs);color:var(--color-error);}
textarea.input{resize:vertical;min-height:100px;}

/* CARD */
.card{background:var(--color-surface-raised);border:1px solid var(--color-border);
  border-radius:var(--radius-lg);padding:var(--space-lg);box-shadow:var(--shadow-sm);}
.card-hover{cursor:pointer;transition:all var(--dur-normal) var(--ease-out);}
.card-hover:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);
  border-color:var(--color-border-strong);}

/* BADGE */
.badge{display:inline-flex;align-items:center;padding:2px 10px;font-size:var(--text-xs);
  font-weight:500;border-radius:var(--radius-full);line-height:1.6;}
.badge-success{background:var(--color-success-light);color:var(--color-success);}
.badge-warning{background:var(--color-warning-light);color:var(--color-warning);}
.badge-error{background:var(--color-error-light);color:var(--color-error);}
.badge-primary{background:var(--color-primary-light);color:var(--color-primary);}
.badge-neutral{background:var(--color-surface);color:var(--color-text-secondary);
  border:1px solid var(--color-border);}

/* EMPTY STATE */
.empty-state{display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:var(--space-3xl) var(--space-xl);}
.empty-state__icon{color:var(--color-text-tertiary);margin-bottom:var(--space-md);}
.empty-state__title{font-size:var(--text-lg);font-weight:600;color:var(--color-text);
  margin-bottom:var(--space-xs);}
.empty-state__subtitle{font-size:var(--text-sm);color:var(--color-text-tertiary);
  max-width:320px;line-height:var(--leading-relaxed);margin-bottom:var(--space-lg);}

/* TYPOGRAPHY */
h1{font-size:var(--text-3xl);font-weight:700;letter-spacing:var(--tracking-tight);
   line-height:var(--leading-tight);color:var(--color-text);margin:0 0 var(--space-sm);}
h2{font-size:var(--text-2xl);font-weight:600;letter-spacing:var(--tracking-tight);
   line-height:var(--leading-tight);color:var(--color-text);
   margin:var(--space-2xl) 0 var(--space-md);}
h3{font-size:var(--text-xl);font-weight:600;line-height:var(--leading-tight);
   color:var(--color-text);margin:var(--space-xl) 0 var(--space-sm);}
h4{font-size:var(--text-lg);font-weight:600;color:var(--color-text);
   margin:var(--space-lg) 0 var(--space-xs);}
p{line-height:var(--leading-relaxed);color:var(--color-text-secondary);
  margin:0 0 var(--space-md);}
p:last-child{margin-bottom:0;}
a{color:var(--color-primary);text-decoration:none;}
a:hover{text-decoration:underline;}

/* DARK MODE — uses [data-theme="dark"] (set on <html> via toggle button) */
[data-theme="dark"]{
  --color-bg:#0f172a;       --color-surface:#1e293b;  --color-surface-raised:#334155;
  --color-text:#f1f5f9;     --color-text-secondary:#94a3b8; --color-text-tertiary:#64748b;
  --color-border:#334155;   --color-border-strong:#475569;
  --color-primary-light:rgba(37,99,235,.2); --color-primary-ghost:rgba(37,99,235,.1);
  --color-error-light:rgba(220,38,38,.15);  --color-success-light:rgba(22,163,74,.15);
  --color-warning-light:rgba(217,119,6,.15);
  --shadow-sm:0 1px 3px rgba(0,0,0,.3);  --shadow-md:0 4px 6px rgba(0,0,0,.3);
  --shadow-lg:0 10px 15px rgba(0,0,0,.35); --shadow-xl:0 20px 25px rgba(0,0,0,.4);
}

/* REDUCED MOTION */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;}}
`;

// ─── Full Tier (medium/complex apps — appended after BASE) ────────────────────

export const CSS_LIBRARY_FULL = `
/* ============================================================
   CSS LIBRARY FULL — append after BASE in src/index.css
   Use for medium/complex apps with toasts, modals, tables.
   ============================================================ */

/* TOAST — render <div class="toast-container"> at App root */
.toast-container{position:fixed;bottom:24px;right:24px;z-index:200;
  display:flex;flex-direction:column;gap:8px;pointer-events:none;}
.toast{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;
  background:var(--color-surface-raised);border:1px solid var(--color-border);
  border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);
  min-width:300px;max-width:420px;pointer-events:all;
  animation:toast-in var(--dur-normal) var(--ease-out);}
.toast__icon{flex-shrink:0;margin-top:1px;}
.toast__body{flex:1;}
.toast__title{font-size:var(--text-sm);font-weight:600;color:var(--color-text);
  margin-bottom:2px;}
.toast__msg{font-size:var(--text-xs);color:var(--color-text-secondary);}
.toast__close{flex-shrink:0;background:none;border:none;cursor:pointer;
  color:var(--color-text-tertiary);padding:0;line-height:1;}
.toast--success{border-left:3px solid var(--color-success);}
.toast--error{border-left:3px solid var(--color-error);}
.toast--warning{border-left:3px solid var(--color-warning);}
.toast--info{border-left:3px solid var(--color-primary);}
@keyframes toast-in{from{transform:translateY(16px);opacity:0;}}

/* SKELETON */
.skeleton{background:linear-gradient(90deg,
  var(--color-surface) 25%,var(--color-border) 50%,var(--color-surface) 75%);
  background-size:200% 100%;animation:shimmer 1.5s infinite;
  border-radius:var(--radius-md);}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skeleton-text{height:14px;margin-bottom:8px;}
.skeleton-text:last-child{width:60%;}
.skeleton-title{height:24px;width:50%;margin-bottom:12px;}
.skeleton-avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;}
.skeleton-card{height:120px;}

/* MODAL */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);
  backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;
  animation:fade-in var(--dur-fast) var(--ease-out);}
.modal-panel{background:var(--color-bg);border-radius:var(--radius-xl);
  box-shadow:var(--shadow-xl);width:100%;max-width:480px;
  max-height:calc(100vh - 64px);overflow-y:auto;
  animation:slide-up var(--dur-normal) var(--ease-out);}
.modal-header{display:flex;align-items:center;justify-content:space-between;
  padding:var(--space-xl) var(--space-xl) 0;}
.modal-title{font-size:var(--text-xl);font-weight:600;color:var(--color-text);}
.modal-close{background:none;border:none;cursor:pointer;color:var(--color-text-tertiary);
  padding:4px;border-radius:var(--radius-sm);transition:color var(--dur-fast);}
.modal-close:hover{color:var(--color-text);}
.modal-body{padding:var(--space-lg) var(--space-xl);}
.modal-footer{display:flex;gap:var(--space-sm);justify-content:flex-end;
  padding:0 var(--space-xl) var(--space-xl);
  margin-top:var(--space-lg);border-top:1px solid var(--color-border);
  padding-top:var(--space-lg);}
@keyframes fade-in{from{opacity:0}}
@keyframes slide-up{from{transform:translateY(16px);opacity:0;}}

/* Mobile modal → bottom sheet */
@media(max-width:640px){
  .modal-backdrop{align-items:flex-end;padding:0;}
  .modal-panel{border-radius:var(--radius-xl) var(--radius-xl) 0 0;max-height:90vh;
    max-width:100%;}
}

/* TABLE */
.table-container{border:1px solid var(--color-border);border-radius:var(--radius-lg);
  overflow:hidden;background:var(--color-surface-raised);}
.table{width:100%;border-collapse:collapse;}
.table-header-row th{background:var(--color-surface);font-size:var(--text-xs);font-weight:600;
  text-transform:uppercase;letter-spacing:var(--tracking-wide);
  color:var(--color-text-tertiary);padding:12px 16px;text-align:left;
  border-bottom:1px solid var(--color-border);}
.table-row td{padding:14px 16px;border-bottom:1px solid var(--color-border);
  font-size:var(--text-sm);color:var(--color-text);
  transition:background var(--dur-fast);}
.table-row:last-child td{border-bottom:none;}
.table-row:hover td{background:var(--color-surface);}

/* NAV HEADER */
.nav-header{position:sticky;top:0;z-index:40;height:64px;
  background:var(--color-bg);opacity:0.97;
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--color-border);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 var(--space-xl);}
.nav-header__brand{font-size:var(--text-lg);font-weight:700;
  color:var(--color-text);text-decoration:none;}
.nav-header__links{display:flex;align-items:center;gap:var(--space-xs);}
.nav-link{font-size:var(--text-sm);color:var(--color-text-secondary);
  padding:6px 12px;border-radius:var(--radius-md);
  transition:color var(--dur-fast),background var(--dur-fast);text-decoration:none;}
.nav-link:hover{color:var(--color-text);background:var(--color-surface);}
.nav-link--active{color:var(--color-primary);background:var(--color-primary-ghost);}
`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the CSS library string to inject into the generation prompt.
 *
 * Complexity gating:
 *   'simple'  → BASE only (buttons, inputs, cards, badges, empty states, dark mode)
 *   'medium'  → BASE + FULL (+ toast, skeleton, modal, table, nav)
 *   'complex' → BASE + FULL
 *
 * The complexity argument should come from detectComplexity() in generation-prompt-utils.ts.
 */
export function getCSSLibrary(complexity: ComplexityLevel): string {
  if (complexity === 'medium' || complexity === 'complex') {
    return CSS_LIBRARY_BASE + CSS_LIBRARY_FULL;
  }
  return CSS_LIBRARY_BASE;
}

/**
 * Returns the instruction block telling the AI how to use the CSS library.
 * Inject this alongside getCSSLibrary() in the generation prompt.
 */
export function getCSSLibraryInstruction(complexity: ComplexityLevel): string {
  const tier = complexity === 'simple' ? 'BASE' : 'BASE + FULL';
  const classHint = complexity === 'simple'
    ? '`.btn`, `.card`, `.badge`, `.input`, `.empty-state`'
    : '`.btn`, `.card`, `.badge`, `.input`, `.empty-state`, `.toast`, `.skeleton`, `.modal-*`, `.table-*`, `.nav-header`';

  return `=== CSS LIBRARY (${tier}) — USE THESE CLASSES, DO NOT REINVENT ===
The CSS library above is already written. COPY IT EXACTLY into \`src/index.css\`.
In your components, USE the pre-written classes: ${classHint}.
Do NOT write new CSS that duplicates what the library already provides.
NEVER hardcode colors, shadows, or spacing — always use var(--token) references.
Dark mode is handled automatically by \`[data-theme="dark"]\` on the root element — add a toggle button that calls: document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')`;
}
