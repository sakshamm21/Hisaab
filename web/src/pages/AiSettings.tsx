import { Sparkles } from 'lucide-react';

import { EmptyState } from '../components/ui';

/** Replaced in Phase 4 with the OpenRouter key, model picker and offline model download. */
export function AiSettings() {
  return (
    <EmptyState icon={Sparkles} title="AI assistant" badge="Phase 4">
      Add your own OpenRouter key here to ask questions about your money, or download an offline model.
    </EmptyState>
  );
}
