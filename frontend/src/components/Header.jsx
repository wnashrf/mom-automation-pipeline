import { FileText } from 'lucide-react';
import { T } from '../lib/terminology';

export default function Header() {
  return (
    <header className="bg-primary text-on-primary border-b-2 border-accent-light">
      <div className="mx-auto w-full max-w-(--container-content) px-4 md:px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 shrink-0 text-accent-light" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold">{T.app.name}</h1>
            <p className="text-sm text-on-primary-muted">{T.app.subtitle}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
