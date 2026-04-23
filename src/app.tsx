import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense } from 'solid-js';

export default function App() {
  return (
    <Router base={import.meta.env.SERVER_BASE_URL}>
      <Suspense>
        <FileRoutes />
      </Suspense>
    </Router>
  );
}
