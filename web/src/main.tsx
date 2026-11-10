import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';

import { AppShell } from './components/AppShell';
import { PreferencesProvider } from './lib/preferences';
import { Accounts } from './pages/Accounts';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { Bills } from './pages/Bills';
import { Budget } from './pages/Budget';
import { Goals } from './pages/Goals';
import { Reports } from './pages/Reports';
import { Review } from './pages/Review';
import { Settings } from './pages/Settings';
import { Transactions } from './pages/Transactions';
import { Welcome } from './pages/Welcome';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <BrowserRouter>
          <Routes>
            <Route path="welcome" element={<div className="px-4 py-10"><Welcome /></div>} />
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="budget" element={<Budget />} />
              <Route path="reports" element={<Reports />} />
              <Route path="bills" element={<Bills />} />
              <Route path="goals" element={<Goals />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="settings" element={<Settings />} />
              <Route path="import" element={<Import />} />
              <Route path="review" element={<Review />} />
              <Route path="review/:period" element={<Review />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </PreferencesProvider>
    </QueryClientProvider>
  </StrictMode>,
);
