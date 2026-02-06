

# Plan: Welcome Landing Page

## Overview

Create a beautiful welcome/landing page as the entry point to the AI App Builder. Users will see this page first, then click "Go to App" to access the code editor interface.

---

## Page Structure

```text
+------------------------------------------------------------------+
|  [Logo] AI App Builder                          [Go to App →]    |  <- Fixed header
+------------------------------------------------------------------+
|                                                                   |
|                        [Animated Logo]                            |
|                                                                   |
|              Build apps with AI in seconds                        |
|         Describe your idea and watch it come to life              |
|                                                                   |
|                    [Get Started →]                                |
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
|     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          |
|     │  🎨        │   │  ⚡         │   │  📦         │          |
|     │  Live      │   │  Fast       │   │  Export     │          |
|     │  Preview   │   │  Generation │   │  Ready      │          |
|     └─────────────┘   └─────────────┘   └─────────────┘          |
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
|     "Create a dashboard"  "Build a landing page"                  |
|     "Make a task manager"  "Design a product catalog"             |
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
|                   © 2024 AI App Builder                           |
+------------------------------------------------------------------+
```

---

## Architecture

Add simple state-based routing (no external router needed):

```text
App.tsx
├── currentPage === 'welcome' → <WelcomePage />
└── currentPage === 'builder' → <AppLayout />
```

---

## Implementation Details

### 1. New Welcome Page Component

**File: `src/pages/WelcomePage.tsx`**

| Section | Content |
|---------|---------|
| Header | Logo, title, "Go to App" button (top-right) |
| Hero | Large animated logo, headline, subheadline, CTA button |
| Features | 3 feature cards (Live Preview, Fast Generation, Export Ready) |
| Examples | 4 example prompts in 2x2 grid (reuse existing suggestions) |
| Footer | Simple copyright |

**Styling File: `src/pages/WelcomePage.css`**

### 2. Update App.tsx

Add simple page state management:

```text
const [currentPage, setCurrentPage] = useState<'welcome' | 'builder'>('welcome');

return currentPage === 'welcome' 
  ? <WelcomePage onEnterApp={() => setCurrentPage('builder')} />
  : <AppLayout />
```

### 3. Visual Design Elements

**Hero Section:**
- Large animated logo with gradient glow pulse animation
- Gradient text headline: "Build apps with AI in seconds"
- Muted subheadline text
- Primary CTA button with hover animation

**Feature Cards:**
| Feature | Icon | Description |
|---------|------|-------------|
| Live Preview | 🎨 | See changes instantly as you describe |
| Fast Generation | ⚡ | Complete apps in seconds, not hours |
| Export Ready | 📦 | Download your project as a ZIP file |

**Example Prompts:**
- Reuse the existing 4 suggestions from `prompt-suggestions.ts`
- Cards link to builder with pre-filled prompt

**Animations:**
- Logo: Subtle float animation + glow pulse
- Cards: Hover lift effect
- CTA: Scale on hover
- Page transition: Fade between welcome and builder

---

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/WelcomePage.tsx` | Create | Welcome page component |
| `src/pages/WelcomePage.css` | Create | Welcome page styles |
| `src/pages/index.ts` | Create | Export pages |
| `src/App.tsx` | Modify | Add page routing state |

---

## Visual Specifications

### Colors & Gradients
- Background: Mesh gradient (subtle purple/blue hints)
- Logo glow: Uses existing `--gradient-primary`
- Cards: Glass effect with `backdrop-filter: blur()`

### Typography
- Hero headline: 3rem, bold, gradient text
- Subheadline: 1.25rem, muted color
- Feature titles: 1rem, medium weight

### Spacing
- Hero section: Centered, generous vertical padding
- Feature cards: 24px gap, max-width container
- Consistent 16px/24px padding rhythm

### Responsive
- Mobile: Stack features vertically, smaller headline
- Tablet: 3 features in row
- Desktop: Full layout with animations

---

## User Flow

```text
1. User lands on Welcome Page
2. Options:
   a) Click "Go to App" in header → Enter builder (empty state)
   b) Click "Get Started" CTA → Enter builder (empty state)
   c) Click example prompt → Enter builder with prompt pre-filled
3. Builder loads with ChatProvider, ready to generate
```

