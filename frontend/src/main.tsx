import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import './index.css';
import { ScrollToTop } from './components/ScrollToTop';
import Home from './pages/Home';
import CupDetail from './pages/CupDetail';
import NotFound from './pages/NotFound';

// Adminpanelen (~900 rader) och Recharts laddades tidigare av varje besökare,
// trots att de bara används bakom inloggning. Lazy-laddade hamnar de i egna
// chunks som bara hämtas när någon faktiskt går till /admin.
const Admin = lazy(() => import('./pages/Admin'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));

function RouteFallback() {
  return (
    <div className="flex justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-[#AB2328]" aria-label="Laddar" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cups/:id" element={<CupDetail />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
