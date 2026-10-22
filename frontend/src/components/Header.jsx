import { useState } from 'react';
import { FileText, Moon, Sun } from 'lucide-react';
import { T } from '../lib/terminology';

export default function Header() {
  // main.jsx applies the saved theme before first render; this just mirrors it.
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* storage unavailable */ }
    setDark(next);
  };

  const label = dark ? T.app.lightMode : T.app.darkMode;
  const Icon = dark ? Sun : Moon;

  return (
    <header className="bg-primary text-on-primary border-b-2 border-accent-light">
      <div className="mx-auto w-full max-w-(--container-content) px-4 md:px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 shrink-0 text-accent-light" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold">{T.app.name}</h1>
            <p className="text-sm text-on-primary-muted">{T.app.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={dark}
            title={label}
            className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-primary-hover focus-visible:outline-on-primary"
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
